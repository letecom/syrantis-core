import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DraftSendReadinessOutput,
  EmailSendOutput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createDraftRoutes } from "../routes/drafts.js";
import { computeDraftSendReadiness } from "../services/draft-send-readiness.js";
import type {
  DraftSendReadinessService,
  DraftSendReadinessServiceResult,
} from "../services/draft-send-readiness.js";
import type { EmailSendRequestServiceResult, EmailSendService } from "../services/email-sends.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021d99" })),
}));

const draftId = "00000000-0000-4000-8000-000000021d01";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000021d02";
const missingDraftId = "00000000-0000-4000-8000-000000021d03";
const contactId = "00000000-0000-4000-8000-000000021d11";
const approvalId = "00000000-0000-4000-8000-000000021d21";
const emailSendId = "00000000-0000-4000-8000-000000021d31";
const backgroundJobId = "00000000-0000-4000-8000-000000021d41";

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function jsonHeaders() {
  return {
    ...validSessionHeaders(),
    "content-type": "application/json",
  };
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(async () => response),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx() {
  const state = {
    selectResponses: [] as unknown[][],
    insertResponses: [] as unknown[],
    insertValues: [] as unknown[],
    updateCalls: 0,
    deleteCalls: 0,
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        state.insertValues.push(values);
        return {
          returning: vi.fn(async () => {
            const response = state.insertResponses.shift();
            return response ? [response] : [];
          }),
        };
      }),
    })),
    update: vi.fn(() => {
      state.updateCalls += 1;
      throw new Error("send readiness must not update");
    }),
    delete: vi.fn(() => {
      state.deleteCalls += 1;
      throw new Error("send readiness must not delete");
    }),
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    status: "approved",
    channel: "email",
    contactId,
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    metadataJson: { hidden: true },
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: contactId,
    email: "client@example.test",
    optOut: false,
    firstName: "Ada",
    lastName: "Client",
    phone: "+33600000000",
    ...overrides,
  };
}

function emailSendRow(status: string) {
  return {
    id: emailSendId,
    status,
    provider: "resend",
    providerMessageId: "provider-secret",
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    toEmail: "client@example.test",
  };
}

function readinessSelects(
  row: Record<string, unknown> | null,
  options: {
    contact?: unknown[];
    approvedApproval?: unknown[];
    latestEmailSend?: unknown[];
  } = {},
) {
  if (!row) {
    return [[]];
  }

  return [
    [row],
    ...(row.contactId ? [options.contact ?? [contactRow()]] : []),
    options.approvedApproval ?? [{ id: approvalId }],
    options.latestEmailSend ?? [],
  ];
}

async function computeReadiness(
  selectResponses: unknown[][],
): Promise<{ result: DraftSendReadinessServiceResult; tx: ReturnType<typeof createMockTx> }> {
  const tx = createMockTx();
  tx.state.selectResponses.push(...selectResponses);
  mockDb.tx = tx;

  return {
    result: await computeDraftSendReadiness(testUser.workspaceId, draftId),
    tx,
  };
}

function readinessCodes(readiness: DraftSendReadinessOutput) {
  return readiness.checks.map((check) => check.code);
}

function createTestApp(
  draftSendReadinessService?: DraftSendReadinessService,
  emailSendService?: EmailSendService,
): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService: createFakeAuthService(),
      ...(draftSendReadinessService ? { draftSendReadinessService } : {}),
      ...(emailSendService ? { emailSendService } : {}),
    }),
  );

  return app;
}

function createReadyService(
  readiness: DraftSendReadinessOutput,
): DraftSendReadinessService {
  return {
    computeDraftSendReadiness: vi.fn(async (): Promise<DraftSendReadinessServiceResult> => ({
      result: "ok",
      readiness,
    })),
  };
}

function readyOutput(overrides: Partial<DraftSendReadinessOutput> = {}): DraftSendReadinessOutput {
  return {
    draftId,
    status: "ready",
    canRequestSend: true,
    blockerCount: 0,
    warningCount: 0,
    checks: [],
    context: {
      draftStatus: "approved",
      channel: "email",
      hasSubject: true,
      hasBody: true,
      hasContact: true,
      contactHasEmail: true,
      contactOptOut: false,
      hasApprovedApproval: true,
      latestEmailSendStatus: null,
    },
    ...overrides,
  };
}

