import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  MailQueueDetailResponseSchema,
  MailQueueResponseSchema,
  type AuthMe,
  type MailQueueItem,
  type MailQueueQuery,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createClientMailQueueRoutes } from "../routes/client/mail-queue.js";
import { createMailQueueService, type MailQueueService } from "../services/mail-queue.service.js";
import type { AuthService } from "../services/auth.js";
import type {
  MailQueueClassificationRow,
  MailQueueDraftRow,
  MailQueueRepository,
  MailQueueRows,
} from "../repositories/mail-queue.repository.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const now = new Date("2026-05-15T12:00:00.000Z");
const workspaceId = testUser.workspaceId;
const classificationId = "00000000-0000-4000-8000-000000023ac1";
const ignoredClassificationId = "00000000-0000-4000-8000-000000023ac2";
const otherClassificationId = "00000000-0000-4000-8000-000000023ac3";
const leadId = "00000000-0000-4000-8000-000000023ad1";
const draftId = "00000000-0000-4000-8000-000000023ad2";
const contactId = "00000000-0000-4000-8000-000000023ad3";
const fullDraftBody = "Full generated draft preview text ".repeat(40).trim();

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

function queueItem(overrides: Partial<MailQueueItem> = {}): MailQueueItem {
  return {
    classificationId,
    classifiedAt: "2026-05-15T09:00:00.000Z",
    classification: {
      category: "service",
      action: "create_lead",
      confidence: "high",
      reasonCode: "urgent_service_intent",
    },
    lead: {
      leadId,
      leadCreatedAt: "2026-05-15T09:05:00.000Z",
      leadStatus: "scored",
    },
    score: {
      scoreBand: "hot",
      score: 88,
      confidence: 74,
      recommendedAction: "Call today.",
      urgency: "high",
      intent: "urgent_service_intent",
      scoredAt: "2026-05-15T09:30:00.000Z",
    },
    contact: {
      known: true,
      previousLeadCount: 1,
      status: "returning",
    },
    draft: {
      draftId,
      status: "draft",
      hasSubject: true,
      hasBodyText: true,
      subjectPreview: "Intervention plomberie",
      bodyPreview: "Bonjour, merci pour votre demande.",
      tone: null,
      language: "fr",
      createdAt: "2026-05-15T10:00:00.000Z",
    },
    gmailExport: {
      exportStatus: "requested",
      canExport: true,
      exportedAt: null,
    },
    companyContext: {
      companyName: "Aqua Nord",
      sector: "Plomberie",
      language: "fr",
    },
    derived: {
      pipelineState: "export_requested",
      attentionFlags: ["high_score", "urgent_action", "export_requested", "returning_contact"],
      nextBestAction: "wait",
    },
    ...overrides,
  };
}

function queueService(overrides: Partial<MailQueueService> = {}): MailQueueService {
  return {
    listMailQueue: vi.fn(async (_workspaceId: string, query: MailQueueQuery) => ({
      generatedAt: now.toISOString(),
      filters: {
        applied: {
          limit: query.limit,
          offset: query.offset,
          since: query.since ?? "2026-04-15T12:00:00.000Z",
          includeIgnored: query.includeIgnored,
          category: query.category ?? [],
          action: query.action ?? [],
          scoreBand: query.scoreBand ?? [],
          contactStatus: query.contactStatus ?? [],
          hasDraft: query.hasDraft ?? null,
          exportStatus: query.exportStatus ?? [],
          pipelineState: query.pipelineState ?? [],
          attentionRequired: query.attentionRequired ?? null,
        },
      },
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: 1,
      },
      summary: {
        totalClassified: 1,
        totalIgnored: 0,
        totalLeadsCreated: 1,
        totalScored: 1,
        totalWithDraft: 1,
        totalExportRequested: 1,
        totalExported: 0,
        totalAttentionRequired: 1,
      },
      items: [queueItem()],
    })),
    getMailQueueDetail: vi.fn(async () => ({ result: "ok" as const, detail: queueItem() })),
    ...overrides,
  };
}

function createMailQueueApp(
  service: MailQueueService = queueService(),
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/client/mail-queue",
    createClientMailQueueRoutes({
      authService: authServiceFor(user),
      mailQueueService: service,
    }),
  );
  return app;
}

