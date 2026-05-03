import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createDraftRoutes } from "../routes/drafts.js";
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
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021099" })),
}));

const draftId = "00000000-0000-4000-8000-000000021001";
const archivedDraftId = "00000000-0000-4000-8000-000000021002";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000021003";
const missingDraftId = "00000000-0000-4000-8000-000000021004";
const emailSendId = "00000000-0000-4000-8000-000000021101";
const jobId = "00000000-0000-4000-8000-000000021201";

type EmailSendStatus = "pending" | "queued" | "sent" | "failed" | "cancelled";
type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    ...extra,
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

function createUpdateBuilder(
  state: {
    updateSets: unknown[];
    updateResponses: unknown[][];
    updateCount: number;
  },
) {
  const builder = {
    set: vi.fn((setValues: unknown) => {
      state.updateSets.push(setValues);
      return builder;
    }),
    where: vi.fn(() => builder),
    returning: vi.fn(async () => {
      const response = state.updateResponses[state.updateCount] ?? [];
      state.updateCount += 1;
      return response;
    }),
  };

  return builder;
}

function createMockTx(selectResponses: unknown[][], updateResponses: unknown[][] = []) {
  const state = {
    selectResponses: [...selectResponses],
    updateResponses: [...updateResponses],
    selectedShapes: [] as unknown[],
    orderByCalls: [] as unknown[][],
    updateSets: [] as unknown[],
    updateCount: 0,
    inserted: [] as unknown[],
  };

  return {
    state,
    select: vi.fn((shape?: unknown) => {
      state.selectedShapes.push(shape);
      return createSelectBuilder(state.selectResponses.shift() ?? [], state);
    }),
    update: vi.fn(() => createUpdateBuilder(state)),
    insert: vi.fn(() => {
      throw new Error("cancel-send must not enqueue background jobs");
    }),
    delete: vi.fn(() => {
      throw new Error("cancel-send must not delete");
    }),
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    workspaceId: testUser.workspaceId,
    status: "approved",
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    ...overrides,
  };
}

function sendRow(status: EmailSendStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: emailSendId,
    status,
    updatedAt: new Date("2026-05-01T12:00:05.000Z"),
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    provider: "resend",
    providerMessageId: "provider-secret",
    toEmail: "client@example.test",
    subject: "Private subject",
    textBody: "Private text body",
    htmlBody: "<p>Private HTML body</p>",
    payloadJson: { emailSendId },
    ...overrides,
  };
}

function jobRow(status: JobStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    status,
    payloadJson: { emailSendId },
    provider: "internal",
    lastErrorMessage: "Private worker error",
    ...overrides,
  };
}

async function requestCancelSend(
  selectResponses: unknown[][],
  options: {
    id?: string;
    body?: unknown;
    headers?: Record<string, string>;
    updateResponses?: unknown[][];
  } = {},
) {
  const tx = createMockTx(selectResponses, options.updateResponses);
  mockDb.tx = tx;

  const init: RequestInit = {
    method: "POST",
    headers: options.headers ?? validSessionHeaders(),
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await createTestApp().request(
    `/api/drafts/${options.id ?? draftId}/cancel-send`,
    init,
  );

  return { response, tx };
}

function expectNoMutation(tx: ReturnType<typeof createMockTx>) {
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.insert).not.toHaveBeenCalled();
  expect(tx.delete).not.toHaveBeenCalled();
  expect(createActivityLog).not.toHaveBeenCalled();
}

