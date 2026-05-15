import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  DraftQueueDetailResponseSchema,
  DraftQueueResponseSchema,
  type AuthMe,
  type DraftQueueDetail,
  type DraftQueueItem,
  type DraftQueueQuery,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createClientDraftQueueRoutes } from "../routes/client/draft-queue.js";
import {
  createDraftQueueService,
  type DraftQueueListResult,
  type DraftQueueService,
} from "../services/draft-queue.service.js";
import type { AuthService } from "../services/auth.js";
import type {
  DraftQueueDraftRow,
  DraftQueueRepository,
  DraftQueueRows,
} from "../repositories/draft-queue.repository.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const now = new Date("2026-05-15T12:00:00.000Z");
const workspaceId = testUser.workspaceId;
const draftId = "00000000-0000-4000-8000-000000023aa1";
const leadId = "00000000-0000-4000-8000-000000023aa2";
const otherDraftId = "00000000-0000-4000-8000-000000023aa3";
const fullBody = "Full generated draft body ".repeat(40).trim();

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    ...extra,
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function queueItem(overrides: Partial<DraftQueueItem> = {}): DraftQueueItem {
  return {
    draftId,
    leadId,
    createdAt: "2026-05-15T10:00:00.000Z",
    score: {
      scoreBand: "hot",
      score: 86,
      confidence: 72,
      recommendedAction: "Call today and prepare the quote follow-up.",
      urgency: "high",
      intent: "urgent_service_intent",
    },
    contextSummary: {
      companyName: "Aqua Nord",
      sector: "Plomberie",
      language: "fr",
      contactKnown: true,
      previousLeadCount: 1,
      riskFlags: ["duplicate_risk"],
    },
    draftPreview: {
      hasSubject: true,
      hasBodyText: true,
      subjectPreview: "Intervention plomberie",
      bodyPreview: "Bonjour, merci pour votre demande.",
      tone: null,
      language: "fr",
    },
    gmailExport: {
      exportStatus: "requested",
      canExport: true,
      blockingReasons: [],
      exportedAt: null,
    },
    actions: {
      canRequestGmailExport: false,
      canCancelGmailExportRequest: true,
      canViewGmailExportStatus: true,
    },
    reviewStatus: "pending_review",
    attentionFlags: ["high_score", "urgent_action", "duplicate_risk"],
    ...overrides,
  };
}

function queueDetail(overrides: Partial<DraftQueueDetail> = {}): DraftQueueDetail {
  return {
    ...queueItem(),
    proposedDraft: {
      subject: "Intervention plomberie",
      bodyText: fullBody,
      tone: null,
      language: "fr",
      generatedAt: "2026-05-15T10:00:00.000Z",
    },
    ...overrides,
  };
}

function queueService(overrides: Partial<DraftQueueService> = {}): DraftQueueService {
  const item = queueItem();

  return {
    listDraftQueue: vi.fn(async (_workspaceId: string, query: DraftQueueQuery) => {
      const allItems = [item];
      const items = query.attentionRequired === false ? [] : allItems;

      return {
        items,
        summary: {
          pendingReview: 1,
          readyForGmailExport: 1,
          exported: 0,
          blocked: 0,
          attentionRequired: 1,
        },
        limit: query.limit,
        offset: query.offset,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: items.length,
        },
        generatedAt: now.toISOString(),
      };
    }),
    getDraftQueueDetail: vi.fn(async () => ({ result: "ok" as const, detail: queueDetail() })),
    ...overrides,
  };
}

function createDraftQueueApp(
  service: DraftQueueService = queueService(),
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/client/draft-queue",
    createClientDraftQueueRoutes({
      authService: authServiceFor(user),
      draftQueueService: service,
    }),
  );
  return app;
}

function assertNoForbiddenKeys(value: unknown, options: { allowDetailBody?: boolean } = {}) {
  const forbidden = new Set([
    "workspaceId",
    "workspace_id",
    "contactEmail",
    "fromEmail",
    "toEmail",
    "recipientEmail",
    "normalized_json",
    "metadata_json",
    "metadataJson",
    "payload_json",
    "payloadJson",
    "prompt",
    "output",
    "providerMessageId",
    "provider_message_id",
    "providerPayload",
    "leaseToken",
    "apiKey",
    "plaintextApiKey",
    "keyHash",
    "threadId",
    "messageId",
    "externalId",
  ]);

  function visit(current: unknown, path: string[]) {
    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, [...path, String(index)]));
      return;
    }

    if (!current || typeof current !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(current)) {
      const joined = [...path, key].join(".");

      if (options.allowDetailBody && joined.endsWith("proposedDraft.bodyText")) {
        visit(child, [...path, key]);
        continue;
      }

      expect(forbidden.has(key), `forbidden key ${joined}`).toBe(false);
      visit(child, [...path, key]);
    }
  }

  visit(value, []);
}

