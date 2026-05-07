import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createEmailSendRoutes } from "../routes/email-sends.js";
import type { AuthService } from "../services/auth.js";
import { createProductionEmailSendPushbackReplayService } from "../services/email-send-pushback-replay.js";
import type { EmailSendPushbackReplayService } from "../services/email-send-pushback-replay.js";
import { pushDeliveryProofToGoogleSheets } from "../services/pushback/google-sheets.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../services/pushback/google-sheets.js", () => ({
  pushDeliveryProofToGoogleSheets: vi.fn(async () => ({
    result: "succeeded",
    diagnosticTraceId: "00000000-0000-4000-8000-000000022501",
  })),
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000022599" })),
}));

const emailSendId = "00000000-0000-4000-8000-000000022501";
const draftId = "00000000-0000-4000-8000-000000022502";
const leadId = "00000000-0000-4000-8000-000000022503";
const otherWorkspaceId = "00000000-0000-4000-8000-000000022504";
const diagnosticTraceId = "00000000-0000-4000-8000-000000022505";

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => response),
  };

  return builder;
}

function createMockTx(selectResponses: unknown[][] = []) {
  const state = {
    selectResponses,
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    update: vi.fn(() => {
      throw new Error("pushback replay must not mutate email_sends");
    }),
    insert: vi.fn(() => {
      throw new Error("pushback replay must not create rows directly");
    }),
  };
}

function emailSendRow(overrides: Record<string, unknown> = {}) {
  return {
    id: emailSendId,
    workspaceId: testUser.workspaceId,
    approvalId: "00000000-0000-4000-8000-000000022506",
    draftId,
    leadId,
    contactId: "00000000-0000-4000-8000-000000022507",
    fromEmail: "no-reply@syrantis.local",
    toEmail: "private@example.test",
    replyToEmail: null,
    subject: "Private subject",
    textBody: "Private text",
    htmlBody: "<p>Private</p>",
    provider: "resend",
    providerMessageId: "provider-message-secret",
    idempotencyKey: "send-key",
    approvalCheckedAt: null,
    suppressionCheckedAt: null,
    attemptCount: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    status: "sent",
    sentAt: new Date("2026-05-01T12:00:00.000Z"),
    failedAt: null,
    deliveryStatus: "delivered",
    deliveredAt: new Date("2026-05-01T12:01:00.000Z"),
    bouncedAt: null,
    complainedAt: null,
    deliveryErrorCode: null,
    metadataJson: {},
    createdAt: new Date("2026-05-01T11:59:00.000Z"),
    updatedAt: new Date("2026-05-01T12:01:00.000Z"),
    ...overrides,
  };
}

function authServiceFor(user: AuthMe | null): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function createReplayRouteApp(
  replayService: EmailSendPushbackReplayService,
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/email-sends",
    createEmailSendRoutes({
      authService: authServiceFor(user),
      pushbackReplayService: replayService,
    }),
  );
  return app;
}

function replayServiceResult(result: Awaited<ReturnType<EmailSendPushbackReplayService["replayPushback"]>>) {
  return {
    replayPushback: vi.fn(async () => result),
  };
}

function lastActivityMetadata() {
  const calls = vi.mocked(createActivityLog).mock.calls;
  if (!calls.length) {
    throw new Error("createActivityLog was not called");
  }

  return calls.at(-1)![1].metadataJson ?? {};
}

function expectSafeReplayPayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "provider_message_id",
    "providerMessageId",
    "Private subject",
    "Private text",
    "private@example.test",
    "htmlBody",
    "textBody",
    "toEmail",
    "fromEmail",
    "workspaceId",
    "GOOGLE_SHEETS_CREDENTIALS_JSON",
    "private_key",
    "client_email",
    "raw Google",
    "raw provider",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("POST /api/email-sends/:id/pushback-replay route", () => {
  it("returns 401 when unauthenticated", async () => {
    const replayService = replayServiceResult(null);
    const response = await createReplayRouteApp(replayService).request(
      `/api/email-sends/${emailSendId}/pushback-replay`,
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    expect(replayService.replayPushback).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin users", async () => {
    const replayService = replayServiceResult(null);
    const response = await createReplayRouteApp(replayService, {
      ...testUser,
      role: "operator",
    }).request(`/api/email-sends/${emailSendId}/pushback-replay`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
    expect(replayService.replayPushback).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid UUID path params", async () => {
    const replayService = replayServiceResult(null);
    const response = await createReplayRouteApp(replayService).request(
      "/api/email-sends/not-a-uuid/pushback-replay",
      { method: "POST", headers: validSessionHeaders() },
    );

    expect(response.status).toBe(400);
    expect(replayService.replayPushback).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown or cross-workspace email sends", async () => {
    const replayService = replayServiceResult(null);
    const response = await createReplayRouteApp(replayService).request(
      `/api/email-sends/${emailSendId}/pushback-replay`,
      { method: "POST", headers: validSessionHeaders() },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Email send not found.",
      code: "EMAIL_SEND_NOT_FOUND",
    });
  });

  it("returns compact safe replay JSON for business outcomes", async () => {
    const replayService = replayServiceResult({
      result: "failed",
      diagnosticTraceId,
      errorCode: "PUSHBACK_APPEND_FAILED",
    });

    const response = await createReplayRouteApp(replayService).request(
      `/api/email-sends/${emailSendId}/pushback-replay`,
      { method: "POST", headers: validSessionHeaders() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        emailSendId,
        result: "failed",
        diagnosticTraceId,
        errorCode: "PUSHBACK_APPEND_FAILED",
      },
    });
    expectSafeReplayPayload(body);
  });
});