describe("POST /api/drafts/:id/cancel-send", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("cancels the latest pending send and linked pending send_email job in one transaction", async () => {
    const { response, tx } = await requestCancelSend(
      [[draftRow()], [sendRow("pending")], [jobRow("pending")]],
      {
        updateResponses: [
          [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
          [{ id: jobId }],
        ],
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draftId,
        emailSendId,
        previousStatus: "pending",
        currentStatus: "cancelled",
        cancelled: true,
        cancelledAt: "2026-05-01T12:01:00.000Z",
      },
    });
    expect(tx.state.orderByCalls.at(-1)).toHaveLength(2);
    expect(tx.state.updateSets).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
  });

  it("success response contains safe fields only", async () => {
    const { response } = await requestCancelSend(
      [[draftRow()], [sendRow("pending")], [jobRow("pending")]],
      {
        updateResponses: [
          [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
          [{ id: jobId }],
        ],
      },
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("providerMessageId");
    expect(serialized).not.toContain("client@example.test");
    expect(serialized).not.toContain("Private subject");
    expect(serialized).not.toContain("Private text body");
    expect(serialized).not.toContain("Private HTML body");
    expect(serialized).not.toContain("payloadJson");
  });

  it("creates exactly one compact email_send.cancelled activity log on first cancellation", async () => {
    await requestCancelSend([[draftRow()], [sendRow("pending")], [jobRow("pending")]], {
      updateResponses: [
        [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
        [{ id: jobId }],
      ],
    });

    expect(createActivityLog).toHaveBeenCalledTimes(1);
    expect(createActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "email_send.cancelled",
        entityType: "email_send",
        entityId: emailSendId,
        metadataJson: {
          draftId,
          emailSendId,
          jobId,
          previousStatus: "pending",
          currentStatus: "cancelled",
        },
      }),
    );
  });

  it("activity log contains no PII, content, provider, or payload fields", async () => {
    await requestCancelSend([[draftRow()], [sendRow("pending")], [jobRow("pending")]], {
      updateResponses: [
        [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
        [{ id: jobId }],
      ],
    });
    const metadata = vi.mocked(createActivityLog).mock.calls[0]?.[1].metadataJson ?? {};

    expect(metadata).not.toHaveProperty("recipientEmail");
    expect(metadata).not.toHaveProperty("toEmail");
    expect(metadata).not.toHaveProperty("contactEmail");
    expect(metadata).not.toHaveProperty("subject");
    expect(metadata).not.toHaveProperty("textBody");
    expect(metadata).not.toHaveProperty("htmlBody");
    expect(metadata).not.toHaveProperty("provider");
    expect(metadata).not.toHaveProperty("providerMessageId");
    expect(metadata).not.toHaveProperty("payloadJson");
  });

  it("already cancelled latest send returns 200 idempotent no-op and creates no duplicate activity log", async () => {
    const { response, tx } = await requestCancelSend([[draftRow()], [sendRow("cancelled")]]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draftId,
        emailSendId,
        previousStatus: "cancelled",
        currentStatus: "cancelled",
        cancelled: false,
        cancelledAt: "2026-05-01T12:00:05.000Z",
      },
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it.each(["queued", "sent", "failed"] satisfies EmailSendStatus[])(
    "latest send %s returns 409 and no mutation",
    async (status) => {
      const { response, tx } = await requestCancelSend([[draftRow()], [sendRow(status)]]);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        success: false,
        error: "Draft send cancellation not allowed.",
        code: "CANCEL_SEND_NOT_ALLOWED",
        details: {
          reason: "SEND_NOT_PENDING",
          currentStatus: status,
        },
      });
      expectNoMutation(tx);
    },
  );

  it("draft with no email_sends returns 409 and no mutation", async () => {
    const { response, tx } = await requestCancelSend([[draftRow()], []]);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CANCEL_SEND_NOT_ALLOWED",
      details: {
        reason: "NO_SEND_TO_CANCEL",
        currentStatus: null,
      },
    });
    expectNoMutation(tx);
  });

  it.each([
    ["missing", missingDraftId],
    ["archived", archivedDraftId],
    ["cross-workspace", otherWorkspaceDraftId],
  ])("%s draft returns 404 DRAFT_NOT_FOUND", async (_label, id) => {
    const { response, tx } = await requestCancelSend([[]], { id });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Draft not found.",
      code: "DRAFT_NOT_FOUND",
    });
    expectNoMutation(tx);
  });

  it("pending email_send but missing linked background job returns 409 and no mutation", async () => {
    const { response, tx } = await requestCancelSend([[draftRow()], [sendRow("pending")], []]);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CANCEL_SEND_NOT_ALLOWED",
      details: {
        reason: "SEND_JOB_NOT_PENDING",
        currentStatus: "pending",
      },
    });
    expectNoMutation(tx);
  });

  it.each(["running", "completed", "failed", "cancelled"] satisfies JobStatus[])(
    "pending email_send but linked job %s returns 409 and no mutation",
    async (status) => {
      const { response, tx } = await requestCancelSend([
        [draftRow()],
        [sendRow("pending")],
        [jobRow(status)],
      ]);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "CANCEL_SEND_NOT_ALLOWED",
        details: {
          reason: "SEND_JOB_NOT_PENDING",
          currentStatus: "pending",
        },
      });
      expectNoMutation(tx);
    },
  );

  it("guarded email_send update affecting zero rows returns 409 and creates no activity log", async () => {
    const { response } = await requestCancelSend(
      [[draftRow()], [sendRow("pending")], [jobRow("pending")]],
      { updateResponses: [[], [{ id: jobId }]] },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CANCEL_SEND_NOT_ALLOWED",
    });
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("guarded job update affecting zero rows returns 409 and creates no activity log", async () => {
    const { response } = await requestCancelSend(
      [[draftRow()], [sendRow("pending")], [jobRow("pending")]],
      {
        updateResponses: [
          [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
          [],
        ],
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CANCEL_SEND_NOT_ALLOWED",
    });
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("does not call providers, fetch, workers, or enqueue jobs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { tx } = await requestCancelSend(
      [[draftRow()], [sendRow("pending")], [jobRow("pending")]],
      {
        updateResponses: [
          [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
          [{ id: jobId }],
        ],
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("cancels a pending retry attempt and pending background job scheduled in the future", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { response, tx } = await requestCancelSend(
      [
        [draftRow()],
        [sendRow("pending", { id: emailSendId, createdAt: new Date("2026-05-01T12:02:00.000Z") })],
        [jobRow("pending", { scheduledAt: new Date("2026-05-01T12:05:00.000Z") })],
      ],
      {
        updateResponses: [
          [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:03:00.000Z") }],
          [{ id: jobId }],
        ],
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        emailSendId,
        previousStatus: "pending",
        currentStatus: "cancelled",
        cancelled: true,
      },
    });
    expect(tx.state.updateSets).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET send-status reflects latestSend.status=cancelled after successful cancellation", async () => {
    const tx = createMockTx(
      [
        [draftRow()],
        [sendRow("pending")],
        [jobRow("pending")],
        [draftRow()],
        [
          {
            ...sendRow("cancelled"),
            sentAt: null,
            failedAt: null,
            lastErrorCode: null,
            updatedAt: new Date("2026-05-01T12:01:00.000Z"),
          },
        ],
      ],
      [
        [{ id: emailSendId, updatedAt: new Date("2026-05-01T12:01:00.000Z") }],
        [{ id: jobId }],
      ],
    );
    mockDb.tx = tx;
    const app = createTestApp();

    const cancelResponse = await app.request(`/api/drafts/${draftId}/cancel-send`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const statusResponse = await app.request(`/api/drafts/${draftId}/send-status`, {
      headers: validSessionHeaders(),
    });

    expect(cancelResponse.status).toBe(200);
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({
      success: true,
      data: {
        draftId,
        hasSend: true,
        latestSend: {
          status: "cancelled",
        },
      },
    });
  });

  it("rejects client-provided workspaceId in query or body", async () => {
    const queryResponse = await createTestApp().request(
      `/api/drafts/${draftId}/cancel-send?workspaceId=00000000-0000-4000-8000-000000021999`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );
    const bodyResponse = await createTestApp().request(`/api/drafts/${draftId}/cancel-send`, {
      method: "POST",
      headers: validSessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ workspaceId: "00000000-0000-4000-8000-000000021999" }),
    });

    expect(queryResponse.status).toBe(400);
    expect(bodyResponse.status).toBe(400);
  });
});