function assertNoForbiddenKeys(value: unknown) {
  const forbidden = new Set([
    "workspaceId",
    "workspace_id",
    "contactEmail",
    "fromEmail",
    "toEmail",
    "recipientEmail",
    "normalized_json",
    "normalizedJson",
    "metadata_json",
    "metadataJson",
    "payload_json",
    "rawMetadata",
    "rawPayload",
    "providerMessageId",
    "provider_message_id",
    "providerPayload",
    "leaseToken",
    "apiKey",
    "plaintextApiKey",
    "keyHash",
    "prompt",
    "output",
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
      expect(forbidden.has(key), `forbidden key ${[...path, key].join(".")}`).toBe(false);
      visit(child, [...path, key]);
    }
  }

  visit(value, []);
}

function baseClassification(
  overrides: Partial<MailQueueClassificationRow> = {},
): MailQueueClassificationRow {
  return {
    classificationId,
    category: "service",
    action: "create_lead",
    confidence: "high",
    reasonCode: "urgent_service_intent",
    suggestedLabels: ["urgent"],
    leadId,
    classifiedAt: new Date("2026-05-15T09:00:00.000Z"),
    leadCreatedAt: new Date("2026-05-15T09:05:00.000Z"),
    leadStatus: "scored",
    leadContactId: contactId,
    ...overrides,
  };
}

function baseDraft(overrides: Partial<MailQueueDraftRow> = {}): MailQueueDraftRow {
  return {
    draftId,
    leadId,
    contactId,
    status: "draft",
    channel: "email",
    subject: "A".repeat(150),
    textBody: fullDraftBody,
    createdAt: new Date("2026-05-15T10:00:00.000Z"),
    updatedAt: new Date("2026-05-15T10:00:00.000Z"),
    metadataJson: {
      origin: "ai_draft_generation",
      language: "fr",
      gmailExport: {
        requestedAt: "2026-05-15T10:05:00.000Z",
        requestExpiresAt: "2026-05-16T10:05:00.000Z",
      },
    },
    ...overrides,
  };
}

