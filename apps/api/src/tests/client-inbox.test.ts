import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  ClientInboxDraftEditResponseSchema,
  ClientInboxMessageDetailResponseSchema,
  ClientInboxMessagesResponseSchema,
  GmailExportCancelResponseSchema,
  GmailExportRequestResponseSchema,
  type AuthMe,
  type ClientInboxMessageItem,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import type {
  ClientInboxRepository,
  ClientInboxRows,
} from "../repositories/client-inbox.repository.js";
import { createClientInboxRoutes } from "../routes/client/inbox.js";
import { createClientInboxService, type ClientInboxService } from "../services/client-inbox.service.js";
import type { AuthService } from "../services/auth.js";
import type { GmailExportRequestService } from "../services/gmail-export-request.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const now = new Date("2026-05-18T10:00:00.000Z");
const workspaceId = testUser.workspaceId;
const mailItemId = "00000000-0000-4000-8000-000000023f01";
const otherMailItemId = "00000000-0000-4000-8000-000000023f02";
const classificationId = "00000000-0000-4000-8000-000000023f03";
const leadId = "00000000-0000-4000-8000-000000023f04";
const contactId = "00000000-0000-4000-8000-000000023f05";
const draftId = "00000000-0000-4000-8000-000000023f06";
const userId = testUser.id;

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    "content-type": "application/json",
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

function assertNoForbiddenKeys(value: unknown, options: { allowDetailMailFields?: boolean } = {}) {
  const forbidden = new Set([
    "workspaceId",
    "workspace_id",
    "metadataJson",
    "metadata",
    "normalizedJson",
    "normalized_json",
    "payloadJson",
    "payload_json",
    "rawMetadata",
    "rawPayload",
    "providerMessageId",
    "providerPayload",
    "externalId",
    "externalThreadId",
    "threadId",
    "messageId",
    "leaseToken",
    "apiKey",
    "keyHash",
    "prompt",
    "output",
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
      const allowed =
        options.allowDetailMailFields &&
        [
          "data.mail.bodyText",
          "data.mail.fromEmail",
          "data.mail.toEmail",
          "data.draft.bodyText",
        ].includes(joined);

      if (!allowed) {
        expect(forbidden.has(key), `forbidden key ${joined}`).toBe(false);
        expect(
          ["bodyText", "fromEmail", "toEmail"].includes(key),
          `forbidden list key ${joined}`,
        ).toBe(false);
      }

      visit(child, [...path, key]);
    }
  }

  visit(value, []);
}

function queueRows(): ClientInboxRows {
  const receivedAt = new Date("2026-05-18T09:00:00.000Z");
  const draftCreatedAt = new Date("2026-05-18T09:30:00.000Z");

  return {
    mails: [
      {
        mailItemId,
        classificationId,
        leadId,
        contactId,
        draftId,
        receivedAt,
        createdAt: receivedAt,
        fromDisplay: "Jean Client",
        subject: "Demande de devis chaudiere",
        snippet: "Bonjour, besoin d'un devis chaudiere.",
        classification: "leadable",
        category: "quote_request",
        action: "create_lead",
        confidence: "high",
        reasonCode: "quote_intent",
        suggestedLabels: ["urgent"],
        leadStatus: "new",
        contactFirstName: "Jean",
        contactLastName: "Client",
        companyName: "Atelier Client",
      },
    ],
    latestScoresByLeadId: {
      [leadId]: {
        id: "00000000-0000-4000-8000-000000023f07",
        leadId,
        score: 88,
        qualification: "hot",
        recommendedAction: "Call today.",
        confidence: 81,
        createdAt: new Date("2026-05-18T09:10:00.000Z"),
      },
    },
    latestDraftsByLeadId: {
      [leadId]: {
        draftId,
        leadId,
        contactId,
        status: "draft",
        subject: "Re: devis chaudiere",
        textBody: "Bonjour, merci pour votre demande.",
        createdAt: draftCreatedAt,
        updatedAt: draftCreatedAt,
        metadataJson: {
          origin: "ai_draft_generation",
          gmailExport: {
            requestedAt: "2026-05-18T09:40:00.000Z",
            requestExpiresAt: "2026-05-19T09:40:00.000Z",
            status: "requested",
          },
        },
      },
    },
    draftsById: {},
    previousLeadCountsByContactId: {
      [contactId]: 2,
    },
    previousThreadCountsByContactId: {
      [contactId]: 3,
    },
    lastInboundAtByContactId: {
      [contactId]: receivedAt,
    },
    lastOutboundByContactId: {},
    workspaceContext: {
      companyName: "Syrantis Plomberie",
      sector: "plomberie",
      language: "fr",
      contextJson: {
        responsePolicy: {
          tone: "warm",
          forbiddenClaims: ["do not promise a fixed price before diagnosis"],
        },
      },
    },
  };
}