function baseDraft(overrides: Partial<DraftQueueDraftRow> = {}): DraftQueueDraftRow {
  return {
    draftId,
    leadId,
    status: "draft",
    channel: "email",
    subject: "A".repeat(150),
    textBody: fullBody,
    createdAt: new Date("2026-05-15T10:00:00.000Z"),
    updatedAt: new Date("2026-05-15T10:00:00.000Z"),
    metadataJson: {
      origin: "ai_draft_generation",
      gmailExport: {
        requestedAt: "2026-05-15T10:05:00.000Z",
        requestExpiresAt: "2026-05-16T10:05:00.000Z",
      },
    },
    leadContactId: "00000000-0000-4000-8000-000000023ab1",
    draftContactId: null,
    recipientAddress: "client@example.test",
    ...overrides,
  };
}

function rows(overrides: Partial<DraftQueueRows> = {}): DraftQueueRows {
  return {
    drafts: [baseDraft()],
    latestScoresByLeadId: {
      [leadId]: {
        id: "00000000-0000-4000-8000-000000023ac1",
        leadId,
        score: 86,
        qualification: "hot",
        recommendedAction: "Call today and prepare the quote follow-up.",
        confidence: 72,
        createdAt: new Date("2026-05-15T09:30:00.000Z"),
      },
    },
    latestClassificationsByLeadId: {
      [leadId]: {
        leadId,
        classification: "leadable",
        category: "service",
        action: "create_lead",
        confidence: "high",
        reasonCode: "urgent_service_intent",
        suggestedLabels: ["urgent"],
        createdAt: new Date("2026-05-15T09:00:00.000Z"),
      },
    },
    previousLeadCountsByLeadId: {
      [leadId]: 1,
    },
    workspaceContext: {
      companyName: "Aqua Nord",
      sector: "Plomberie",
      language: "fr",
    },
    ...overrides,
  };
}

function repository(rowSet: DraftQueueRows = rows()): DraftQueueRepository {
  return {
    listRows: vi.fn(async () => rowSet),
    findDetailRows: vi.fn(async () => rowSet),
  };
}

