import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GmailExportCancelResponseSchema,
  GmailExportRequestResponseSchema,
  GmailExportStatusSuccessSchema,
  type AuthMe,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createDraftGmailExportStatusRoutes } from "../routes/drafts-gmail-export-status.js";
import type { AuthService } from "../services/auth.js";
import type {
  GmailExportCancelServiceResult,
  GmailExportRequestService,
  GmailExportRequestServiceResult,
} from "../services/gmail-export-request.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

const workspaceId = testUser.workspaceId;
const otherWorkspaceId = "00000000-0000-4000-8000-000000023702";
const draftId = "00000000-0000-4000-8000-000000023701";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000023702";
const missingDraftId = "00000000-0000-4000-8000-000000023703";
const leadId = "00000000-0000-4000-8000-000000023711";
const contactId = "00000000-0000-4000-8000-000000023721";
const now = new Date("2026-05-13T18:00:00.000Z");
const validApiKey = "syr_live_gmail_status_route_key";

function validSessionHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    ...extraHeaders,
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx(selectResponses: unknown[][]) {
  const state = {
    selectResponses: [...selectResponses],
    selectedShapes: [] as unknown[],
  };

  return {
    state,
    select: vi.fn((shape?: unknown) => {
      state.selectedShapes.push(shape);
      return createSelectBuilder(state.selectResponses.shift() ?? []);
    }),
    insert: vi.fn(() => {
      throw new Error("gmail export status must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("gmail export status must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("gmail export status must not delete");
    }),
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    leadId,
    status: "draft",
    subject: "Private export subject",
    textBody: "Private export body.",
    htmlBody: "<p>Private export HTML.</p>",
    updatedAt: new Date("2026-05-13T17:55:00.000Z"),
    metadataJson: {
      origin: "ai_draft_generation",
      prompt: "hidden prompt",
      output: "hidden output",
    },
    providerMessageId: "provider_message_id_secret",
    ...overrides,
  };
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: leadId,
    contactId,
    normalizedJson: {
      fromEmail: "normalized-fallback@example.test",
    },
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    email: "client@example.test",
    id: contactId,
    contactName: "Private Contact",
    ...overrides,
  };
}

function requestedGmailExport(overrides: Record<string, unknown> = {}) {
  return {
    status: "requested",
    requestedAt: "2026-05-13T17:00:00.000Z",
    requestExpiresAt: "2026-05-14T17:00:00.000Z",
    requestSource: "admin_api",
    cancelledAt: null,
    ...overrides,
  };
}

function countRow(value: number) {
  return [{ value }];
}

function selectResponses(
  input: {
    draft?: Record<string, unknown> | null;
    lead?: Record<string, unknown> | null;
    contact?: Record<string, unknown> | null;
    emailSendsCount?: number;
    approvalsCount?: number;
  } = {},
) {
  const draft = input.draft === undefined ? draftRow() : input.draft;
  const responses: unknown[][] = [];

  responses.push(draft ? [draft] : []);

  const draftLeadId = draft && "leadId" in draft ? draft.leadId : null;
  const lead = input.lead === undefined ? leadRow() : input.lead;
  if (draftLeadId) {
    responses.push(lead ? [lead] : []);
  }

  const leadContactId = lead && "contactId" in lead ? lead.contactId : null;
  const contact = input.contact === undefined ? contactRow() : input.contact;
  if (draftLeadId && leadContactId) {
    responses.push(contact ? [contact] : []);
  }

  if (draft) {
    responses.push(countRow(input.emailSendsCount ?? 0));
    responses.push(countRow(input.approvalsCount ?? 0));
  }

  return responses;
}

function createTestApp(user: AuthMe | null = testUser) {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftGmailExportStatusRoutes({
      authService: authServiceFor(user),
    }),
  );

  return app;
}

type RequestStoredDraft = {
  id: string;
  workspaceId: string;
  leadId: string;
  status: string;
  subject: string | null;
  textBody: string | null;
  recipientEmail: string | null;
  metadataJson: Record<string, unknown>;
};