function detailRows(): ClientInboxRows<ClientInboxRows["mails"][number] & {
  fromEmail: string | null;
  toDisplay: string | null;
  toEmail: string | null;
  bodyText: string | null;
  attachmentsJson: unknown[];
}> {
  const rows = queueRows();

  return {
    ...rows,
    mails: rows.mails.map((mail) => ({
      ...mail,
      fromEmail: "jean.client@example.test",
      toDisplay: "Bureau",
      toEmail: "contact@syrantis.example",
      bodyText: "Bonjour, besoin d'un devis chaudiere urgent.",
      attachmentsJson: [{ filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1234 }],
    })),
  };
}

function repository(overrides: Partial<ClientInboxRepository> = {}): ClientInboxRepository {
  return {
    listRows: vi.fn(async () => queueRows()),
    findDetailRows: vi.fn(async () => detailRows()),
    resolveDraftForMailItem: vi.fn(async () => ({ result: "ok" as const, mailItemId, draftId })),
    updateDraftFromMailItem: vi.fn(async () => ({
      result: "ok" as const,
      mailItemId,
      draftId,
      status: "draft",
      updatedAt: now,
      metadataJson: { editSource: "client_inbox_edit" },
    })),
    ...overrides,
  };
}

function gmailService(): GmailExportRequestService {
  return {
    requestGmailExport: vi.fn(async () => ({
      result: "ok" as const,
      data: {
        draftId,
        leadId,
        requestStatus: "requested" as const,
        requestedAt: now.toISOString(),
        requestExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        canExport: true,
      },
    })),
    cancelGmailExport: vi.fn(async () => ({
      result: "ok" as const,
      data: {
        draftId,
        leadId,
        requestStatus: "cancelled" as const,
        cancelledAt: now.toISOString(),
      },
    })),
  };
}

function serviceFromRepository(
  repo: ClientInboxRepository = repository(),
  gmail: GmailExportRequestService = gmailService(),
) {
  return createClientInboxService(repo, gmail, () => now);
}

function routeService(overrides: Partial<ClientInboxService> = {}): ClientInboxService {
  const item: ClientInboxMessageItem = {
    mailItemId,
    classificationId,
    leadId,
    draftId,
    receivedAt: "2026-05-18T09:00:00.000Z",
    senderDisplay: "Jean Client",
    companyDisplay: "Atelier Client",
    subject: null,
    snippet: "Bonjour, besoin d'un devis chaudiere.",
    score: 88,
    scoreBand: "hot",
    category: "quote_request",
    intent: "quote_intent",
    urgency: "high",
    contactStatus: "returning",
    previousThreadCount: 2,
    draftStatus: "requested",
    gmailExportStatus: "requested",
    pipelineState: "export_requested",
    attentionFlags: ["high_score", "urgent_action", "export_requested"],
    needsReview: true,
  };

  return {
    listMessages: vi.fn(async () => ({
      generatedAt: now.toISOString(),
      pagination: { limit: 20, offset: 0, total: 1 },
      items: [item],
    })),
    getMessageDetail: vi.fn(async () => {
      const result = await serviceFromRepository().getMessageDetail(workspaceId, mailItemId);

      if (result.result !== "ok") {
        throw new Error("Expected inbox detail.");
      }

      return result;
    }),
    updateDraft: vi.fn(async () => ({
      result: "ok" as const,
      data: {
        mailItemId,
        draftId,
        status: "draft",
        updatedAt: now.toISOString(),
        canExportToGmail: true,
      },
    })),
    requestGmailExport: vi.fn(async () => ({
      result: "ok" as const,
      data: {
        draftId,
        leadId,
        requestStatus: "requested" as const,
        requestedAt: now.toISOString(),
        requestExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        canExport: true,
      },
    })),
    cancelGmailExport: vi.fn(async () => ({
      result: "ok" as const,
      data: {
        draftId,
        leadId,
        requestStatus: "cancelled" as const,
        cancelledAt: now.toISOString(),
      },
    })),
    ...overrides,
  };
}

