import { Webhook } from "svix";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createActivityLog } from "../repositories/activity-logs.js";
import { createResendWebhookRoutes } from "../routes/webhooks/resend.js";
import { verifyResendWebhookSignature } from "../services/webhooks/resend-signature.js";
import { pushDeliveryProofToGoogleSheets } from "../services/pushback/google-sheets.js";

const mockDb = vi.hoisted(() => ({
  lookupTx: undefined as unknown,
  workspaceTx: undefined as unknown,
}));

vi.mock("../services/pushback/google-sheets.js", () => ({
  pushDeliveryProofToGoogleSheets: vi.fn(async () => {}),
}));

const dbMocks = vi.hoisted(() => ({
  withProviderMessageLookupDb: vi.fn(async (_providerMessageId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.lookupTx),
  ),
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.workspaceTx),
  ),
}));

vi.mock("../lib/db.js", () => ({
  withProviderMessageLookupDb: dbMocks.withProviderMessageLookupDb,
  withWorkspaceDb: dbMocks.withWorkspaceDb,
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021099" })),
}));

const webhookSecret = `whsec_${Buffer.from("resend-webhook-test-secret").toString("base64")}`;
const providerMessageId = "resend-provider-message-id";
const workspaceId = "00000000-0000-4000-8000-000000021001";
const emailSendId = "00000000-0000-4000-8000-000000021002";

type WorkspaceTx = ReturnType<typeof createWorkspaceTx>;

function workspaceTx(): WorkspaceTx {
  return mockDb.workspaceTx as WorkspaceTx;
}

function createTestApp() {
  const app = new Hono();
  app.route("/api/webhooks/resend", createResendWebhookRoutes({ webhookSecret }));
  return app;
}

function signedRequest(payload: string, overrides: Record<string, string> = {}) {
  const timestamp = new Date();
  const svixId = "msg_021o_test";
  const svixSignature = new Webhook(webhookSecret).sign(svixId, timestamp, payload);

  return {
    body: payload,
    headers: {
      "content-type": "application/json",
      "svix-id": svixId,
      "svix-timestamp": `${Math.floor(timestamp.getTime() / 1000)}`,
      "svix-signature": svixSignature,
      ...overrides,
    },
  };
}

function payload(type: string, data: Record<string, unknown> = { email_id: providerMessageId }) {
  return JSON.stringify({ type, data });
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createUpdateBuilder(response: unknown[], state: { updateSet: unknown }) {
  return {
    set: vi.fn((value: unknown) => {
      state.updateSet = value;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => response),
        })),
      };
    }),
  };
}

function createLookupTx(row: Record<string, unknown> | null) {
  return {
    select: vi.fn(() => createSelectBuilder(row ? [row] : [])),
    update: vi.fn(() => {
      throw new Error("provider lookup must not mutate");
    }),
    insert: vi.fn(() => {
      throw new Error("provider lookup must not insert");
    }),
  };
}

function createWorkspaceTx(updateResponse: unknown[] = [{ id: emailSendId }]) {
  const state = {
    updateSet: undefined as unknown,
  };

  return {
    state,
    select: vi.fn(() => {
      throw new Error("workspace mutation path should not re-read by provider id");
    }),
    update: vi.fn(() => createUpdateBuilder(updateResponse, state)),
    insert: vi.fn(() => {
      throw new Error("activity logs are mocked");
    }),
  };
}

function emailSendLookupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: emailSendId,
    workspaceId,
    deliveryStatus: null,
    deliveredAt: null,
    bouncedAt: null,
    complainedAt: null,
    deliveryErrorCode: null,
    providerMessageId,
    toEmail: "private@example.test",
    subject: "Private subject",
    textBody: "Private text",
    htmlBody: "<p>Private</p>",
    ...overrides,
  };
}