describe("client draft queue routes", () => {
  it("returns 401 without session for list and detail", async () => {
    const service = queueService();
    const app = createDraftQueueApp(service);

    expect((await app.request("/api/client/draft-queue")).status).toBe(401);
    expect((await app.request(`/api/client/draft-queue/${draftId}`)).status).toBe(401);
    expect(service.listDraftQueue).not.toHaveBeenCalled();
    expect(service.getDraftQueueDetail).not.toHaveBeenCalled();
  });

  it("rejects API key-only auth", async () => {
    const response = await createDraftQueueApp().request("/api/client/draft-queue", {
      headers: { authorization: "Bearer syr_live_test" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin sessions", async () => {
    const service = queueService();
    const response = await createDraftQueueApp(service, { ...testUser, role: "operator" }).request(
      "/api/client/draft-queue",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(service.listDraftQueue).not.toHaveBeenCalled();
  });

  it("returns a safe empty list DTO", async () => {
    const service = queueService({
      listDraftQueue: vi.fn(
        async (_workspaceId, query): Promise<DraftQueueListResult> => ({
          items: [],
          summary: {
            pendingReview: 0,
            readyForGmailExport: 0,
            exported: 0,
            blocked: 0,
            attentionRequired: 0,
          },
          limit: query.limit,
          offset: query.offset,
          pagination: {
            limit: query.limit,
            offset: query.offset,
            total: 0,
          },
          generatedAt: now.toISOString(),
        }),
      ),
    });
    const response = await createDraftQueueApp(service).request("/api/client/draft-queue", {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(DraftQueueResponseSchema.parse(body)).toEqual(body);
    expect(body.data.items).toEqual([]);
    expect(body.data.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
    expect(body.data.summary.pendingReview).toBe(0);
    expect(service.listDraftQueue).toHaveBeenCalledWith(workspaceId, {
      limit: 20,
      offset: 0,
    });
    assertNoForbiddenKeys(body);
  });

  it("returns safe list and detail DTOs", async () => {
    const app = createDraftQueueApp();
    const listResponse = await app.request("/api/client/draft-queue", {
      headers: validSessionHeaders(),
    });
    const detailResponse = await app.request(`/api/client/draft-queue/${draftId}`, {
      headers: validSessionHeaders(),
    });
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(DraftQueueResponseSchema.parse(listBody)).toEqual(listBody);
    expect(DraftQueueDetailResponseSchema.parse(detailBody)).toEqual(detailBody);
    expect(listBody.data.items[0].actions).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: true,
      canViewGmailExportStatus: true,
    });
    expect(detailBody.data.actions).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: true,
      canViewGmailExportStatus: true,
    });
    expect(listBody.data.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(JSON.stringify(listBody)).not.toContain(fullBody);
    expect(detailBody.data.proposedDraft.bodyText).toBe(fullBody);
    assertNoForbiddenKeys(listBody);
    assertNoForbiddenKeys(detailBody, { allowDetailBody: true });
  });

  it("passes filters and pagination to the service", async () => {
    const service = queueService();
    const response = await createDraftQueueApp(service).request(
      "/api/client/draft-queue?limit=5&offset=10&scoreBand=hot&exportStatus=requested&attentionRequired=true",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(200);
    expect(service.listDraftQueue).toHaveBeenCalledWith(workspaceId, {
      limit: 5,
      offset: 10,
      scoreBand: "hot",
      exportStatus: "requested",
      attentionRequired: true,
    });
  });

  it("rejects client-provided workspace selectors", async () => {
    const response = await createDraftQueueApp().request(
      "/api/client/draft-queue?workspaceId=00000000-0000-4000-8000-000000023fff",
      {
        headers: validSessionHeaders({ "x-workspace-id": "00000000-0000-4000-8000-000000023ffe" }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for cross-workspace or missing draft detail", async () => {
    const service = queueService({
      getDraftQueueDetail: vi.fn(async () => ({ result: "not_found" as const })),
    });
    const response = await createDraftQueueApp(service).request(
      `/api/client/draft-queue/${otherDraftId}`,
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(404);
  });
});

describe("client draft queue service", () => {
  it("maps workspace drafts into safe queue items and full detail", async () => {
    const service = createDraftQueueService(repository(), () => now);
    const list = await service.listDraftQueue(workspaceId, { limit: 20, offset: 0 });
    const detail = await service.getDraftQueueDetail(workspaceId, draftId);

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.draftPreview.subjectPreview).toHaveLength(120);
    expect(list.items[0]?.draftPreview.bodyPreview?.length).toBeLessThanOrEqual(280);
    expect(list.items[0]?.score.scoreBand).toBe("hot");
    expect(list.items[0]?.gmailExport.exportStatus).toBe("requested");
    expect(list.items[0]?.gmailExport.canExport).toBe(true);
    expect(list.items[0]?.actions).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: true,
      canViewGmailExportStatus: true,
    });
    expect(list.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(list.items[0]?.attentionFlags).toEqual(
      expect.arrayContaining(["high_score", "urgent_action", "duplicate_risk"]),
    );
    expect(JSON.stringify(list)).not.toContain(fullBody);

    expect(detail.result).toBe("ok");
    if (detail.result === "ok") {
      expect(detail.detail.proposedDraft.bodyText).toBe(fullBody);
      assertNoForbiddenKeys({ success: true, data: detail.detail }, { allowDetailBody: true });
    }
  });

  it("derives safe Gmail export action capabilities", async () => {
    const draftRows = [
      baseDraft({ metadataJson: { origin: "ai_draft_generation" } }),
      baseDraft(),
      baseDraft({
        metadataJson: {
          origin: "ai_draft_generation",
          gmailExport: {
            requestedAt: "2026-05-15T10:05:00.000Z",
            requestExpiresAt: "2026-05-16T10:05:00.000Z",
            leaseToken: "secret-lease-token",
            leaseExpiresAt: "2026-05-15T12:10:00.000Z",
          },
        },
      }),
      baseDraft({
        metadataJson: {
          origin: "ai_draft_generation",
          gmailExport: {
            status: "exported",
            exportedAt: "2026-05-15T10:20:00.000Z",
          },
        },
      }),
      baseDraft({
        textBody: null,
        metadataJson: { origin: "ai_draft_generation" },
      }),
    ].map((row, index) => ({
      ...row,
      draftId: `00000000-0000-4000-8000-000000023b${index}1`,
      leadId,
    }));
    const service = createDraftQueueService(repository(rows({ drafts: draftRows })), () => now);
    const list = await service.listDraftQueue(workspaceId, { limit: 20, offset: 0 });
    const actionsByDraftId = new Map(
      list.items.map((item) => [item.draftId, item.actions] as const),
    );

    expect(actionsByDraftId.get("00000000-0000-4000-8000-000000023b01")).toEqual({
      canRequestGmailExport: true,
      canCancelGmailExportRequest: false,
      canViewGmailExportStatus: true,
    });
    expect(actionsByDraftId.get("00000000-0000-4000-8000-000000023b11")).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: true,
      canViewGmailExportStatus: true,
    });
    expect(actionsByDraftId.get("00000000-0000-4000-8000-000000023b21")).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: false,
      canViewGmailExportStatus: true,
    });
    expect(actionsByDraftId.get("00000000-0000-4000-8000-000000023b31")).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: false,
      canViewGmailExportStatus: true,
    });
    expect(actionsByDraftId.get("00000000-0000-4000-8000-000000023b41")).toEqual({
      canRequestGmailExport: false,
      canCancelGmailExportRequest: false,
      canViewGmailExportStatus: true,
    });
  });

  it("filters by score band, export status, attention flag, limit, and offset", async () => {
    const coldDraft = baseDraft({
      draftId: otherDraftId,
      leadId: "00000000-0000-4000-8000-000000023bb2",
      createdAt: new Date("2026-05-15T11:00:00.000Z"),
      metadataJson: { origin: "ai_draft_generation" },
      recipientAddress: null,
    });
    const service = createDraftQueueService(
      repository(
        rows({
          drafts: [baseDraft(), coldDraft],
          latestScoresByLeadId: {
            [leadId]: rows().latestScoresByLeadId[leadId]!,
            [coldDraft.leadId!]: {
              id: "00000000-0000-4000-8000-000000023bc1",
              leadId: coldDraft.leadId!,
              score: 20,
              qualification: "cold",
              recommendedAction: "Review later.",
              confidence: 80,
              createdAt: new Date("2026-05-15T10:30:00.000Z"),
            },
          },
          previousLeadCountsByLeadId: {
            [leadId]: 1,
            [coldDraft.leadId!]: 0,
          },
        }),
      ),
      () => now,
    );

    expect(
      (await service.listDraftQueue(workspaceId, { limit: 20, offset: 0, scoreBand: "hot" })).items,
    ).toHaveLength(1);
    expect(
      (await service.listDraftQueue(workspaceId, { limit: 20, offset: 0, exportStatus: "blocked" }))
        .items,
    ).toHaveLength(1);
    expect(
      (await service.listDraftQueue(workspaceId, { limit: 20, offset: 0, attentionRequired: true }))
        .items.length,
    ).toBeGreaterThan(0);
    expect((await service.listDraftQueue(workspaceId, { limit: 1, offset: 1 })).items).toHaveLength(
      1,
    );
  });

  it("returns no detail for non-generated drafts", async () => {
    const service = createDraftQueueService(
      repository(rows({ drafts: [baseDraft({ metadataJson: {} })] })),
      () => now,
    );

    await expect(service.getDraftQueueDetail(workspaceId, draftId)).resolves.toEqual({
      result: "not_found",
    });
  });

  it("does not mutate side-effect counters or call providers", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const counts = {
      drafts: 1,
      leads: 1,
      activity_logs: 0,
      background_jobs: 0,
      email_sends: 0,
      approvals: 0,
    };
    const before = { ...counts };
    const service = createDraftQueueService(repository(), () => now);

    await service.listDraftQueue(workspaceId, { limit: 20, offset: 0 });
    await service.getDraftQueueDetail(workspaceId, draftId);

    expect(counts).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not include forbidden response keys", async () => {
    const service = createDraftQueueService(repository(), () => now);
    const list = await service.listDraftQueue(workspaceId, { limit: 20, offset: 0 });
    const detail = await service.getDraftQueueDetail(workspaceId, draftId);

    assertNoForbiddenKeys({ success: true, data: list });
    if (detail.result === "ok") {
      assertNoForbiddenKeys({ success: true, data: detail.detail }, { allowDetailBody: true });
      expect(JSON.stringify(detail.detail)).not.toContain("Raw inbound email body");
      expect(JSON.stringify(detail.detail)).not.toContain("secret-lease-token");
    }
  });
});

describe("client draft queue source guardrails", () => {
  it("does not add provider calls or mutation routes in the draft queue path", () => {
    const routeSource = readFileSync("src/routes/client/draft-queue.ts", "utf8");
    const serviceSource = readFileSync("src/services/draft-queue.service.ts", "utf8");
    const repositorySource = readFileSync("src/repositories/draft-queue.repository.ts", "utf8");
    const combined = `${routeSource}\n${serviceSource}\n${repositorySource}`;

    expect(routeSource).not.toContain("routes.post");
    expect(combined).not.toContain("OpenRouter");
    expect(combined).not.toContain("GmailApp");
    expect(combined).not.toContain("google-auth-library");
    expect(combined).not.toContain("Resend");
    expect(combined).not.toContain("fetch(");
    expect(combined).not.toContain("createActivityLog");
    expect(combined).not.toContain("insert(emailSends");
    expect(combined).not.toContain("insert(approvals");
  });
});