function pendingEmailSend(): EmailSendOutput {
  return {
    id: emailSendId,
    workspaceId: testUser.workspaceId,
    draftId,
    status: "pending",
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
  };
}

function emailSendRowForInsert() {
  return {
    id: emailSendId,
    workspaceId: testUser.workspaceId,
    approvalId,
    draftId,
    leadId: null,
    contactId,
    fromEmail: "no-reply@syrantis.local",
    toEmail: "client@example.test",
    replyToEmail: null,
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    provider: "internal",
    providerMessageId: null,
    idempotencyKey: `request_send:${draftId}:00000000-0000-4000-8000-000000021d51`,
    approvalCheckedAt: null,
    suppressionCheckedAt: null,
    attemptCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    status: "pending",
    sentAt: null,
    failedAt: null,
    metadataJson: { source: "draft.request_send" },
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
  };
}

function backgroundJobRow() {
  return {
    id: backgroundJobId,
    workspaceId: testUser.workspaceId,
    type: "send_email",
    payloadJson: { emailSendId },
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date("2026-05-01T12:00:00.000Z"),
    lockedAt: null,
    lockedBy: null,
    completedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
  };
}

describe("computeDraftSendReadiness", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns ready for an approved email draft with subject, body, contact email, approval, and no send", async () => {
    const { result } = await computeReadiness(readinessSelects(draftRow()));

    expect(result.result).toBe("ok");
    expect(result.result === "ok" ? result.readiness : null).toMatchObject({
      draftId,
      status: "ready",
      canRequestSend: true,
      blockerCount: 0,
      warningCount: 0,
      checks: [],
      context: {
        draftStatus: "approved",
        channel: "email",
        hasSubject: true,
        hasBody: true,
        hasContact: true,
        contactHasEmail: true,
        contactOptOut: false,
        hasApprovedApproval: true,
        latestEmailSendStatus: null,
      },
    });
  });

  it.each([
    ["non-approved draft", draftRow({ status: "draft" }), "DRAFT_NOT_APPROVED"],
    ["unsupported channel", draftRow({ channel: "sms" }), "UNSUPPORTED_CHANNEL"],
    ["missing subject", draftRow({ subject: "   " }), "EMPTY_SUBJECT"],
    ["missing body", draftRow({ textBody: " ", htmlBody: null }), "EMPTY_BODY"],
    ["no contact", draftRow({ contactId: null }), "NO_CONTACT"],
  ])("returns blocked for %s", async (_label, row, expectedCode) => {
    const { result } = await computeReadiness(readinessSelects(row));

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.status).toBe("blocked");
    expect(readiness?.canRequestSend).toBe(false);
    expect(readiness ? readinessCodes(readiness) : []).toContain(expectedCode);
  });

  it("returns blocked for invalid or cross-workspace contact", async () => {
    const { result } = await computeReadiness(
      readinessSelects(draftRow(), {
        contact: [],
      }),
    );

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.context).toMatchObject({
      hasContact: false,
      contactHasEmail: null,
      contactOptOut: null,
    });
    expect(readiness ? readinessCodes(readiness) : []).toContain("INVALID_CONTACT");
  });

  it.each([
    ["contact without email", contactRow({ email: "  " }), "CONTACT_NO_EMAIL"],
    ["opted-out contact", contactRow({ optOut: true }), "CONTACT_OPTED_OUT"],
  ])("returns blocked for %s", async (_label, contact, expectedCode) => {
    const { result } = await computeReadiness(
      readinessSelects(draftRow(), {
        contact: [contact],
      }),
    );

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.status).toBe("blocked");
    expect(readiness ? readinessCodes(readiness) : []).toContain(expectedCode);
  });

  it("returns blocked when no approved approval exists", async () => {
    const { result } = await computeReadiness(
      readinessSelects(draftRow(), {
        approvedApproval: [],
      }),
    );

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.context.hasApprovedApproval).toBe(false);
    expect(readiness ? readinessCodes(readiness) : []).toContain("APPROVAL_NOT_CONFIRMED");
  });

  it.each([
    ["pending", "EMAIL_SEND_ALREADY_PENDING"],
    ["queued", "EMAIL_SEND_ALREADY_QUEUED"],
    ["sent", "EMAIL_ALREADY_SENT"],
  ])("returns blocked for existing %s email send", async (status, expectedCode) => {
    const { result } = await computeReadiness(
      readinessSelects(draftRow(), {
        latestEmailSend: [emailSendRow(status)],
      }),
    );

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.context.latestEmailSendStatus).toBe(status);
    expect(readiness?.status).toBe("blocked");
    expect(readiness ? readinessCodes(readiness) : []).toContain(expectedCode);
  });

  it.each([
    ["failed", "PREVIOUS_SEND_FAILED"],
    ["cancelled", "PREVIOUS_SEND_CANCELLED"],
  ])("returns ready_with_warnings for previous %s email send", async (status, expectedCode) => {
    const { result } = await computeReadiness(
      readinessSelects(draftRow(), {
        latestEmailSend: [emailSendRow(status)],
      }),
    );

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.status).toBe("ready_with_warnings");
    expect(readiness?.canRequestSend).toBe(true);
    expect(readiness ? readinessCodes(readiness) : []).toContain(expectedCode);
  });

  it.each([
    ["only text body exists", draftRow({ htmlBody: null }), "NO_HTML_BODY"],
    ["only HTML body exists", draftRow({ textBody: null }), "NO_TEXT_BODY"],
  ])("returns body-format warning when %s", async (_label, row, expectedCode) => {
    const { result } = await computeReadiness(readinessSelects(row));

    expect(result.result).toBe("ok");
    const readiness = result.result === "ok" ? result.readiness : null;
    expect(readiness?.status).toBe("ready_with_warnings");
    expect(readiness?.canRequestSend).toBe(true);
    expect(readiness ? readinessCodes(readiness) : []).toContain(expectedCode);
  });

  it("returns not_found for missing, archived, or cross-workspace drafts", async () => {
    const { result } = await computeReadiness(readinessSelects(null));

    expect(result).toEqual({ result: "not_found" });
  });

  it("does not create activity logs, jobs, email sends, or mutate business rows", async () => {
    const { tx } = await computeReadiness(readinessSelects(draftRow()));

    expect(createActivityLog).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.state.insertValues).toEqual([]);
    expect(tx.state.updateCalls).toBe(0);
    expect(tx.state.deleteCalls).toBe(0);
  });
});

