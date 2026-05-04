import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createDraftRoutes } from "../routes/drafts.js";
import { createFakeAuthService, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021f99" })),
}));

const draftId = "00000000-0000-4000-8000-000000021f01";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000021f02";
const missingDraftId = "00000000-0000-4000-8000-000000021f03";

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function createTestApp(): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService: createFakeAuthService(),
    }),
  );

  return app;
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
      throw new Error("send status must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("send status must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("send status must not delete");
    }),
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    metadataJson: { hidden: true },
    ...overrides,
  };
}

function sendRow(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000021f31",
    workspaceId: "00000000-0000-4000-8000-000000021f32",
    draftId,
    status,
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:05.000Z"),
    sentAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: "Private provider error details",
    deliveryStatus: null,
    deliveredAt: null,
    bouncedAt: null,
    complainedAt: null,
    deliveryErrorCode: null,
    provider: "resend",
    providerMessageId: "provider-message-secret",
    toEmail: "client@example.test",
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    promptJson: { hidden: true },
    outputJson: { hidden: true },
    costEstimate: "1.23",
    inputTokens: 100,
    outputTokens: 200,
    ...overrides,
  };
}

async function requestSendStatus(selectResponses: unknown[][], id: string = draftId) {
  const tx = createMockTx(selectResponses);
  mockDb.tx = tx;

  const response = await createTestApp().request(`/api/drafts/${id}/send-status`, {
    headers: validSessionHeaders(),
  });

  return { response, tx };
}

async function expectLatestStatus(
  status: "pending" | "queued" | "sent" | "failed" | "cancelled",
  overrides: Record<string, unknown> = {},
) {
  const { response } = await requestSendStatus([[draftRow()], [sendRow(status, overrides)]]);

  expect(response.status).toBe(200);
  return response.json();
}