function createInboxApp(service: ClientInboxService = routeService(), user: AuthMe | null = testUser) {
  const app = new Hono();
  app.route(
    "/api/client/inbox",
    createClientInboxRoutes({
      authService: authServiceFor(user),
      clientInboxService: service,
    }),
  );
  return app;
}

describe("client inbox service", () => {
  it("returns a safe list DTO without body/email/provider fields", async () => {
    const service = serviceFromRepository();
    const data = await service.listMessages(workspaceId, {
      tab: "all",
      limit: 20,
      offset: 0,
      sort: "newest",
    });

    expect(data.items[0]).toMatchObject({
      mailItemId,
      scoreBand: "hot",
      category: "quote_request",
      contactStatus: "returning",
      draftStatus: "requested",
    });
    assertNoForbiddenKeys({ data });
  });

  it("returns full mail content only in the dedicated detail DTO", async () => {
    const service = serviceFromRepository();
    const result = await service.getMessageDetail(workspaceId, mailItemId);

    expect(result.result).toBe("ok");
    if (result.result !== "ok") {
      throw new Error("Expected detail.");
    }

    expect(result.detail.mail).toMatchObject({
      bodyText: "Bonjour, besoin d'un devis chaudiere urgent.",
      fromEmail: "jean.client@example.test",
      toEmail: "contact@syrantis.example",
    });
    assertNoForbiddenKeys({ data: result.detail }, { allowDetailMailFields: true });
  });

  it("resolves Gmail export actions through the mail item draft relation", async () => {
    const repo = repository();
    const gmail = gmailService();
    const service = serviceFromRepository(repo, gmail);

    const requestResult = await service.requestGmailExport(workspaceId, userId, mailItemId);
    const cancelResult = await service.cancelGmailExport(workspaceId, userId, mailItemId);

    expect(requestResult.result).toBe("ok");
    expect(cancelResult.result).toBe("ok");
    expect(repo.resolveDraftForMailItem).toHaveBeenCalledWith({ workspaceId, mailItemId });
    expect(gmail.requestGmailExport).toHaveBeenCalledWith(workspaceId, userId, draftId);
    expect(gmail.cancelGmailExport).toHaveBeenCalledWith(workspaceId, userId, draftId);
  });

  it("does not delegate Gmail export when a mail item has no draft", async () => {
    const repo = repository({
      resolveDraftForMailItem: vi.fn(async () => ({ result: "no_draft" as const })),
    });
    const gmail = gmailService();
    const service = serviceFromRepository(repo, gmail);

    await expect(service.requestGmailExport(workspaceId, userId, mailItemId)).resolves.toEqual({
      result: "no_draft",
    });
    expect(gmail.requestGmailExport).not.toHaveBeenCalled();
  });
});

