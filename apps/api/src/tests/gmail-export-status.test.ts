import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GmailExportStatusSuccessSchema, type AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createDraftGmailExportStatusRoutes } from "../routes/drafts-gmail-export-status.js";
import type { AuthService } from "../services/auth.js";
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

  it("derives not_exported and lease none when gmailExport is absent", async () => {
    const { body } = await okStatus();

    expect(body.data).toMatchObject({
      draftId,
      leadId,
      draftStatus: "draft",
      hasSubject: true,
      hasBodyText: true,
      recipientStatus: "present",
      exportStatus: "not_exported",
      exportSource: null,
      exportedAt: null,
      leaseStatus: "none",
      leaseExpiresAt: null,
      canExport: true,
      blockingReasons: [],
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
      exportStatus: "leased",
      leaseStatus: "active",
      leaseExpiresAt: "2026-05-13T18:05:00.000Z",
      canExport: false,
    });
    expect(body.data.blockingReasons).toEqual(["active_lease"]);
  });

  it("derives expired leases as exportable when everything else is ready", async () => {
    const { body } = await okStatus(
      selectResponses({
        draft: draftRow({
          metadataJson: {
            gmailExport: {
              status: "leased",
              leaseToken: "expired-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T17:59:59.000Z",
            },
          },
        }),
      }),
    );

    expect(body.data).toMatchObject({
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
              exportedAt: "2026-05-13T17:00:00.000Z",
            },
          },
        }),
      }),
    );

    expect(exportedByStatus.body.data).toMatchObject({
      exportStatus: "exported",
      exportedAt: null,
      canExport: false,
    });
    expect(exportedByStatus.body.data.blockingReasons).toEqual(["already_exported"]);
    expect(exportedByTime.body.data).toMatchObject({
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
    const { body } = await okStatus();

    expect(body.data.recipientStatus).toBe("present");
    expectNoResponseLeak(body);
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