describe("GET /api/drafts/:id/send-status", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns hasSend=false and latestSend=null when the draft has no email sends", async () => {
    const { response, tx } = await requestSendStatus([[draftRow()], []]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draftId,
        hasSend: false,
        latestSend: null,
      },
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("returns latest pending send status", async () => {
    await expect(
      expectLatestStatus("pending"),
    ).resolves.toEqual({
      success: true,
      data: {
        draftId,
        hasSend: true,
        latestSend: {
          status: "pending",
          requestedAt: "2026-05-01T12:00:00.000Z",
          updatedAt: "2026-05-01T12:00:05.000Z",
          sentAt: null,
          failedAt: null,
          errorCode: null,
          deliveryStatus: null,
          deliveredAt: null,
          bouncedAt: null,
          complainedAt: null,
          deliveryErrorCode: null,
        },
      },
    });
  });

  it("returns latest queued send status", async () => {
    const body = await expectLatestStatus("queued");

    expect(body.data.latestSend.status).toBe("queued");
  });

  it("returns latest sent send status with sentAt populated", async () => {
    const body = await expectLatestStatus("sent", {
      sentAt: new Date("2026-05-01T12:01:00.000Z"),
    });

    expect(body.data.latestSend).toMatchObject({
      status: "sent",
      sentAt: "2026-05-01T12:01:00.000Z",
      failedAt: null,
    });
  });

  it("returns latest failed send status with failedAt and sanitized errorCode", async () => {
    const body = await expectLatestStatus("failed", {
      failedAt: new Date("2026-05-01T12:02:00.000Z"),
      lastErrorCode: "RESEND_TEMPORARY_FAILURE",
    });

    expect(body.data.latestSend).toMatchObject({
      status: "failed",
      failedAt: "2026-05-01T12:02:00.000Z",
      errorCode: "RESEND_TEMPORARY_FAILURE",
    });
    expect(JSON.stringify(body)).not.toContain("Private provider error details");
  });

  it("returns safe delivery proof fields", async () => {
    const body = await expectLatestStatus("sent", {
      sentAt: new Date("2026-05-01T12:01:00.000Z"),
      deliveryStatus: "complained",
      deliveredAt: new Date("2026-05-01T12:02:00.000Z"),
      complainedAt: new Date("2026-05-01T12:03:00.000Z"),
      deliveryErrorCode: "RESEND_COMPLAINED",
    });

    expect(body.data.latestSend).toMatchObject({
      deliveryStatus: "complained",
      deliveredAt: "2026-05-01T12:02:00.000Z",
      bouncedAt: null,
      complainedAt: "2026-05-01T12:03:00.000Z",
      deliveryErrorCode: "RESEND_COMPLAINED",
    });
    expect(JSON.stringify(body)).not.toContain("provider-message-secret");
  });

  it("returns latest cancelled send status", async () => {
    const body = await expectLatestStatus("cancelled");

    expect(body.data.latestSend.status).toBe("cancelled");
  });

  it("returns the latest email send selected by created_at desc and id desc", async () => {
    const latest = sendRow("queued", {
      id: "00000000-0000-4000-8000-000000021f35",
      createdAt: new Date("2026-05-01T12:05:00.000Z"),
    });
    const older = sendRow("failed", {
      id: "00000000-0000-4000-8000-000000021f34",
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      failedAt: new Date("2026-05-01T12:01:00.000Z"),
    });
    const { response, tx } = await requestSendStatus([[draftRow()], [latest, older]]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        hasSend: true,
        latestSend: {
          status: "queued",
          requestedAt: "2026-05-01T12:05:00.000Z",
        },
      },
    });
    expect(tx.state.orderByCalls.at(-1)).toHaveLength(2);
  });

  it("returns the newest retry email send row after retry scheduling", async () => {
    const failedAttempt = sendRow("failed", {
      id: "00000000-0000-4000-8000-000000021f36",
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      updatedAt: new Date("2026-05-01T12:00:05.000Z"),
      failedAt: new Date("2026-05-01T12:00:05.000Z"),
      lastErrorCode: "EMAIL_PROVIDER_HTTP_ERROR",
    });
    const retryAttempt = sendRow("pending", {
      id: "00000000-0000-4000-8000-000000021f37",
      createdAt: new Date("2026-05-01T12:00:06.000Z"),
      updatedAt: new Date("2026-05-01T12:00:06.000Z"),
    });
    const { response } = await requestSendStatus([[draftRow()], [retryAttempt, failedAttempt]]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        draftId,
        hasSend: true,
        latestSend: {
          status: "pending",
          requestedAt: "2026-05-01T12:00:06.000Z",
          updatedAt: "2026-05-01T12:00:06.000Z",
          errorCode: null,
        },
      },
    });
  });

  it("returns 404 for a non-existent draft", async () => {
    const { response, tx } = await requestSendStatus([[]], missingDraftId);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "DRAFT_NOT_FOUND",
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("returns 404 for a cross-workspace draft", async () => {
    const { response } = await requestSendStatus([[]], otherWorkspaceDraftId);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("creates no activity logs or background jobs", async () => {
    const { tx } = await requestSendStatus([[draftRow()], [sendRow("pending")]]);

    expect(createActivityLog).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("mutates no drafts, email sends, contacts, leads, or approvals", async () => {
    const { tx } = await requestSendStatus([[draftRow()], [sendRow("queued")]]);

    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("never exposes provider, PII, draft content, job payloads, or AI payload fields", async () => {
    const { response } = await requestSendStatus([
      [
        draftRow({
          contactEmail: "client@example.test",
          phone: "+33600000000",
          firstName: "Ada",
          lastName: "Client",
        }),
      ],
      [
        sendRow("failed", {
          failedAt: new Date("2026-05-01T12:02:00.000Z"),
          lastErrorCode: "SAFE_CODE",
          payloadJson: { hidden: true },
          aiRuns: [{ hidden: true }],
          inputPayload: { hidden: true },
          outputPayload: { hidden: true },
          outputText: "Private AI output",
        }),
      ],
    ]);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("providerMessageId");
    expect(serialized).not.toContain("lastErrorMessage");
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("Private subject");
    expect(serialized).not.toContain("Private text body");
    expect(serialized).not.toContain("Private HTML body");
    expect(serialized).not.toContain("client@example.test");
    expect(serialized).not.toContain("+33600000000");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("Client");
    expect(serialized).not.toContain("payloadJson");
    expect(serialized).not.toContain("aiRuns");
    expect(serialized).not.toContain("promptJson");
    expect(serialized).not.toContain("outputJson");
    expect(serialized).not.toContain("inputPayload");
    expect(serialized).not.toContain("outputPayload");
    expect(serialized).not.toContain("Private AI output");
    expect(serialized).not.toContain("costEstimate");
    expect(serialized).not.toContain("inputTokens");
    expect(serialized).not.toContain("outputTokens");
  });

  it("does not call providers, fetch, workers, or enqueue", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await requestSendStatus([[draftRow()], [sendRow("pending")]]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("rejects client-provided workspaceId in query params", async () => {
    const { response, tx } = await requestSendStatus(
      [[draftRow()], [sendRow("pending")]],
      `${draftId}?workspaceId=00000000-0000-4000-8000-000000021f98`,
    );

    expect(response.status).toBe(400);
    expect(tx.select).not.toHaveBeenCalled();
  });
});
