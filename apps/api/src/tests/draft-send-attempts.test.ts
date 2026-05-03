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
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021l99" })),
}));

const draftId = "00000000-0000-4000-8000-000000021a01";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000021a02";
const missingDraftId = "00000000-0000-4000-8000-000000021a03";

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

function createSelectBuilder(
  response: unknown[],
  state: { orderByCalls: unknown[][]; limitCalls: unknown[]; offsetCalls: unknown[] },
) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn((...args: unknown[]) => {
      state.orderByCalls.push(args);
      return builder;
    }),
    limit: vi.fn((value: unknown) => {
      state.limitCalls.push(value);
      return builder;
    }),
    offset: vi.fn((value: unknown) => {
      state.offsetCalls.push(value);
      return builder;
    }),
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
    limitCalls: [] as unknown[],
    offsetCalls: [] as unknown[],
  };

  return {
    state,
    select: vi.fn((shape?: unknown) => {
      state.selectedShapes.push(shape);
      return createSelectBuilder(state.selectResponses.shift() ?? [], state);
    }),
    insert: vi.fn(() => {
      throw new Error("send attempts must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("send attempts must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("send attempts must not delete");
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

function sendRow(status: "pending" | "queued" | "sent" | "failed" | "cancelled", createdAt: string) {
  return {
    id: "00000000-0000-4000-8000-000000021a31",
    workspaceId: "00000000-0000-4000-8000-000000021a32",
    draftId,
    approvalId: "00000000-0000-4000-8000-000000021a33",
    leadId: "00000000-0000-4000-8000-000000021a34",
    contactId: "00000000-0000-4000-8000-000000021a35",
    fromEmail: "from@example.test",
    toEmail: "client@example.test",
    replyToEmail: "reply@example.test",
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    provider: "resend",
    providerMessageId: "provider-message-secret",
    idempotencyKey: "private-idempotency-key",
    status,
    createdAt: new Date(createdAt),
    updatedAt: new Date(new Date(createdAt).getTime() + 5000),
    sentAt: status === "sent" ? new Date(new Date(createdAt).getTime() + 10000) : null,
    failedAt: status === "failed" ? new Date(new Date(createdAt).getTime() + 10000) : null,
    lastErrorCode: status === "failed" ? "EMAIL_PROVIDER_HTTP_ERROR" : null,
    lastErrorMessage: "Private provider error details",
    metadataJson: { hidden: true },
    payloadJson: { hidden: true },
    promptJson: { hidden: true },
    outputJson: { hidden: true },
    inputTokens: 100,
    outputTokens: 200,
  };
}

async function requestSendAttempts(
  selectResponses: unknown[][],
  path: string = `/api/drafts/${draftId}/send-attempts`,
  headers: Record<string, string> = validSessionHeaders(),
) {
  const tx = createMockTx(selectResponses);
  mockDb.tx = tx;

  const response = await createTestApp().request(path, { headers });

  return { response, tx };
}

function expectNoForbiddenFields(serialized: string) {
  expect(serialized).not.toContain("provider_message_id");
  expect(serialized).not.toContain("providerMessageId");
  expect(serialized).not.toContain("provider");
  expect(serialized).not.toContain("workspaceId");
  expect(serialized).not.toContain("emailSendId");
  expect(serialized).not.toContain("approvalId");
  expect(serialized).not.toContain("background");
  expect(serialized).not.toContain("job");
  expect(serialized).not.toContain("fromEmail");
  expect(serialized).not.toContain("toEmail");
  expect(serialized).not.toContain("replyToEmail");
  expect(serialized).not.toContain("client@example.test");
  expect(serialized).not.toContain("subject");
  expect(serialized).not.toContain("Private subject");
  expect(serialized).not.toContain("textBody");
  expect(serialized).not.toContain("htmlBody");
  expect(serialized).not.toContain("Private text body");
  expect(serialized).not.toContain("Private HTML body");
  expect(serialized).not.toContain("last_error_message");
  expect(serialized).not.toContain("lastErrorMessage");
  expect(serialized).not.toContain("Private provider error details");
  expect(serialized).not.toContain("metadata_json");
  expect(serialized).not.toContain("metadataJson");
  expect(serialized).not.toContain("payload_json");
  expect(serialized).not.toContain("payloadJson");
  expect(serialized).not.toContain("prompt");
  expect(serialized).not.toContain("output");
  expect(serialized).not.toContain("Tokens");
}

describe("GET /api/drafts/:id/send-attempts", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns 401 without session", async () => {
    const { response, tx } = await requestSendAttempts(
      [[draftRow()], [{ totalItems: 0 }], []],
      `/api/drafts/${draftId}/send-attempts`,
      {},
    );

    expect(response.status).toBe(401);
    expect(tx.select).not.toHaveBeenCalled();
  });

  it("returns 404 when the draft is not found", async () => {
    const { response, tx } = await requestSendAttempts(
      [[]],
      `/api/drafts/${missingDraftId}/send-attempts`,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "DRAFT_NOT_FOUND",
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("returns 404 for a cross-workspace draft", async () => {
    const { response } = await requestSendAttempts(
      [[]],
      `/api/drafts/${otherWorkspaceDraftId}/send-attempts`,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("returns an empty attempts page when the draft has no email sends", async () => {
    const { response } = await requestSendAttempts([[draftRow()], [{ totalItems: 0 }], []]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draftId,
        attempts: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasMore: false,
        },
      },
    });
  });

  it("returns one queued internal attempt as a safe DTO", async () => {
    const queued = sendRow("queued", "2026-05-01T12:00:00.000Z");
    const { response, tx } = await requestSendAttempts([[draftRow()], [{ totalItems: 1 }], [queued]]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        draftId,
        attempts: [
          {
            attemptNumber: 1,
            status: "queued",
            createdAt: "2026-05-01T12:00:00.000Z",
            updatedAt: "2026-05-01T12:00:05.000Z",
            sentAt: null,
            failedAt: null,
            errorCode: null,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
          hasMore: false,
        },
      },
    });
    expect(tx.state.orderByCalls.at(-1)).toHaveLength(2);
    expectNoForbiddenFields(JSON.stringify(body));
  });

  it("returns failed then pending retry in chronological order", async () => {
    const failed = sendRow("failed", "2026-05-01T12:00:00.000Z");
    const pending = sendRow("pending", "2026-05-01T12:01:00.000Z");
    const { response } = await requestSendAttempts([
      [draftRow()],
      [{ totalItems: 2 }],
      [failed, pending],
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attempts.map((attempt: { attemptNumber: number }) => attempt.attemptNumber)).toEqual([
      1,
      2,
    ]);
    expect(body.data.attempts.map((attempt: { status: string }) => attempt.status)).toEqual([
      "failed",
      "pending",
    ]);
    expect(body.data.attempts[0].errorCode).toBe("EMAIL_PROVIDER_HTTP_ERROR");
  });

  it("returns failed, failed, queued attempts with stable attempt numbers", async () => {
    const { response } = await requestSendAttempts([
      [draftRow()],
      [{ totalItems: 3 }],
      [
        sendRow("failed", "2026-05-01T12:00:00.000Z"),
        sendRow("failed", "2026-05-01T12:01:00.000Z"),
        sendRow("queued", "2026-05-01T12:02:00.000Z"),
      ],
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attempts.map((attempt: { attemptNumber: number }) => attempt.attemptNumber)).toEqual([
      1,
      2,
      3,
    ]);
    expect(body.data.attempts.map((attempt: { status: string }) => attempt.status)).toEqual([
      "failed",
      "failed",
      "queued",
    ]);
  });

  it("paginates page 1 pageSize 1 with hasMore true", async () => {
    const { response, tx } = await requestSendAttempts(
      [[draftRow()], [{ totalItems: 2 }], [sendRow("failed", "2026-05-01T12:00:00.000Z")]],
      `/api/drafts/${draftId}/send-attempts?page=1&pageSize=1`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attempts).toHaveLength(1);
    expect(body.data.attempts[0].attemptNumber).toBe(1);
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasMore: true,
    });
    expect(tx.state.limitCalls).toContain(1);
    expect(tx.state.offsetCalls).toContain(0);
  });

  it("paginates page 2 pageSize 1 with attemptNumber 2", async () => {
    const { response, tx } = await requestSendAttempts(
      [[draftRow()], [{ totalItems: 2 }], [sendRow("pending", "2026-05-01T12:01:00.000Z")]],
      `/api/drafts/${draftId}/send-attempts?page=2&pageSize=1`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attempts[0]).toMatchObject({
      attemptNumber: 2,
      status: "pending",
    });
    expect(body.data.pagination.hasMore).toBe(false);
    expect(tx.state.offsetCalls).toContain(1);
  });

  it("returns an empty page beyond total with hasMore false", async () => {
    const { response } = await requestSendAttempts(
      [[draftRow()], [{ totalItems: 2 }], []],
      `/api/drafts/${draftId}/send-attempts?page=3&pageSize=1`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.attempts).toEqual([]);
    expect(body.data.pagination).toEqual({
      page: 3,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasMore: false,
    });
  });

  it("rejects invalid page, invalid pageSize, and client workspaceId", async () => {
    for (const query of ["page=0", "pageSize=0", "pageSize=51", "workspaceId=00000000-0000-4000-8000-000000021a98"]) {
      const { response, tx } = await requestSendAttempts(
        [[draftRow()], [{ totalItems: 0 }], []],
        `/api/drafts/${draftId}/send-attempts?${query}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        code: "INVALID_REQUEST",
      });
      expect(tx.select).not.toHaveBeenCalled();
    }
  });

  it("never exposes provider identifiers, provider, content, recipients, raw errors, metadata, payloads, or AI fields", async () => {
    const { response } = await requestSendAttempts([
      [
        draftRow({
          contactEmail: "client@example.test",
          firstName: "Ada",
          lastName: "Client",
        }),
      ],
      [{ totalItems: 1 }],
      [sendRow("failed", "2026-05-01T12:00:00.000Z")],
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expectNoForbiddenFields(JSON.stringify(body));
  });

  it("creates no activity logs, background jobs, or provider calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { tx } = await requestSendAttempts([
      [draftRow()],
      [{ totalItems: 1 }],
      [sendRow("queued", "2026-05-01T12:00:00.000Z")],
    ]);

    expect(createActivityLog).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