describe("client inbox routes", () => {
  it("returns 401 without session for all inbox endpoints", async () => {
    const service = routeService();
    const app = createInboxApp(service);

    expect((await app.request("/api/client/inbox/messages")).status).toBe(401);
    expect((await app.request(`/api/client/inbox/messages/${mailItemId}`)).status).toBe(401);
    expect(
      (
        await app.request(`/api/client/inbox/messages/${mailItemId}/draft`, {
          method: "PATCH",
          body: JSON.stringify({ subject: "S", bodyText: "B" }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request(`/api/client/inbox/messages/${mailItemId}/gmail-export-request`, {
          method: "POST",
        })
      ).status,
    ).toBe(401);
    expect(service.listMessages).not.toHaveBeenCalled();
  });

  it("rejects non-admin sessions", async () => {
    const service = routeService();
    const response = await createInboxApp(service, { ...testUser, role: "operator" }).request(
      "/api/client/inbox/messages",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(service.listMessages).not.toHaveBeenCalled();
  });

  it("returns list and detail DTOs with the expected leak boundary", async () => {
    const app = createInboxApp();
    const listResponse = await app.request("/api/client/inbox/messages?tab=all&limit=20", {
      headers: validSessionHeaders(),
    });
    const detailResponse = await app.request(`/api/client/inbox/messages/${mailItemId}`, {
      headers: validSessionHeaders(),
    });
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(ClientInboxMessagesResponseSchema.parse(listBody)).toEqual(listBody);
    expect(ClientInboxMessageDetailResponseSchema.parse(detailBody)).toEqual(detailBody);
    expect(listBody.data.items[0].subject).toBeNull();
    assertNoForbiddenKeys(listBody);
    assertNoForbiddenKeys(detailBody, { allowDetailMailFields: true });
    expect(detailBody.data.mail.bodyText).toBe("Bonjour, besoin d'un devis chaudiere urgent.");
  });

  it("returns 400 for invalid UUID and 404 for unknown detail", async () => {
    const service = routeService({
      getMessageDetail: vi.fn(async () => ({ result: "not_found" as const })),
    });
    const app = createInboxApp(service);

    const invalid = await app.request("/api/client/inbox/messages/not-a-uuid", {
      headers: validSessionHeaders(),
    });
    const unknown = await app.request(`/api/client/inbox/messages/${otherMailItemId}`, {
      headers: validSessionHeaders(),
    });

    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
  });

  it("edits draft from inbox context without returning subject or body", async () => {
    const service = routeService();
    const response = await createInboxApp(service).request(
      `/api/client/inbox/messages/${mailItemId}/draft`,
      {
        method: "PATCH",
        headers: validSessionHeaders(),
        body: JSON.stringify({ subject: "Updated", bodyText: "Updated body" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ClientInboxDraftEditResponseSchema.parse(body)).toEqual(body);
    expect(JSON.stringify(body)).not.toContain("Updated body");
    expect(service.updateDraft).toHaveBeenCalledWith(
      workspaceId,
      userId,
      mailItemId,
      { subject: "Updated", bodyText: "Updated body" },
    );
  });

  it("returns safe failure when draft actions have no draft", async () => {
    const service = routeService({
      updateDraft: vi.fn(async () => ({ result: "no_draft" as const })),
      requestGmailExport: vi.fn(async () => ({ result: "no_draft" as const })),
    });
    const app = createInboxApp(service);

    const edit = await app.request(`/api/client/inbox/messages/${mailItemId}/draft`, {
      method: "PATCH",
      headers: validSessionHeaders(),
      body: JSON.stringify({ subject: "Updated", bodyText: "Updated body" }),
    });
    const exportRequest = await app.request(
      `/api/client/inbox/messages/${mailItemId}/gmail-export-request`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );

    expect(edit.status).toBe(409);
    expect(exportRequest.status).toBe(409);
  });

  it("wraps Gmail export request and cancel responses", async () => {
    const app = createInboxApp();
    const request = await app.request(
      `/api/client/inbox/messages/${mailItemId}/gmail-export-request`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );
    const cancel = await app.request(`/api/client/inbox/messages/${mailItemId}/gmail-export-cancel`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const requestBody = await request.json();
    const cancelBody = await cancel.json();

    expect(request.status).toBe(200);
    expect(cancel.status).toBe(200);
    expect(GmailExportRequestResponseSchema.parse(requestBody)).toEqual(requestBody);
    expect(GmailExportCancelResponseSchema.parse(cancelBody)).toEqual(cancelBody);
  });
});