function requestDraft(overrides: Partial<RequestStoredDraft> = {}): RequestStoredDraft {
  return {
    id: draftId,
    workspaceId,
    leadId,
    status: "draft",
    subject: "Private export subject",
    textBody: "Private export body.",
    recipientEmail: "client@example.test",
    metadataJson: {
      keep: "metadata",
    },
    ...overrides,
  };
}

function createFakeRequestService(
  input: {
    drafts?: RequestStoredDraft[];
    emailSendsCount?: number;
    currentTime?: Date;
  } = {},
) {
  const drafts = new Map((input.drafts ?? [requestDraft()]).map((draft) => [draft.id, draft]));
  const activityLogs: Array<{
    action: string;
    entityType: string;
    entityId: string;
    metadataJson: Record<string, unknown>;
  }> = [];
  const emailSends: unknown[] = Array.from({ length: input.emailSendsCount ?? 0 }, () => ({}));
  const approvals: unknown[] = [];
  const currentTime = input.currentTime ?? now;

  function gmailExport(draft: RequestStoredDraft): Record<string, unknown> {
    const value = draft.metadataJson.gmailExport;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  function parsedDate(value: unknown): Date | null {
    if (typeof value !== "string") {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function hasActiveLease(draft: RequestStoredDraft): boolean {
    const metadata = gmailExport(draft);
    const leaseExpiresAt = parsedDate(metadata.leaseExpiresAt);
    return (
      typeof metadata.leaseToken === "string" &&
      Boolean(leaseExpiresAt && leaseExpiresAt > currentTime)
    );
  }

  function hasActiveRequest(draft: RequestStoredDraft): boolean {
    const metadata = gmailExport(draft);
    const requestExpiresAt = parsedDate(metadata.requestExpiresAt);
    return (
      typeof metadata.requestedAt === "string" &&
      Boolean(requestExpiresAt && requestExpiresAt > currentTime) &&
      metadata.status !== "cancelled" &&
      metadata.status !== "exported" &&
      !metadata.cancelledAt &&
      !metadata.exportedAt
    );
  }

  function isExported(draft: RequestStoredDraft): boolean {
    const metadata = gmailExport(draft);
    return metadata.status === "exported" || typeof metadata.exportedAt === "string";
  }

  function validRecipient(draft: RequestStoredDraft): boolean {
    const trimmed = draft.recipientEmail?.trim();
    return Boolean(trimmed) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed ?? "");
  }

  const service: GmailExportRequestService = {
    requestGmailExport: vi.fn(
      async (
        requestedWorkspaceId,
        _actorUserId,
        requestedDraftId,
      ): Promise<GmailExportRequestServiceResult> => {
        const draft = drafts.get(requestedDraftId);

        if (!draft || draft.workspaceId !== requestedWorkspaceId) {
          return { result: "not_found" };
        }

        if (isExported(draft)) {
          return { result: "conflict", code: "GMAIL_EXPORT_ALREADY_EXPORTED" };
        }

        if (hasActiveLease(draft)) {
          return { result: "conflict", code: "GMAIL_EXPORT_ACTIVE_LEASE" };
        }

        if (draft.status !== "draft") {
          return { result: "conflict", code: "GMAIL_EXPORT_DRAFT_NOT_READY" };
        }

        if (!draft.subject?.trim() || !draft.textBody?.trim()) {
          return { result: "conflict", code: "GMAIL_EXPORT_MISSING_CONTENT" };
        }

        if (!validRecipient(draft)) {
          return { result: "conflict", code: "GMAIL_EXPORT_MISSING_RECIPIENT" };
        }

        if (emailSends.length > 0) {
          return { result: "conflict", code: "GMAIL_EXPORT_HAS_EMAIL_SENDS" };
        }

        const metadata = gmailExport(draft);
        if (hasActiveRequest(draft)) {
          return {
            result: "ok",
            data: {
              draftId: draft.id,
              leadId: draft.leadId,
              requestStatus: "already_requested",
              requestedAt: String(metadata.requestedAt),
              requestExpiresAt: String(metadata.requestExpiresAt),
              canExport: true,
            },
          };
        }

        const requestedAt = currentTime.toISOString();
        const requestExpiresAt = new Date(
          currentTime.getTime() + 24 * 60 * 60 * 1000,
        ).toISOString();
        draft.metadataJson = {
          ...draft.metadataJson,
          gmailExport: {
            ...metadata,
            requestedAt,
            requestExpiresAt,
            requestSource: "admin_api",
            cancelledAt: null,
            status: "requested",
            leaseToken: null,
            leaseExpiresAt: null,
          },
        };
        activityLogs.push({
          action: "draft.gmail_export_requested",
          entityType: "draft",
          entityId: draft.id,
          metadataJson: {
            draftId: draft.id,
            leadId: draft.leadId,
            source: "admin_api",
            requestedAt,
            requestExpiresAt,
          },
        });

        return {
          result: "ok",
          data: {
            draftId: draft.id,
            leadId: draft.leadId,
            requestStatus: "requested",
            requestedAt,
            requestExpiresAt,
            canExport: true,
          },
        };
      },
    ),
    cancelGmailExport: vi.fn(
      async (
        requestedWorkspaceId,
        _actorUserId,
        requestedDraftId,
      ): Promise<GmailExportCancelServiceResult> => {
        const draft = drafts.get(requestedDraftId);

        if (!draft || draft.workspaceId !== requestedWorkspaceId) {
          return { result: "not_found" };
        }

        if (isExported(draft)) {
          return { result: "conflict", code: "GMAIL_EXPORT_ALREADY_EXPORTED" };
        }

        if (hasActiveLease(draft)) {
          return { result: "conflict", code: "GMAIL_EXPORT_ACTIVE_LEASE" };
        }

        if (!hasActiveRequest(draft)) {
          return { result: "conflict", code: "GMAIL_EXPORT_NO_ACTIVE_REQUEST" };
        }

        const metadata = gmailExport(draft);
        const cancelledAt = currentTime.toISOString();
        draft.metadataJson = {
          ...draft.metadataJson,
          gmailExport: {
            ...metadata,
            cancelledAt,
            status: "cancelled",
            leaseToken: null,
            leaseExpiresAt: null,
          },
        };
        activityLogs.push({
          action: "draft.gmail_export_cancelled",
          entityType: "draft",
          entityId: draft.id,
          metadataJson: {
            draftId: draft.id,
            leadId: draft.leadId,
            source: "admin_api",
            cancelledAt,
          },
        });

        return {
          result: "ok",
          data: {
            draftId: draft.id,
            leadId: draft.leadId,
            requestStatus: "cancelled",
            cancelledAt,
          },
        };
      },
    ),
  };

  return { service, drafts, activityLogs, emailSends, approvals };
}

function createRequestTestApp(
  requestStore = createFakeRequestService(),
  user: AuthMe | null = testUser,
) {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftGmailExportStatusRoutes({
      authService: authServiceFor(user),
      gmailExportRequestService: requestStore.service,
    }),
  );

  return { app, requestStore };
}

async function requestStatus(
  responses: unknown[][],
  id: string = draftId,
  user: AuthMe | null = testUser,
  headers: Record<string, string> = validSessionHeaders(),
) {
  const tx = createMockTx(responses);
  mockDb.tx = tx;

  const response = await createTestApp(user).request(`/api/drafts/${id}/gmail-export-status`, {
    headers,
  });

  return { response, tx };
}

async function okStatus(responses: unknown[][] = selectResponses()) {
  const { response, tx } = await requestStatus(responses);
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(GmailExportStatusSuccessSchema.parse(body)).toEqual(body);

  return { body, tx };
}

function expectNoResponseLeak(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    workspaceId,
    otherWorkspaceId,
    contactId,
    "contactId",
    "contact_id",
    "toEmail",
    "client@example.test",
    "normalized-fallback@example.test",
    "contactName",
    "Private Contact",
    "Private export subject",
    "Private export body.",
    "bodyText",
    "textBody",
    "htmlBody",
    "metadata_json",
    "metadataJson",
    "gmailExport",
    "leaseToken",
    "provider_message_id",
    "providerMessageId",
    "provider_message_id_secret",
    "hidden prompt",
    "hidden output",
    "apiKey",
    "Authorization",
    "Bearer",
    validApiKey,
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function expectNoActivityLeak(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    workspaceId,
    otherWorkspaceId,
    contactId,
    "contactId",
    "toEmail",
    "client@example.test",
    "Private export subject",
    "Private export body.",
    "bodyText",
    "htmlBody",
    "gmailExport",
    "leaseToken",
    "apiKey",
    "Authorization",
    "Bearer",
    validApiKey,
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("POST /api/drafts/:id/gmail-export-request and cancel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns 401 without a session and 403 for non-admin users", async () => {
    const requestStore = createFakeRequestService();
    const noSession = createRequestTestApp(requestStore).app;
    const operator: AuthMe = { ...testUser, role: "operator" };
    const nonAdmin = createRequestTestApp(requestStore, operator).app;

    const unauthorized = await noSession.request(`/api/drafts/${draftId}/gmail-export-request`, {
      method: "POST",
    });
    const forbidden = await nonAdmin.request(`/api/drafts/${draftId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(requestStore.service.requestGmailExport).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid UUIDs and 404 for unknown or cross-workspace drafts", async () => {
    const requestStore = createFakeRequestService({
      drafts: [requestDraft({ id: otherWorkspaceDraftId, workspaceId: otherWorkspaceId })],
    });
    const { app } = createRequestTestApp(requestStore);
    const invalid = await app.request("/api/drafts/not-a-uuid/gmail-export-request", {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const unknown = await app.request(`/api/drafts/${missingDraftId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const crossWorkspace = await app.request(
      `/api/drafts/${otherWorkspaceDraftId}/gmail-export-request`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );

    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
    expect(crossWorkspace.status).toBe(404);
  });

  it.each([
    [
      "already exported",
      requestDraft({
        metadataJson: {
          gmailExport: {
            status: "exported",
            exportedAt: "2026-05-13T17:00:00.000Z",
          },
        },
      }),
      "GMAIL_EXPORT_ALREADY_EXPORTED",
    ],
    [
      "active lease",
      requestDraft({
        metadataJson: {
          gmailExport: {
            status: "leased",
            leaseToken: "active-lease-token-abcdefghijkl",
            leaseExpiresAt: "2026-05-13T18:05:00.000Z",
          },
        },
      }),
      "GMAIL_EXPORT_ACTIVE_LEASE",
    ],
    ["non-draft status", requestDraft({ status: "approved" }), "GMAIL_EXPORT_DRAFT_NOT_READY"],
    ["missing subject", requestDraft({ subject: " " }), "GMAIL_EXPORT_MISSING_CONTENT"],
    ["missing body", requestDraft({ textBody: null }), "GMAIL_EXPORT_MISSING_CONTENT"],
    [
      "invalid recipient",
      requestDraft({ recipientEmail: "not-an-email" }),
      "GMAIL_EXPORT_MISSING_RECIPIENT",
    ],
  ])("request returns 409 for %s", async (_name, draft, code) => {
    const { app } = createRequestTestApp(createFakeRequestService({ drafts: [draft] }));

    const response = await app.request(`/api/drafts/${draftId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(code);
  });

  it("request returns 409 when email_sends already exist", async () => {
    const { app } = createRequestTestApp(createFakeRequestService({ emailSendsCount: 1 }));

    const response = await app.request(`/api/drafts/${draftId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("GMAIL_EXPORT_HAS_EMAIL_SENDS");
  });

  it("request success writes request metadata and a safe activity log", async () => {
    const requestStore = createFakeRequestService();
    const { app } = createRequestTestApp(requestStore);

    const response = await app.request(`/api/drafts/${draftId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(GmailExportRequestResponseSchema.parse(body)).toEqual(body);
    expect(body.data).toEqual({
      draftId,
      leadId,
      requestStatus: "requested",
      requestedAt: "2026-05-13T18:00:00.000Z",
      requestExpiresAt: "2026-05-14T18:00:00.000Z",
      canExport: true,
    });
    expect(requestStore.drafts.get(draftId)!.metadataJson).toMatchObject({
      keep: "metadata",
      gmailExport: {
        status: "requested",
        requestedAt: "2026-05-13T18:00:00.000Z",
        requestExpiresAt: "2026-05-14T18:00:00.000Z",
        requestSource: "admin_api",
        cancelledAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    expect(requestStore.activityLogs).toEqual([
      {
        action: "draft.gmail_export_requested",
        entityType: "draft",
        entityId: draftId,
        metadataJson: {
          draftId,
          leadId,
          source: "admin_api",
          requestedAt: "2026-05-13T18:00:00.000Z",
          requestExpiresAt: "2026-05-14T18:00:00.000Z",
        },
      },
    ]);
    expectNoResponseLeak(body);
    expectNoActivityLeak(requestStore.activityLogs);
  });

  it("request is idempotent while active and refreshes expired or cancelled requests", async () => {
    const requestStore = createFakeRequestService({
      drafts: [
        requestDraft({
          metadataJson: {
            gmailExport: requestedGmailExport(),
          },
        }),
      ],
    });
    const { app } = createRequestTestApp(requestStore);
    const idempotent = await app.request(`/api/drafts/${draftId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const idempotentBody = await idempotent.json();

    expect(idempotent.status).toBe(200);
    expect(idempotentBody.data.requestStatus).toBe("already_requested");
    expect(idempotentBody.data.requestedAt).toBe("2026-05-13T17:00:00.000Z");
    expect(requestStore.activityLogs).toHaveLength(0);

    for (const gmailExport of [
      requestedGmailExport({ requestExpiresAt: "2026-05-13T17:59:59.000Z" }),
      requestedGmailExport({ status: "cancelled", cancelledAt: "2026-05-13T17:30:00.000Z" }),
    ]) {
      const refreshStore = createFakeRequestService({
        drafts: [requestDraft({ metadataJson: { gmailExport } })],
      });
      const refreshed = await createRequestTestApp(refreshStore).app.request(
        `/api/drafts/${draftId}/gmail-export-request`,
        {
          method: "POST",
          headers: validSessionHeaders(),
        },
      );

      expect(refreshed.status).toBe(200);
      expect((await refreshed.json()).data.requestStatus).toBe("requested");
      expect(refreshStore.activityLogs).toHaveLength(1);
    }
  });

  it("cancel returns 409 for exported, active lease, or no active request", async () => {
    for (const [draft, code] of [
      [
        requestDraft({
          metadataJson: { gmailExport: requestedGmailExport({ status: "exported" }) },
        }),
        "GMAIL_EXPORT_ALREADY_EXPORTED",
      ],
      [
        requestDraft({
          metadataJson: {
            gmailExport: requestedGmailExport({
              status: "leased",
              leaseToken: "active-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T18:05:00.000Z",
            }),
          },
        }),
        "GMAIL_EXPORT_ACTIVE_LEASE",
      ],
      [requestDraft(), "GMAIL_EXPORT_NO_ACTIVE_REQUEST"],
    ] as const) {
      const { app } = createRequestTestApp(createFakeRequestService({ drafts: [draft] }));
      const response = await app.request(`/api/drafts/${draftId}/gmail-export-cancel`, {
        method: "POST",
        headers: validSessionHeaders(),
      });

      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe(code);
    }
  });

  it("cancel success writes cancellation metadata and safe activity log", async () => {
    const requestStore = createFakeRequestService({
      drafts: [
        requestDraft({
          metadataJson: {
            gmailExport: requestedGmailExport(),
          },
        }),
      ],
    });
    const { app } = createRequestTestApp(requestStore);

    const response = await app.request(`/api/drafts/${draftId}/gmail-export-cancel`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(GmailExportCancelResponseSchema.parse(body)).toEqual(body);
    expect(body.data).toEqual({
      draftId,
      leadId,
      requestStatus: "cancelled",
      cancelledAt: "2026-05-13T18:00:00.000Z",
    });
    expect(requestStore.drafts.get(draftId)!.metadataJson).toMatchObject({
      gmailExport: {
        status: "cancelled",
        requestedAt: "2026-05-13T17:00:00.000Z",
        requestExpiresAt: "2026-05-14T17:00:00.000Z",
        requestSource: "admin_api",
        cancelledAt: "2026-05-13T18:00:00.000Z",
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    expect(requestStore.activityLogs).toEqual([
      {
        action: "draft.gmail_export_cancelled",
        entityType: "draft",
        entityId: draftId,
        metadataJson: {
          draftId,
          leadId,
          source: "admin_api",
          cancelledAt: "2026-05-13T18:00:00.000Z",
        },
      },
    ]);
    expect(requestStore.emailSends).toHaveLength(0);
    expect(requestStore.approvals).toHaveLength(0);
    expectNoResponseLeak(body);
    expectNoActivityLeak(requestStore.activityLogs);
  });
});

describe("GET /api/drafts/:id/gmail-export-status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns 401 without a session", async () => {
    const { response } = await requestStatus(selectResponses(), draftId, testUser, {});

    expect(response.status).toBe(401);
  });

  it("returns 403 for authenticated non-admin users", async () => {
    const operator: AuthMe = {
      ...testUser,
      role: "operator",
    };
    const { response } = await requestStatus(selectResponses(), draftId, operator);

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid UUIDs", async () => {
    const { response } = await requestStatus(selectResponses(), "not-a-uuid");

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown draft", async () => {
    const { response } = await requestStatus(selectResponses({ draft: null }), missingDraftId);

    expect(response.status).toBe(404);
  });

  it("returns 404 for a cross-workspace draft", async () => {
    const { response } = await requestStatus(
      selectResponses({ draft: null }),
      otherWorkspaceDraftId,
    );

    expect(response.status).toBe(404);
  });

  it("does not allow API key authentication", async () => {
    const { response } = await requestStatus(selectResponses(), draftId, testUser, {
      authorization: `Bearer ${validApiKey}`,
    });

    expect(response.status).toBe(401);
  });

  it("rejects client-provided workspace identity", async () => {
    const queryResponse = await createTestApp().request(
      `/api/drafts/${draftId}/gmail-export-status?workspaceId=${workspaceId}`,
      { headers: validSessionHeaders() },
    );
    const headerResponse = await createTestApp().request(
      `/api/drafts/${draftId}/gmail-export-status`,
      { headers: validSessionHeaders({ "x-workspace-id": workspaceId }) },
    );

    expect(queryResponse.status).toBe(400);
    expect(headerResponse.status).toBe(400);
  });

  it("does not mutate drafts, metadata, logs, jobs, email sends, or approvals", async () => {
    const metadataJson = {
      gmailExport: {
        status: "leased",
        leaseToken: "active-lease-token-abcdefghijkl",
        leaseExpiresAt: "2026-05-13T18:05:00.000Z",
        source: "apps_script",
      },
      keep: "unchanged",
    };
    const beforeMetadata = JSON.stringify(metadataJson);
    const beforeUpdatedAt = new Date("2026-05-13T17:55:00.000Z").toISOString();
    const { response, tx } = await requestStatus(
      selectResponses({
        draft: draftRow({
          updatedAt: new Date(beforeUpdatedAt),
          metadataJson,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(metadataJson)).toBe(beforeMetadata);
    expect(new Date(beforeUpdatedAt).toISOString()).toBe(beforeUpdatedAt);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("derives not_requested and blocks export when gmailExport is absent", async () => {
    const { body } = await okStatus();

    expect(body.data).toMatchObject({
      draftId,
      leadId,
      draftStatus: "draft",
      hasSubject: true,
      hasBodyText: true,
      recipientStatus: "present",
      requestStatus: "not_requested",
      requestedAt: null,
      requestExpiresAt: null,
      requestSource: null,
      exportStatus: "not_exported",
      exportSource: null,
      exportedAt: null,
      leaseStatus: "none",
      leaseExpiresAt: null,
      canExport: false,
      blockingReasons: ["export_not_requested"],
      sideEffects: {
        emailSendsCount: 0,
        approvalsCount: 0,
      },
    });
  });

  it("derives active leases as leased and blocked", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              ...requestedGmailExport(),
              status: "leased",
              leaseToken: "active-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T18:05:00.000Z",
              source: "apps_script",
            },
          },
        }),
      }),
    );

    expect(body.data).toMatchObject({
      requestStatus: "leased",
      exportStatus: "leased",
      leaseStatus: "active",
      leaseExpiresAt: "2026-05-13T18:05:00.000Z",
      canExport: false,
    });
    expect(body.data.blockingReasons).toEqual(["export_in_progress"]);
  });

  it("derives expired leases as exportable when an active request exists", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              ...requestedGmailExport(),
              status: "leased",
              leaseToken: "expired-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T17:59:59.000Z",
            },
          },
        }),
      }),
    );

    expect(body.data).toMatchObject({
      requestStatus: "requested",
      exportStatus: "lease_expired",
      leaseStatus: "expired",
      canExport: true,
      blockingReasons: [],
    });
  });

  it("derives exported status from status or exportedAt", async () => {
    const exportedByStatus = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              ...requestedGmailExport(),
              status: "exported",
              exportedAt: null,
            },
          },
        }),
      }),
    );
    const exportedByTime = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              ...requestedGmailExport(),
              exportedAt: "2026-05-13T17:00:00.000Z",
            },
          },
        }),
      }),
    );

    expect(exportedByStatus.body.data).toMatchObject({
      requestStatus: "exported",
      exportStatus: "exported",
      exportedAt: null,
      canExport: false,
    });
    expect(exportedByStatus.body.data.blockingReasons).toEqual(["already_exported"]);
    expect(exportedByTime.body.data).toMatchObject({
      requestStatus: "exported",
      exportStatus: "exported",
      exportedAt: "2026-05-13T17:00:00.000Z",
      canExport: false,
    });
    expect(exportedByTime.body.data.blockingReasons).toEqual(["already_exported"]);
  });

  it("maps apps_script source and hides unknown sources", async () => {
    const appsScript = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              ...requestedGmailExport(),
              source: "apps_script",
            },
          },
        }),
      }),
    );
    const unknown = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              ...requestedGmailExport(),
              source: "manual",
            },
          },
        }),
      }),
    );

    expect(appsScript.body.data.exportSource).toBe("apps_script");
    expect(unknown.body.data.exportSource).toBeNull();
  });

  it("derives recipient present without returning the email", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: requestedGmailExport(),
          },
        }),
      }),
    );

    expect(body.data.recipientStatus).toBe("present");
    expectNoResponseLeak(body);
  });

  it("derives requested as exportable when all readiness checks pass", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: requestedGmailExport(),
          },
        }),
      }),
    );

    expect(body.data).toMatchObject({
      requestStatus: "requested",
      requestedAt: "2026-05-13T17:00:00.000Z",
      requestExpiresAt: "2026-05-14T17:00:00.000Z",
      requestSource: "admin_api",
      canExport: true,
      blockingReasons: [],
    });
  });

  it("blocks expired and cancelled requests with safe reasons", async () => {
    const expired = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: requestedGmailExport({
              requestExpiresAt: "2026-05-13T17:59:59.000Z",
            }),
          },
        }),
      }),
    );
    const cancelled = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: requestedGmailExport({
              status: "cancelled",
              cancelledAt: "2026-05-13T17:30:00.000Z",
            }),
          },
        }),
      }),
    );

    expect(expired.body.data.requestStatus).toBe("request_expired");
    expect(expired.body.data.canExport).toBe(false);
    expect(expired.body.data.blockingReasons).toContain("export_request_expired");
    expect(cancelled.body.data.requestStatus).toBe("cancelled");
    expect(cancelled.body.data.canExport).toBe(false);
    expect(cancelled.body.data.blockingReasons).toContain("export_cancelled");
  });

  it.each([
    ["missing lead", { draft: draftRow({ leadId: null }) }, "missing_lead"],
    ["lead not found in workspace", { lead: null }, "missing_lead"],
    ["missing contact id", { lead: leadRow({ contactId: null }) }, "missing_contact"],
    ["contact not found in workspace", { contact: null }, "missing_contact"],
    ["missing email", { contact: contactRow({ email: "  " }) }, "missing_email"],
    ["invalid email", { contact: contactRow({ email: "not-an-email" }) }, "invalid_email"],
  ])("derives recipientStatus for %s", async (_name, input, expected) => {
    const { body } = await okStatus(selectResponses(input));

    expect(body.data.recipientStatus).toBe(expected);
    expect(body.data.canExport).toBe(false);
    expect(body.data.blockingReasons).toContain(expected);
    expectNoResponseLeak(body);
  });

  it("blocks missing subject, missing body, non-draft status, and email sends in deterministic order", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          status: "approved",
          subject: "  ",
          textBody: "",
          metadataJson: {
            gmailExport: requestedGmailExport(),
          },
        }),
        emailSendsCount: 1,
      }),
    );

    expect(body.data.canExport).toBe(false);
    expect(body.data.blockingReasons).toEqual([
      "draft_not_ready",
      "missing_subject",
      "missing_body",
      "has_email_sends",
    ]);
    expect(body.data.sideEffects.emailSendsCount).toBe(1);
  });

  it("returns approvals count without blocking export by itself", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: requestedGmailExport(),
          },
        }),
        approvalsCount: 2,
      }),
    );

    expect(body.data.sideEffects.approvalsCount).toBe(2);
    expect(body.data.canExport).toBe(true);
    expect(body.data.blockingReasons).toEqual([]);
  });

  it("does not fall back to lead normalized email-like fields", async () => {
    const { body } = await okStatus(
      selectResponses({
        lead: leadRow({ contactId: null }),
      }),
    );

    expect(body.data.recipientStatus).toBe("missing_contact");
    expectNoResponseLeak(body);
  });

  it("keeps route and repository free of provider, Gmail, Sheets, and send behavior", () => {
    const routeSource = readFileSync(
      new URL("../routes/drafts-gmail-export-status.ts", import.meta.url),
      "utf8",
    );
    const repositorySource = readFileSync(
      new URL("../repositories/drafts-gmail-export-status.ts", import.meta.url),
      "utf8",
    );
    const serviceSource = readFileSync(
      new URL("../services/gmail-export-status.ts", import.meta.url),
      "utf8",
    );
    const combined = `${routeSource}\n${repositorySource}\n${serviceSource}`;

    expect(combined).not.toContain("GmailApp");
    expect(combined).not.toContain("Google");
    expect(combined).not.toContain("fetch(");
    expect(combined).not.toContain("createActivityLog");
    expect(combined).not.toContain("createDraft(");
    expect(combined).not.toContain("send_email");
    expect(combined).not.toContain("insert(");
    expect(combined).not.toContain("update(");
    expect(combined).not.toContain("delete(");
    expect(combined).not.toContain("activityLogs");
    expect(combined).not.toContain("backgroundJobs");
  });
});