describe("GET /api/drafts/:id/send-readiness", () => {
  beforeEach(() => {
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns the send readiness read model without raw PII or content", async () => {
    const tx = createMockTx();
    tx.state.selectResponses.push(...readinessSelects(draftRow()));
    mockDb.tx = tx;

    const response = await createTestApp().request(`/api/drafts/${draftId}/send-readiness`, {
      headers: validSessionHeaders(),
    });
    const body = (await response.json()) as { data: DraftSendReadinessOutput };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ready");
    expect(serialized).not.toContain("Private subject");
    expect(serialized).not.toContain("Private text body");
    expect(serialized).not.toContain("Private HTML body");
    expect(serialized).not.toContain("client@example.test");
    expect(serialized).not.toContain("+33600000000");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("Client");
    expect(serialized).not.toContain("provider-secret");
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 404 for missing or cross-workspace drafts", async () => {
    for (const id of [missingDraftId, otherWorkspaceDraftId]) {
      const tx = createMockTx();
      tx.state.selectResponses.push(...readinessSelects(null));
      mockDb.tx = tx;

      const response = await createTestApp().request(`/api/drafts/${id}/send-readiness`, {
        headers: validSessionHeaders(),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        success: false,
        error: "Draft not found.",
        code: "DRAFT_NOT_FOUND",
      });
      expect(tx.insert).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/drafts/:id/request-send readiness gate", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns 409 SEND_READINESS_BLOCKED before request-send mutation when blockers exist", async () => {
    const blocked = readyOutput({
      status: "blocked",
      canRequestSend: false,
      blockerCount: 1,
      warningCount: 0,
      checks: [
        {
          code: "DRAFT_NOT_APPROVED",
          severity: "blocker",
          source: "draft",
          message: "Draft must be approved before send can be requested.",
        },
      ],
    });
    const emailSendService: EmailSendService = {
      listEmailSends: vi.fn(async () => []),
      getEmailSend: vi.fn(async () => null),
      requestSendFromDraft: vi.fn(
        async (): Promise<EmailSendRequestServiceResult> => ({
          result: "ok",
          emailSend: pendingEmailSend(),
        }),
      ),
    };
    const app = createTestApp(createReadyService(blocked), emailSendService);

    const response = await app.request(`/api/drafts/${draftId}/request-send`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Draft send readiness blocked.",
      code: "SEND_READINESS_BLOCKED",
      details: {
        readiness: blocked,
        checks: blocked.checks,
      },
    });
    expect(emailSendService.requestSendFromDraft).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("allows warning-only request-send and preserves the existing success response", async () => {
    const warningOnly = readyOutput({
      status: "ready_with_warnings",
      warningCount: 1,
      checks: [
        {
          code: "NO_HTML_BODY",
          severity: "warning",
          source: "draft",
          message: "HTML body is missing.",
          field: "htmlBody",
        },
      ],
    });
    const emailSendService: EmailSendService = {
      listEmailSends: vi.fn(async () => []),
      getEmailSend: vi.fn(async () => null),
      requestSendFromDraft: vi.fn(
        async (): Promise<EmailSendRequestServiceResult> => ({
          result: "ok",
          emailSend: pendingEmailSend(),
        }),
      ),
    };
    const app = createTestApp(createReadyService(warningOnly), emailSendService);

    const response = await app.request(`/api/drafts/${draftId}/request-send`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ message: "Send it." }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: pendingEmailSend() });
    expect(emailSendService.requestSendFromDraft).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      draftId,
      { message: "Send it." },
    );
  });

  it("creates exactly one email_send and one send_email job for clean request-send", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tx = createMockTx();
    tx.state.selectResponses.push(
      ...readinessSelects(draftRow()),
      [draftRow()],
      [{ id: approvalId }],
      [{ id: contactId, email: "client@example.test" }],
    );
    tx.state.insertResponses.push(emailSendRowForInsert(), backgroundJobRow());
    mockDb.tx = tx;

    const response = await createTestApp().request(`/api/drafts/${draftId}/request-send`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: pendingEmailSend() });
    expect(tx.state.insertValues).toHaveLength(2);
    expect(tx.state.insertValues[0]).toMatchObject({
      draftId,
      status: "pending",
      provider: "internal",
    });
    expect(tx.state.insertValues[1]).toMatchObject({
      type: "send_email",
      payloadJson: { emailSendId },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["failed", "cancelled"])(
    "allows retry after previous %s email_send and creates a new email_send",
    async (status) => {
      const tx = createMockTx();
      tx.state.selectResponses.push(
        ...readinessSelects(draftRow(), {
          latestEmailSend: [emailSendRow(status)],
        }),
        [draftRow()],
        [{ id: approvalId }],
        [{ id: contactId, email: "client@example.test" }],
      );
      tx.state.insertResponses.push(emailSendRowForInsert(), backgroundJobRow());
      mockDb.tx = tx;

      const response = await createTestApp().request(`/api/drafts/${draftId}/request-send`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(201);
      expect(tx.state.insertValues).toHaveLength(2);
      expect(tx.state.insertValues[0]).toMatchObject({ draftId, status: "pending" });
    },
  );

  it.each(["pending", "queued", "sent"])(
    "blocks duplicate request-send when latest email_send is %s",
    async (status) => {
      const tx = createMockTx();
      tx.state.selectResponses.push(
        ...readinessSelects(draftRow(), {
          latestEmailSend: [emailSendRow(status)],
        }),
      );
      mockDb.tx = tx;

      const response = await createTestApp().request(`/api/drafts/${draftId}/request-send`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(409);
      expect(tx.state.insertValues).toEqual([]);
      expect(createActivityLog).not.toHaveBeenCalled();
    },
  );
});