async function postSigned(body: string, headers: Record<string, string> = signedRequest(body).headers) {
  return createTestApp().request("/api/webhooks/resend", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    dbMocks.withProviderMessageLookupDb.mockClear();
    dbMocks.withWorkspaceDb.mockClear();
    vi.mocked(createActivityLog).mockClear();
    vi.mocked(pushDeliveryProofToGoogleSheets).mockClear();
    mockDb.lookupTx = createLookupTx(emailSendLookupRow());
    mockDb.workspaceTx = createWorkspaceTx();
  });

  it("returns 500 when RESEND_WEBHOOK_SECRET is not configured", async () => {
    const app = new Hono();
    app.route("/api/webhooks/resend", createResendWebhookRoutes());

    const request = signedRequest(payload("email.delivered"));
    const response = await app.request("/api/webhooks/resend", {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "WEBHOOK_NOT_CONFIGURED" });
    expect(dbMocks.withProviderMessageLookupDb).not.toHaveBeenCalled();
    expect(dbMocks.withWorkspaceDb).not.toHaveBeenCalled();
  });

  it("returns 400 when Svix headers are missing", async () => {
    const response = await createTestApp().request("/api/webhooks/resend", {
      method: "POST",
      body: payload("email.delivered"),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "MISSING_WEBHOOK_HEADERS" });
    expect(dbMocks.withProviderMessageLookupDb).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid signature before provider-message lookup", async () => {
    const request = signedRequest(payload("email.delivered"), { "svix-signature": "v1,bad" });
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "INVALID_SIGNATURE" });
    expect(dbMocks.withProviderMessageLookupDb).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON after a valid signature", async () => {
    const request = signedRequest("{not-json");
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "INVALID_PAYLOAD" });
    expect(dbMocks.withProviderMessageLookupDb).not.toHaveBeenCalled();
  });

  it("returns 200 ignored and does not mutate ignored event types", async () => {
    const request = signedRequest(payload("email.opened"));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, ignored: true });
    expect(dbMocks.withProviderMessageLookupDb).not.toHaveBeenCalled();
    expect(dbMocks.withWorkspaceDb).not.toHaveBeenCalled();
    expect(pushDeliveryProofToGoogleSheets).not.toHaveBeenCalled();
  });

  it("returns 200 unmatched without leaking details for an unknown provider_message_id", async () => {
    mockDb.lookupTx = createLookupTx(null);
    const request = signedRequest(payload("email.delivered"));
    const response = await postSigned(request.body, request.headers);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, unmatched: true });
    expect(JSON.stringify(body)).not.toContain(providerMessageId);
    expect(dbMocks.withWorkspaceDb).not.toHaveBeenCalled();
    expect(pushDeliveryProofToGoogleSheets).not.toHaveBeenCalled();
  });

  it("updates delivered proof under the resolved workspace", async () => {
    vi.setSystemTime(new Date("2026-05-04T10:00:00.000Z"));
    const request = signedRequest(payload("email.delivered"));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(dbMocks.withProviderMessageLookupDb).toHaveBeenCalledWith(providerMessageId, expect.any(Function));
    expect(dbMocks.withWorkspaceDb).toHaveBeenCalledWith(workspaceId, expect.any(Function));
    expect(workspaceTx().state.updateSet).toMatchObject({
      deliveryStatus: "delivered",
      deliveryErrorCode: null,
    });
    expect(createActivityLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workspaceId,
      action: "email_send.delivery_updated",
      entityType: "email_send",
      entityId: emailSendId,
      metadataJson: {
        emailSendId,
        eventType: "email.delivered",
        deliveryStatus: "delivered",
      },
    }));
    expect(pushDeliveryProofToGoogleSheets).toHaveBeenCalledWith({
      workspaceId,
      emailSendId,
      eventType: "email.delivered",
      occurredAt: expect.any(Date),
    });
  });

  it("updates bounced proof without raw provider error text", async () => {
    const request = signedRequest(payload("email.bounced", {
      email_id: providerMessageId,
      bounce: { message: "Private raw bounce detail" },
    }));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(workspaceTx().state.updateSet).toMatchObject({
      deliveryStatus: "bounced",
      deliveryErrorCode: "RESEND_BOUNCED",
    });
    expect(JSON.stringify(await response.json())).not.toContain("Private raw bounce detail");
    expect(pushDeliveryProofToGoogleSheets).toHaveBeenCalledWith({
      workspaceId,
      emailSendId,
      eventType: "email.bounced",
      occurredAt: expect.any(Date),
    });
  });

  it("updates complained proof without raw provider complaint text", async () => {
    const request = signedRequest(payload("email.complained", {
      email_id: providerMessageId,
      complaint: "Private complaint detail",
    }));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(workspaceTx().state.updateSet).toMatchObject({
      deliveryStatus: "complained",
      deliveryErrorCode: "RESEND_COMPLAINED",
    });
    expect(JSON.stringify(await response.json())).not.toContain("Private complaint detail");
    expect(pushDeliveryProofToGoogleSheets).toHaveBeenCalledWith({
      workspaceId,
      emailSendId,
      eventType: "email.complained",
      occurredAt: expect.any(Date),
    });
  });

  it("allows complained after delivered and preserves delivered_at", async () => {
    const deliveredAt = new Date("2026-05-04T09:00:00.000Z");
    mockDb.lookupTx = createLookupTx(emailSendLookupRow({
      deliveryStatus: "delivered",
      deliveredAt,
    }));

    const request = signedRequest(payload("email.complained"));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(workspaceTx().state.updateSet).toMatchObject({
      deliveryStatus: "complained",
      deliveryErrorCode: "RESEND_COMPLAINED",
    });
    expect(String(workspaceTx().state.updateSet)).not.toContain("deliveredAt");
  });

  it("returns unchanged for duplicate delivered events and does not rewrite timestamps", async () => {
    mockDb.lookupTx = createLookupTx(emailSendLookupRow({
      deliveryStatus: "delivered",
      deliveredAt: new Date("2026-05-04T09:00:00.000Z"),
    }));

    const request = signedRequest(payload("email.delivered"));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, unchanged: true });
    expect(dbMocks.withWorkspaceDb).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(pushDeliveryProofToGoogleSheets).not.toHaveBeenCalled();
  });

  it("does not fail the webhook request if pushback throws", async () => {
    vi.setSystemTime(new Date("2026-05-04T10:00:00.000Z"));
    vi.mocked(pushDeliveryProofToGoogleSheets).mockRejectedValueOnce(new Error("pushback error"));

    const request = signedRequest(payload("email.delivered"));
    const response = await postSigned(request.body, request.headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(pushDeliveryProofToGoogleSheets).toHaveBeenCalled();
  });

  it("rejects client-provided workspaceId from signed payload, query, or headers", async () => {
    const bodyRequest = signedRequest(JSON.stringify({
      type: "email.delivered",
      workspaceId,
      data: { email_id: providerMessageId },
    }));
    const bodyResponse = await postSigned(bodyRequest.body, bodyRequest.headers);
    expect(bodyResponse.status).toBe(400);

    const queryRequest = signedRequest(payload("email.delivered"));
    const queryResponse = await createTestApp().request("/api/webhooks/resend?workspaceId=x", {
      method: "POST",
      headers: queryRequest.headers,
      body: queryRequest.body,
    });
    expect(queryResponse.status).toBe(400);

    const headerRequest = signedRequest(payload("email.delivered"), { "x-workspace-id": workspaceId });
    const headerResponse = await postSigned(headerRequest.body, headerRequest.headers);
    expect(headerResponse.status).toBe(400);
  });

  it("does not call provider HTTP APIs from the webhook path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = signedRequest(payload("email.delivered"));

    await postSigned(request.body, request.headers);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps missing signature headers before verifying payload contents", () => {
    expect(
      verifyResendWebhookSignature({
        secret: webhookSecret,
        rawBody: payload("email.delivered"),
        headers: { svixId: undefined, svixTimestamp: undefined, svixSignature: undefined },
      }),
    ).toEqual({ result: "missing_headers" });
  });
});
