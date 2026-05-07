import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PushbackStatusResponseSchema, type AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createDraftRoutes } from "../routes/drafts.js";
import { createEmailSendRoutes } from "../routes/email-sends.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionPushbackStatusService,
  type PushbackStatusService,
  type PushbackStatusServiceResult,
} from "../services/pushback-status.js";
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
const emailSendId = "00000000-0000-4000-8000-000000022f01";
const olderEmailSendId = "00000000-0000-4000-8000-000000022f02";
const draftId = "00000000-0000-4000-8000-000000022f03";
const otherWorkspaceId = "00000000-0000-4000-8000-000000022f04";
const missingId = "00000000-0000-4000-8000-000000022f05";

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function createSelectBuilder(response: unknown[], state: { orderByCalls: unknown[][] }) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn((...args: unknown[]) => {
      state.orderByCalls.push(args);
      return builder;
    }),
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
    orderByCalls: [] as unknown[][],
  };

  return {
    state,
    select: vi.fn((shape?: unknown) => {
      state.selectedShapes.push(shape);
      return createSelectBuilder(state.selectResponses.shift() ?? [], state);
    }),
    insert: vi.fn(() => {
      throw new Error("pushback status must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("pushback status must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("pushback status must not delete");
    }),
  };
}

function sendRow(overrides: Record<string, unknown> = {}) {
  return {
    id: emailSendId,
    workspaceId,
    draftId,
    status: "sent",
    deliveryStatus: "delivered",
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    sentAt: new Date("2026-05-01T12:01:00.000Z"),
    updatedAt: new Date("2026-05-01T12:02:00.000Z"),
    providerMessageId: "provider-message-secret",
    toEmail: "client@example.test",
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    metadataJson: {
      hidden: true,
    },
    ...overrides,
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    workspaceId,
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    metadataJson: {
      hidden: true,
    },
    ...overrides,
  };
}

function pushbackLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000022f10",
    workspaceId,
    entityType: "email_send",
    entityId: emailSendId,
    type: "crm_pushback.succeeded",
    metadataJson: {
      diagnosticTraceId: "00000000-0000-4000-8000-000000022f11",
      emailSendId,
      maskedSpreadsheetId: "abcd...wxyz",
      range: "Pushback_Log!A:Q",
      durationMs: 42,
    },
    createdAt: new Date("2026-05-01T12:03:00.000Z"),
    ...overrides,
  };
}

async function emailSendStatus(selectResponses: unknown[][]) {
  const tx = createMockTx(selectResponses);
  mockDb.tx = tx;

  const result = await createProductionPushbackStatusService().getEmailSendPushbackStatus(
    workspaceId,
    emailSendId,
  );

  if (result.result !== "ok") {
    throw new Error("Expected ok pushback status result.");
  }

  return { status: result.status, tx };
}

async function draftStatus(selectResponses: unknown[][]) {
  const tx = createMockTx(selectResponses);
  mockDb.tx = tx;

  const result = await createProductionPushbackStatusService().getDraftPushbackStatus(
    workspaceId,
    draftId,
  );

  if (result.result !== "ok") {
    throw new Error("Expected ok pushback status result.");
  }

  return { status: result.status, tx };
}

function createEmailSendApp(
  pushbackStatusService: PushbackStatusService,
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/email-sends",
    createEmailSendRoutes({
      authService: authServiceFor(user),
      pushbackStatusService,
    }),
  );
  return app;
}

function createDraftApp(
  pushbackStatusService: PushbackStatusService,
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService: authServiceFor(user),
      pushbackStatusService,
    }),
  );
  return app;
}

function serviceResult(result: PushbackStatusServiceResult): PushbackStatusService {
  return {
    getEmailSendPushbackStatus: vi.fn(async () => result),
    getDraftPushbackStatus: vi.fn(async () => result),
  };
}

function assertSafePayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "provider_message_id",
    "providerMessageId",
    "provider-message-secret",
    "client@example.test",
    "Private subject",
    "Private text body",
    "Private HTML body",
    "htmlBody",
    "textBody",
    "toEmail",
    "fromEmail",
    "workspaceId",
    "rawGoogleError",
    "rawWebhookPayload",
    "private_key",
    "client_email",
    "credentials",
    "metadataJson",
    "hidden",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("pushback status service algorithm", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns no_send for a draft resolver with no email send", async () => {
    const { status, tx } = await draftStatus([[draftRow()], []]);

    expect(status).toMatchObject({
      target: {
        type: "draft",
        draftId,
        emailSendId: null,
        resolvedFromDraft: true,
      },
      send: {
        exists: false,
        status: null,
      },
      pushback: {
        status: "no_send",
        canReplay: false,
        canReplayReason: "no_email_send",
        replay: {
          emailSendId: null,
          endpoint: null,
        },
        counts: {
          totalPushbackEvents: 0,
          manualReplayEvents: 0,
        },
        recentHistory: [],
      },
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", "send_not_terminal", "send_not_terminal"],
    ["queued", "send_not_terminal", "send_not_terminal"],
    ["failed", "send_failed", "send_failed"],
    ["cancelled", "send_cancelled", "send_cancelled"],
  ] as const)("maps %s sends to %s", async (sendStatus, pushbackStatus, canReplayReason) => {
    const { status } = await emailSendStatus([
      [sendRow({ status: sendStatus, deliveryStatus: "delivered" })],
      [],
    ]);

    expect(status.pushback).toMatchObject({
      status: pushbackStatus,
      canReplay: false,
      canReplayReason,
      replay: {
        emailSendId: null,
        endpoint: null,
      },
    });
  });

  it("maps sent sends without delivery proof to no_delivery_proof", async () => {
    const { status } = await emailSendStatus([
      [sendRow({ status: "sent", deliveryStatus: null })],
      [],
    ]);

    expect(status.send.deliveryProofAvailable).toBe(false);
    expect(status.pushback).toMatchObject({
      status: "no_delivery_proof",
      canReplay: false,
      canReplayReason: "missing_delivery_proof",
    });
  });

  it.each(["delivered", "bounced"] as const)(
    "maps sent + %s + no log to not_pushed and replayable",
    async (deliveryStatus) => {
      const { status } = await emailSendStatus([[sendRow({ deliveryStatus })], []]);

      expect(status.send.deliveryProofAvailable).toBe(true);
      expect(status.pushback).toMatchObject({
        status: "not_pushed",
        latestEventType: null,
        canReplay: true,
        canReplayReason: null,
        replay: {
          emailSendId,
          endpoint: `/api/email-sends/${emailSendId}/pushback-replay`,
        },
      });
    },
  );

  it.each([
    ["crm_pushback.succeeded", "succeeded"],
    ["crm_pushback.failed", "failed"],
    ["crm_pushback.skipped", "skipped"],
  ] as const)("maps latest %s log to %s", async (eventType, expectedStatus) => {
    const { status } = await emailSendStatus([[sendRow()], [pushbackLog({ type: eventType })]]);

    expect(status.pushback.status).toBe(expectedStatus);
    expect(status.pushback.latestEventType).toBe(eventType);
    expect(status.pushback.canReplay).toBe(true);
  });

  it("returns failed diagnostics through explicit safe fields only", async () => {
    const { status } = await emailSendStatus([
      [sendRow()],
      [
        pushbackLog({
          type: "crm_pushback.failed",
          metadataJson: {
            diagnosticTraceId: "00000000-0000-4000-8000-000000022f12",
            source: "webhook",
            errorCode: "PUSHBACK_AUTH_FAILED",
            errorSummary: "RAW Google body should not pass through",
            rawGoogleError: "token and private details",
            rawWebhookPayload: {
              email: "client@example.test",
            },
            providerMessageId: "provider-message-secret",
            durationMs: 17,
            maskedSpreadsheetId: "abcd...wxyz",
            range: "Pushback_Log!A:Q",
          },
        }),
      ],
    ]);

    expect(status.pushback).toMatchObject({
      status: "failed",
      latestSource: "delivery_webhook",
      diagnostic: {
        diagnosticTraceId: "00000000-0000-4000-8000-000000022f12",
        errorCode: "PUSHBACK_AUTH_FAILED",
        errorSummary: "Google Sheets authentication or authorization failed.",
        durationMs: 17,
        maskedSpreadsheetId: "abcd...wxyz",
        range: "Pushback_Log!A:Q",
      },
    });
    assertSafePayload(status);
  });

  it("lets a failed log followed by manual replay succeeded resolve to succeeded", async () => {
    const { status } = await emailSendStatus([
      [sendRow()],
      [
        pushbackLog({
          id: "00000000-0000-4000-8000-000000022f21",
          type: "crm_pushback.succeeded",
          metadataJson: {
            source: "manual_replay",
            diagnosticTraceId: "00000000-0000-4000-8000-000000022f22",
          },
          createdAt: new Date("2026-05-01T12:05:00.000Z"),
        }),
        pushbackLog({
          id: "00000000-0000-4000-8000-000000022f23",
          type: "crm_pushback.failed",
          metadataJson: {
            errorCode: "PUSHBACK_APPEND_FAILED",
            diagnosticTraceId: "00000000-0000-4000-8000-000000022f24",
          },
          createdAt: new Date("2026-05-01T12:04:00.000Z"),
        }),
      ],
    ]);

    expect(status.pushback).toMatchObject({
      status: "succeeded",
      latestSource: "manual_replay",
      latestEventType: "crm_pushback.succeeded",
    });
  });

  it("lets a succeeded log followed by manual replay failed resolve to failed", async () => {
    const { status } = await emailSendStatus([
      [sendRow()],
      [
        pushbackLog({
          id: "00000000-0000-4000-8000-000000022f31",
          type: "crm_pushback.failed",
          metadataJson: {
            source: "manual_replay",
            errorCode: "PUSHBACK_APPEND_FAILED",
            diagnosticTraceId: "00000000-0000-4000-8000-000000022f32",
          },
          createdAt: new Date("2026-05-01T12:06:00.000Z"),
        }),
        pushbackLog({
          id: "00000000-0000-4000-8000-000000022f33",
          type: "crm_pushback.succeeded",
          metadataJson: {
            diagnosticTraceId: "00000000-0000-4000-8000-000000022f34",
          },
          createdAt: new Date("2026-05-01T12:05:00.000Z"),
        }),
      ],
    ]);

    expect(status.pushback).toMatchObject({
      status: "failed",
      latestSource: "manual_replay",
      latestEventType: "crm_pushback.failed",
    });
  });

  it("uses the newest log, limits recent history to 5, and counts manual replay events", async () => {
    const logs = Array.from({ length: 7 }, (_, index) =>
      pushbackLog({
        id: `00000000-0000-4000-8000-000000022f4${index}`,
        type: index === 6 ? "crm_pushback.skipped" : "crm_pushback.succeeded",
        metadataJson: {
          source: index % 2 === 0 ? "manual_replay" : "system",
          diagnosticTraceId: `00000000-0000-4000-8000-000000022f5${index}`,
          ...(index === 6 ? { errorCode: "PUSHBACK_DISABLED" } : {}),
        },
        createdAt: new Date(`2026-05-01T12:0${index}:00.000Z`),
      }),
    ).reverse();
    const { status } = await emailSendStatus([[sendRow()], logs]);

    expect(status.pushback.status).toBe("skipped");
    expect(status.pushback.latestSource).toBe("manual_replay");
    expect(status.pushback.counts).toEqual({
      totalPushbackEvents: 7,
      manualReplayEvents: 4,
    });
    expect(status.pushback.recentHistory).toHaveLength(5);
    expect(status.pushback.recentHistory[0]).toMatchObject({
      eventType: "crm_pushback.skipped",
      source: "manual_replay",
      errorCode: "PUSHBACK_DISABLED",
    });
  });
});