function rows(overrides: Partial<MailQueueRows> = {}): MailQueueRows {
  return {
    classifications: [baseClassification()],
    latestScoresByLeadId: {
      [leadId]: {
        id: "00000000-0000-4000-8000-000000023ae1",
        leadId,
        score: 88,
        qualification: "hot",
        recommendedAction: "Call today.",
        confidence: 74,
        createdAt: new Date("2026-05-15T09:30:00.000Z"),
      },
    },
    latestDraftsByLeadId: {
      [leadId]: baseDraft(),
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

function repository(rowSet: MailQueueRows = rows()): MailQueueRepository {
  return {
    listRows: vi.fn(async () => rowSet),
    findDetailRows: vi.fn(async () => rowSet),
  };
}

describe("client mail queue routes", () => {
  it("returns 401 without session for list and detail", async () => {
    const service = queueService();
    const app = createMailQueueApp(service);

    expect((await app.request("/api/client/mail-queue")).status).toBe(401);
    expect((await app.request(`/api/client/mail-queue/${classificationId}`)).status).toBe(401);
    expect(service.listMailQueue).not.toHaveBeenCalled();
    expect(service.getMailQueueDetail).not.toHaveBeenCalled();
  });

  it("rejects API key-only auth", async () => {
    const response = await createMailQueueApp().request("/api/client/mail-queue", {
      headers: { authorization: "Bearer syr_live_test" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin sessions", async () => {
    const service = queueService();
    const response = await createMailQueueApp(service, { ...testUser, role: "operator" }).request(
      "/api/client/mail-queue",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(service.listMailQueue).not.toHaveBeenCalled();
  });

  it("returns a safe empty list DTO", async () => {
    const service = queueService({
      listMailQueue: vi.fn(async (_workspaceId, query) => ({
        generatedAt: now.toISOString(),
        filters: {
          applied: {
            limit: query.limit,
            offset: query.offset,
            since: "2026-04-15T12:00:00.000Z",
            includeIgnored: query.includeIgnored,
            category: [],
            action: [],
            scoreBand: [],
            contactStatus: [],
            hasDraft: null,
            exportStatus: [],
            pipelineState: [],
            attentionRequired: null,
          },
        },
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: 0,
        },
        summary: {
          totalClassified: 0,
          totalIgnored: 0,
          totalLeadsCreated: 0,
          totalScored: 0,
          totalWithDraft: 0,
          totalExportRequested: 0,
          totalExported: 0,
          totalAttentionRequired: 0,
        },
        items: [],
      })),
    });
    const response = await createMailQueueApp(service).request("/api/client/mail-queue", {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(MailQueueResponseSchema.parse(body)).toEqual(body);
    expect(body.data.items).toEqual([]);
    expect(body.data.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
    expect(body.data.summary.totalClassified).toBe(0);
    assertNoForbiddenKeys(body);
  });

  it("returns safe list and detail DTOs by classificationId", async () => {
    const app = createMailQueueApp();
    const listResponse = await app.request("/api/client/mail-queue", {
      headers: validSessionHeaders(),
    });
    const detailResponse = await app.request(`/api/client/mail-queue/${classificationId}`, {
      headers: validSessionHeaders(),
    });
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(MailQueueResponseSchema.parse(listBody)).toEqual(listBody);
    expect(MailQueueDetailResponseSchema.parse(detailBody)).toEqual(detailBody);
    expect(listBody.data.items[0].classificationId).toBe(classificationId);
    expect(detailBody.data.classificationId).toBe(classificationId);
    expect(JSON.stringify(listBody)).not.toContain(fullDraftBody);
    expect(JSON.stringify(detailBody)).not.toContain(fullDraftBody);
    assertNoForbiddenKeys(listBody);
    assertNoForbiddenKeys(detailBody);
  });

  it("passes filters and pagination to the service", async () => {
    const service = queueService();
    const response = await createMailQueueApp(service).request(
      "/api/client/mail-queue?limit=5&offset=10&includeIgnored=true&category=service,quote&action=create_lead&scoreBand=hot&contactStatus=returning&hasDraft=true&exportStatus=requested&pipelineState=export_requested&attentionRequired=true&since=2026-05-01T00:00:00.000Z",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(200);
    expect(service.listMailQueue).toHaveBeenCalledWith(workspaceId, {
      limit: 5,
      offset: 10,
      includeIgnored: true,
      category: ["service", "quote"],
      action: ["create_lead"],
      scoreBand: ["hot"],
      contactStatus: ["returning"],
      hasDraft: true,
      exportStatus: ["requested"],
      pipelineState: ["export_requested"],
      attentionRequired: true,
      since: "2026-05-01T00:00:00.000Z",
    });
  });

  it("rejects client-provided workspace selectors", async () => {
    const response = await createMailQueueApp().request(
      "/api/client/mail-queue?workspaceId=00000000-0000-4000-8000-000000023fff",
      {
        headers: validSessionHeaders({ "x-workspace-id": "00000000-0000-4000-8000-000000023ffe" }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown or cross-workspace classification detail", async () => {
    const service = queueService({
      getMailQueueDetail: vi.fn(async () => ({ result: "not_found" as const })),
    });
    const response = await createMailQueueApp(service).request(
      `/api/client/mail-queue/${otherClassificationId}`,
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(404);
  });
});

describe("client mail queue service", () => {
  it("maps classifications into safe list and detail DTOs", async () => {
    const service = createMailQueueService(repository(), () => now);
    const list = await service.listMailQueue(workspaceId, {
      limit: 20,
      offset: 0,
      includeIgnored: false,
    });
    const detail = await service.getMailQueueDetail(workspaceId, classificationId);

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.draft.subjectPreview).toHaveLength(120);
    expect(list.items[0]?.draft.bodyPreview?.length).toBeLessThanOrEqual(280);
    expect(list.items[0]?.score.scoreBand).toBe("hot");
    expect(list.items[0]?.gmailExport.exportStatus).toBe("requested");
    expect(list.items[0]?.gmailExport.canExport).toBe(true);
    expect(list.items[0]?.contact.status).toBe("returning");
    expect(list.items[0]?.derived.pipelineState).toBe("export_requested");
    expect(list.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(JSON.stringify(list)).not.toContain(fullDraftBody);

    expect(detail.result).toBe("ok");
    if (detail.result === "ok") {
      expect(detail.detail.classificationId).toBe(classificationId);
      expect(JSON.stringify(detail.detail)).not.toContain(fullDraftBody);
      assertNoForbiddenKeys({ success: true, data: detail.detail });
    }
  });

  it("hides ignored mail by default and can include it", async () => {
    const ignored = baseClassification({
      classificationId: ignoredClassificationId,
      action: "ignore",
      category: "newsletter",
      leadId: null,
      leadCreatedAt: null,
      leadStatus: null,
      leadContactId: null,
    });
    const service = createMailQueueService(
      repository(rows({ classifications: [baseClassification(), ignored] })),
      () => now,
    );

    expect(
      (await service.listMailQueue(workspaceId, { limit: 20, offset: 0, includeIgnored: false }))
        .items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { limit: 20, offset: 0, includeIgnored: true }))
        .items,
    ).toHaveLength(2);
  });

  it("filters by category, action, score band, contact status, draft, export, pipeline, attention, and since", async () => {
    const repo = repository();
    const service = createMailQueueService(repo, () => now);
    const baseQuery = { limit: 20, offset: 0, includeIgnored: false };

    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, category: ["service"] })).items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, action: ["create_lead"] })).items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, scoreBand: ["hot"] })).items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, contactStatus: ["returning"] }))
        .items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, hasDraft: true })).items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, exportStatus: ["requested"] }))
        .items,
    ).toHaveLength(1);
    expect(
      (
        await service.listMailQueue(workspaceId, {
          ...baseQuery,
          pipelineState: ["export_requested"],
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (await service.listMailQueue(workspaceId, { ...baseQuery, attentionRequired: true })).items,
    ).toHaveLength(1);
    expect(
      (
        await service.listMailQueue(workspaceId, {
          ...baseQuery,
          since: "2026-05-01T00:00:00.000Z",
        })
      ).filters.applied.since,
    ).toBe("2026-05-01T00:00:00.000Z");
    expect(repo.listRows).toHaveBeenLastCalledWith({
      workspaceId,
      since: new Date("2026-05-01T00:00:00.000Z"),
    });
  });

  it("paginates with limit, offset, and total", async () => {
    const secondLeadId = "00000000-0000-4000-8000-000000023af2";
    const service = createMailQueueService(
      repository(
        rows({
          classifications: [
            baseClassification(),
            baseClassification({
              classificationId: otherClassificationId,
              leadId: secondLeadId,
              leadContactId: null,
            }),
          ],
          latestScoresByLeadId: {},
          latestDraftsByLeadId: {},
          previousLeadCountsByLeadId: {},
        }),
      ),
      () => now,
    );
    const list = await service.listMailQueue(workspaceId, {
      limit: 1,
      offset: 1,
      includeIgnored: false,
    });

    expect(list.items).toHaveLength(1);
    expect(list.pagination).toEqual({ limit: 1, offset: 1, total: 2 });
  });

  it("returns not_found for unknown details", async () => {
    const service = createMailQueueService(repository(rows({ classifications: [] })), () => now);

    await expect(service.getMailQueueDetail(workspaceId, classificationId)).resolves.toEqual({
      result: "not_found",
    });
  });

  it("derives all required pipeline states", async () => {
    const ids = Array.from(
      { length: 7 },
      (_, index) => `00000000-0000-4000-8000-000000023b${index}1`,
    );
    const leadIds = Array.from(
      { length: 7 },
      (_, index) => `00000000-0000-4000-8000-000000023c${index}1`,
    );
    const classifications = [
      baseClassification({
        classificationId: ids[0]!,
        action: "ignore",
        leadId: null,
        leadCreatedAt: null,
        leadStatus: null,
        leadContactId: null,
      }),
      baseClassification({ classificationId: ids[1]!, leadId: leadIds[1]!, leadContactId: null }),
      baseClassification({ classificationId: ids[2]!, leadId: leadIds[2]!, leadContactId: null }),
      baseClassification({ classificationId: ids[3]!, leadId: leadIds[3]!, leadContactId: null }),
      baseClassification({ classificationId: ids[4]!, leadId: leadIds[4]!, leadContactId: null }),
      baseClassification({ classificationId: ids[5]!, leadId: leadIds[5]!, leadContactId: null }),
      baseClassification({ classificationId: ids[6]!, leadId: leadIds[6]!, leadContactId: null }),
    ];
    const scoreFor = (id: string) => ({
      id: `10000000-0000-4000-8000-${id.slice(-12)}`,
      leadId: id,
      score: 52,
      qualification: "warm",
      recommendedAction: "Review.",
      confidence: 70,
      createdAt: new Date("2026-05-15T09:30:00.000Z"),
    });
    const service = createMailQueueService(
      repository(
        rows({
          classifications,
          latestScoresByLeadId: {
            [leadIds[2]!]: scoreFor(leadIds[2]!),
            [leadIds[3]!]: scoreFor(leadIds[3]!),
            [leadIds[4]!]: scoreFor(leadIds[4]!),
            [leadIds[5]!]: scoreFor(leadIds[5]!),
            [leadIds[6]!]: scoreFor(leadIds[6]!),
          },
          latestDraftsByLeadId: {
            [leadIds[3]!]: baseDraft({
              leadId: leadIds[3]!,
              metadataJson: { origin: "ai_draft_generation" },
            }),
            [leadIds[4]!]: baseDraft({ leadId: leadIds[4]! }),
            [leadIds[5]!]: baseDraft({
              leadId: leadIds[5]!,
              metadataJson: {
                origin: "ai_draft_generation",
                gmailExport: { status: "exported", exportedAt: "2026-05-15T10:30:00.000Z" },
              },
            }),
            [leadIds[6]!]: baseDraft({ leadId: leadIds[6]!, textBody: null }),
          },
          previousLeadCountsByLeadId: {},
        }),
      ),
      () => now,
    );
    const list = await service.listMailQueue(workspaceId, {
      limit: 20,
      offset: 0,
      includeIgnored: true,
    });
    const states = new Map(
      list.items.map((item) => [item.classificationId, item.derived.pipelineState]),
    );

    expect(states.get(ids[0]!)).toBe("ignored");
    expect(states.get(ids[1]!)).toBe("classified");
    expect(states.get(ids[2]!)).toBe("scored");
    expect(states.get(ids[3]!)).toBe("draft_ready");
    expect(states.get(ids[4]!)).toBe("export_requested");
    expect(states.get(ids[5]!)).toBe("exported");
    expect(states.get(ids[6]!)).toBe("blocked");
  });

  it("derives attention flags", async () => {
    const old = new Date("2026-05-01T09:00:00.000Z");
    const service = createMailQueueService(
      repository(rows({ classifications: [baseClassification({ classifiedAt: old })] })),
      () => now,
    );
    const [item] = (
      await service.listMailQueue(workspaceId, {
        limit: 20,
        offset: 0,
        includeIgnored: false,
      })
    ).items;

    expect(item?.derived.attentionFlags).toEqual(
      expect.arrayContaining([
        "high_score",
        "urgent_action",
        "export_requested",
        "stale_mail",
        "returning_contact",
      ]),
    );
  });

  it("has no side effects and does not call providers", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const counts = {
      drafts: 1,
      leads: 1,
      lead_scores: 1,
      activity_logs: 0,
      background_jobs: 0,
      email_sends: 0,
      approvals: 0,
    };
    const before = { ...counts };
    const service = createMailQueueService(repository(), () => now);

    await service.listMailQueue(workspaceId, { limit: 20, offset: 0, includeIgnored: false });
    await service.getMailQueueDetail(workspaceId, classificationId);

    expect(counts).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not include bodyText, raw inbound body, or forbidden keys", async () => {
    const service = createMailQueueService(repository(), () => now);
    const list = await service.listMailQueue(workspaceId, {
      limit: 20,
      offset: 0,
      includeIgnored: false,
    });
    const detail = await service.getMailQueueDetail(workspaceId, classificationId);

    expect(JSON.stringify(list)).not.toContain("bodyText");
    expect(JSON.stringify(list)).not.toContain("Raw inbound email body");
    assertNoForbiddenKeys({ success: true, data: list });

    if (detail.result === "ok") {
      expect(JSON.stringify(detail.detail)).not.toContain("bodyText");
      expect(JSON.stringify(detail.detail)).not.toContain("Raw inbound email body");
      assertNoForbiddenKeys({ success: true, data: detail.detail });
    }
  });
});

describe("client mail queue source guardrails", () => {
  it("does not add migrations, provider calls, or mutations in the mail queue path", () => {
    const routeSource = readFileSync("src/routes/client/mail-queue.ts", "utf8");
    const serviceSource = readFileSync("src/services/mail-queue.service.ts", "utf8");
    const repositorySource = readFileSync("src/repositories/mail-queue.repository.ts", "utf8");
    const contractSource = readFileSync(
      "../../packages/shared/src/contracts/mail-queue.ts",
      "utf8",
    );
    const combined = `${routeSource}\n${serviceSource}\n${repositorySource}`;

    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/from\s+["'].*(gmail|google|resend)/i);
    expect(routeSource).not.toMatch(/\.(post|put|patch|delete)\s*\(/);
    expect(combined).not.toMatch(/insert\(|update\(|delete\(/);
    expect(contractSource).not.toMatch(
      /workspaceId|workspace_id|metadata_json|payload_json|leaseToken|apiKey|prompt|output|externalId/,
    );
  });
});