describe("manual email send pushback replay service", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockDb.tx = createMockTx([[emailSendRow()]]);
    vi.mocked(pushDeliveryProofToGoogleSheets).mockResolvedValue({
      result: "succeeded",
      diagnosticTraceId,
    });
  });

  it("returns null for unknown or cross-workspace email sends", async () => {
    mockDb.tx = createMockTx([[]]);

    const result = await createProductionEmailSendPushbackReplayService().replayPushback(
      otherWorkspaceId,
      emailSendId,
    );

    expect(result).toBeNull();
    expect(pushDeliveryProofToGoogleSheets).not.toHaveBeenCalled();
  });

  it("returns skipped when delivery_status is null", async () => {
    mockDb.tx = createMockTx([[emailSendRow({ deliveryStatus: null, deliveredAt: null })]]);

    const result = await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );

    expect(result).toMatchObject({
      result: "skipped",
      errorCode: "PUSHBACK_DELIVERY_STATUS_MISSING",
    });
    expect(pushDeliveryProofToGoogleSheets).not.toHaveBeenCalled();
    expect(lastActivityMetadata()).toMatchObject({
      source: "manual_replay",
      emailSendId,
      draftId,
      leadId,
      sendStatus: "sent",
      errorCode: "PUSHBACK_DELIVERY_STATUS_MISSING",
    });
    expectSafeReplayPayload(lastActivityMetadata());
  });

  it.each(["pending", "queued", "cancelled", "failed"])(
    "returns skipped for %s email sends without replaying",
    async (status) => {
      mockDb.tx = createMockTx([[emailSendRow({ status })]]);

      const result = await createProductionEmailSendPushbackReplayService().replayPushback(
        testUser.workspaceId,
        emailSendId,
      );

      expect(result).toMatchObject({
        result: "skipped",
        errorCode: "PUSHBACK_EMAIL_SEND_NOT_SENT",
      });
      expect(pushDeliveryProofToGoogleSheets).not.toHaveBeenCalled();
      expect(lastActivityMetadata()).toMatchObject({
        source: "manual_replay",
        deliveryStatus: "delivered",
        sendStatus: status,
      });
    },
  );

  it.each([
    ["delivered", "email.delivered", "deliveredAt"],
    ["bounced", "email.bounced", "bouncedAt"],
    ["complained", "email.complained", "complainedAt"],
  ])("replays %s delivery proof through Google Sheets pushback", async (deliveryStatus, eventType, timestampKey) => {
    const occurredAt = new Date("2026-05-01T12:03:00.000Z");
    mockDb.tx = createMockTx([[
      emailSendRow({
        deliveryStatus,
        deliveredAt: null,
        bouncedAt: null,
        complainedAt: null,
        [timestampKey]: occurredAt,
      }),
    ]]);

    const result = await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );

    expect(result).toEqual({ result: "succeeded", diagnosticTraceId });
    expect(pushDeliveryProofToGoogleSheets).toHaveBeenCalledWith({
      workspaceId: testUser.workspaceId,
      emailSendId,
      eventType,
      occurredAt,
      source: "manual_replay",
      draftId,
      leadId,
      deliveryStatus,
      sendStatus: "sent",
      safeSummaryOverride: expect.stringMatching(/^Replay manuel du statut /),
    });
  });

  it("returns skipped when Google Sheets pushback is disabled", async () => {
    vi.mocked(pushDeliveryProofToGoogleSheets).mockResolvedValueOnce({
      result: "skipped",
      diagnosticTraceId,
      errorCode: "PUSHBACK_DISABLED",
    });

    const result = await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );

    expect(result).toEqual({
      result: "skipped",
      diagnosticTraceId,
      errorCode: "PUSHBACK_DISABLED",
    });
  });

  it("returns failed with a safe error code when Google Sheets append fails", async () => {
    vi.mocked(pushDeliveryProofToGoogleSheets).mockResolvedValueOnce({
      result: "failed",
      diagnosticTraceId,
      errorCode: "PUSHBACK_APPEND_FAILED",
    });

    const result = await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );

    expect(result).toEqual({
      result: "failed",
      diagnosticTraceId,
      errorCode: "PUSHBACK_APPEND_FAILED",
    });
  });

  it("does not mutate email_sends state or create background jobs", async () => {
    const original = emailSendRow();
    mockDb.tx = createMockTx([[original]]);
    const tx = mockDb.tx as { update: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

    await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(original).toMatchObject({
      status: "sent",
      deliveryStatus: "delivered",
      sentAt: new Date("2026-05-01T12:00:00.000Z"),
      failedAt: null,
      deliveredAt: new Date("2026-05-01T12:01:00.000Z"),
      bouncedAt: null,
      complainedAt: null,
      deliveryErrorCode: null,
    });
  });

  it("does not import email sending, webhook, fetch, or background job paths", () => {
    const source = readFileSync(
      new URL("../services/email-send-pushback-replay.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/sendEmail|provider\.send|Resend|fetch\(|backgroundJobs|enqueue|update\(emailSends\)/);
  });

  it("allows duplicate replay attempts", async () => {
    mockDb.tx = createMockTx([[emailSendRow()], [emailSendRow()]]);

    await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );
    await createProductionEmailSendPushbackReplayService().replayPushback(
      testUser.workspaceId,
      emailSendId,
    );

    expect(pushDeliveryProofToGoogleSheets).toHaveBeenCalledTimes(2);
  });
});