describe("pushback status routes", () => {
  it("requires auth for email_send pushback status", async () => {
    const service = serviceResult({ result: "not_found" });
    const response = await createEmailSendApp(service).request(
      `/api/email-sends/${emailSendId}/pushback-status`,
    );

    expect(response.status).toBe(401);
    expect(service.getEmailSendPushbackStatus).not.toHaveBeenCalled();
  });

  it("allows admin/founder access and validates the response against the shared schema", async () => {
    const { status } = await emailSendStatus([[sendRow()], []]);
    const service = serviceResult({ result: "ok", status });
    const response = await createEmailSendApp(service, {
      ...testUser,
      role: "founder",
    }).request(`/api/email-sends/${emailSendId}/pushback-status`, {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(PushbackStatusResponseSchema.parse(body.data)).toEqual(status);
  });

  it("denies non-admin members for the internal pushback status read model", async () => {
    const service = serviceResult({ result: "not_found" });
    const response = await createEmailSendApp(service, {
      ...testUser,
      role: "operator",
    }).request(`/api/email-sends/${emailSendId}/pushback-status`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
    expect(service.getEmailSendPushbackStatus).not.toHaveBeenCalled();
  });

  it("returns the existing validation error style for invalid UUID params", async () => {
    const service = serviceResult({ result: "not_found" });
    const response = await createEmailSendApp(service).request(
      "/api/email-sends/not-a-uuid/pushback-status",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
    expect(service.getEmailSendPushbackStatus).not.toHaveBeenCalled();
  });

  it("returns 404 for missing or cross-workspace email sends", async () => {
    const service = serviceResult({ result: "not_found" });
    const response = await createEmailSendApp(service).request(
      `/api/email-sends/${missingId}/pushback-status`,
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Email send not found.",
      code: "EMAIL_SEND_NOT_FOUND",
    });
    expect(service.getEmailSendPushbackStatus).toHaveBeenCalledWith(workspaceId, missingId);

    mockDb.tx = createMockTx([[]]);
    const crossWorkspace = await createProductionPushbackStatusService().getEmailSendPushbackStatus(
      otherWorkspaceId,
      emailSendId,
    );
    expect(crossWorkspace.result).toBe("not_found");
  });

  it("returns 404 for missing or cross-workspace drafts", async () => {
    const service = serviceResult({ result: "not_found" });
    const response = await createDraftApp(service).request(
      `/api/drafts/${missingId}/pushback-status`,
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Draft not found.",
      code: "DRAFT_NOT_FOUND",
    });
    expect(service.getDraftPushbackStatus).toHaveBeenCalledWith(workspaceId, missingId);

    mockDb.tx = createMockTx([[]]);
    const crossWorkspace = await createProductionPushbackStatusService().getDraftPushbackStatus(
      otherWorkspaceId,
      draftId,
    );
    expect(crossWorkspace.result).toBe("not_found");
  });

  it("returns no_send through the draft route when the draft has no email send", async () => {
    const { status } = await draftStatus([[draftRow()], []]);
    const response = await createDraftApp(serviceResult({ result: "ok", status })).request(
      `/api/drafts/${draftId}/pushback-status`,
      { headers: validSessionHeaders() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.pushback.status).toBe("no_send");
    expect(body.data.pushback.canReplayReason).toBe("no_email_send");
  });

  it("draft resolver uses the latest email_send selected by created_at desc", async () => {
    const latest = sendRow({
      id: emailSendId,
      createdAt: new Date("2026-05-01T12:05:00.000Z"),
      deliveryStatus: "bounced",
    });
    const older = sendRow({
      id: olderEmailSendId,
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      deliveryStatus: "delivered",
    });
    const { status, tx } = await draftStatus([[draftRow()], [latest, older], []]);

    expect(status.target).toMatchObject({
      type: "draft",
      draftId,
      emailSendId,
      resolvedFromDraft: true,
    });
    expect(status.send.deliveryStatus).toBe("bounced");
    expect(tx.state.orderByCalls.at(0)).toHaveLength(2);
  });

  it("does not leak provider, contact, subject, body, raw Google, raw webhook, or raw metadata fields", async () => {
    const { status } = await emailSendStatus([
      [sendRow()],
      [
        pushbackLog({
          type: "crm_pushback.failed",
          metadataJson: {
            diagnosticTraceId: "00000000-0000-4000-8000-000000022f90",
            errorCode: "PUSHBACK_APPEND_FAILED",
            errorSummary: "RAW Google body should not pass through",
            providerMessageId: "provider-message-secret",
            rawGoogleError: "raw google failure with credentials",
            rawWebhookPayload: {
              email: "client@example.test",
            },
            subject: "Private subject",
            htmlBody: "<p>Private HTML body</p>",
            textBody: "Private text body",
          },
        }),
      ],
    ]);

    assertSafePayload(status);
  });

  it("GET does not mutate email_sends, activity_logs, or background_jobs and does not call providers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { tx } = await emailSendStatus([[sendRow()], [pushbackLog()]]);

    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const combined = [
      readFileSync(new URL("../services/pushback-status.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../repositories/pushback-status.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../routes/email-sends.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../routes/drafts.ts", import.meta.url), "utf8"),
    ].join("\n");

    expect(combined).not.toMatch(
      /pushDeliveryProofToGoogleSheets|Resend|fetch\(|backgroundJobs|enqueue|createActivityLog|update\(emailSends\)|insert\(activityLogs\)/,
    );
  });
});
