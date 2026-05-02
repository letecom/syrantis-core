import { createHash } from "node:crypto";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createPublicLeadRoutes } from "../routes/public-leads.js";
import type {
  PublicLeadIntakeService,
  PublicLeadIntakeServiceResult
} from "../services/public-lead-intake.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000002";
const validApiKey = "syr_live_valid_test_key";
const revokedApiKey = "syr_live_revoked_test_key";
const apiKeyId = "00000000-0000-4000-8000-000000000101";
const connectionId = "00000000-0000-4000-8000-000000000201";
const otherWorkspaceConnectionId = "00000000-0000-4000-8000-000000000202";

type FakeKey = {
  id: string;
  workspaceId: string;
  status: "active" | "revoked";
  lastUsedAt: Date | null;
};

function uuidFromNumber(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function hashIdempotency(keyWorkspaceId: string, idempotencyKey: string): string {
  return createHash("sha256").update(`${keyWorkspaceId}:public_lead:${idempotencyKey}`).digest("hex");
}

function bearer(value: string) {
  return {
    authorization: `Bearer ${value}`,
    "content-type": "application/json"
  };
}

function createFakePublicLeadIntakeService() {
  const keys = new Map<string, FakeKey>([
    [validApiKey, { id: apiKeyId, workspaceId, status: "active", lastUsedAt: null }],
    [revokedApiKey, { id: uuidFromNumber(102), workspaceId, status: "revoked", lastUsedAt: null }]
  ]);
  const connections = new Set([`${workspaceId}:${connectionId}`, `${otherWorkspaceId}:${otherWorkspaceConnectionId}`]);
  const mappings = new Set<string>();
  const idempotency = new Map<string, string>();
  const integrationEvents: Array<Record<string, unknown>> = [];
  const activityLogs: Array<Record<string, unknown>> = [];
  let nextLeadId = 301;

  const service: PublicLeadIntakeService & {
    keys: Map<string, FakeKey>;
    mappings: Set<string>;
    integrationEvents: Array<Record<string, unknown>>;
    activityLogs: Array<Record<string, unknown>>;
    revoke(value: string): void;
  } = {
    keys,
    mappings,
    integrationEvents,
    activityLogs,
    revoke(value: string) {
      const key = keys.get(value);
      if (key) {
        keys.set(value, { ...key, status: "revoked" });
      }
    },
    receivePublicLead: vi.fn(async (input): Promise<PublicLeadIntakeServiceResult> => {
      const match = /^Bearer\s+(.+)$/.exec(input.authorizationHeader ?? "");
      const plaintextApiKey = match?.[1] ?? "";
      const key = keys.get(plaintextApiKey);

      if (!key || key.status !== "active" || !plaintextApiKey.startsWith("syr_live_")) {
        return { result: "unauthorized" };
      }

      key.lastUsedAt = new Date();

      if (input.idempotencyKey) {
        const idempotencyHash = hashIdempotency(key.workspaceId, input.idempotencyKey);
        const existingLeadId = idempotency.get(idempotencyHash);

        if (existingLeadId) {
          return { result: "idempotent_replay", leadId: existingLeadId };
        }
      }

      if (input.payload.externalConnectionId && input.payload.externalObjectType && input.payload.externalObjectId) {
        const connectionKey = `${key.workspaceId}:${input.payload.externalConnectionId}`;

        if (!connections.has(connectionKey)) {
          return { result: "not_found" };
        }

        const mappingKey = [
          key.workspaceId,
          input.payload.externalConnectionId,
          input.payload.externalObjectType,
          input.payload.externalObjectId,
          "lead"
        ].join(":");

        if (mappings.has(mappingKey)) {
          return { result: "conflict" };
        }

        mappings.add(mappingKey);
      }

      const leadId = uuidFromNumber(nextLeadId);
      nextLeadId += 1;
      const idempotencyHash = input.idempotencyKey
        ? hashIdempotency(key.workspaceId, input.idempotencyKey)
        : undefined;

      if (idempotencyHash) {
        idempotency.set(idempotencyHash, leadId);
      }

      integrationEvents.push({
        eventType: "public_lead.received",
        status: "processed",
        syrantisEntityType: "lead",
        syrantisEntityId: leadId,
        payloadHash: idempotencyHash ?? null,
        metadata: {
          origin: "public_lead_intake",
          apiKeyId: key.id,
          ...(idempotencyHash ? { idempotencyHash } : {})
        }
      });
      activityLogs.push({
        action: "public_lead.received",
        entityType: "lead",
        entityId: leadId,
        metadata: {
          source: "public_lead_intake",
          apiKeyId: key.id,
          ...(input.payload.externalConnectionId ? { externalConnectionId: input.payload.externalConnectionId } : {}),
          ...(input.payload.externalObjectType ? { externalObjectType: input.payload.externalObjectType } : {})
        }
      });

      return { result: "created", leadId };
    })
  };

  return service;
}

function createTestApp(publicLeadIntakeService: PublicLeadIntakeService): Hono {
  const app = new Hono();
  app.route("/api/public/leads", createPublicLeadRoutes({ publicLeadIntakeService }));
  return app;
}

async function postLead(
  app: Hono,
  body: Record<string, unknown>,
  headers: Record<string, string> = bearer(validApiKey)
) {
  return app.request("/api/public/leads", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

describe("public lead intake routes", () => {
  it("returns 401 without Authorization", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(
      app,
      { email: "lead@example.com", message: "Need a quote." },
      { "content-type": "application/json" }
    );

    expect(response.status).toBe(401);
  });

  it("returns 401 with an invalid key", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(app, { email: "lead@example.com", message: "Need a quote." }, bearer("bad_key"));

    expect(response.status).toBe(401);
  });

  it("returns 401 with a revoked key", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(
      app,
      { email: "lead@example.com", message: "Need a quote." },
      bearer(revokedApiKey)
    );

    expect(response.status).toBe(401);
  });

  it("creates a lead from a valid key and minimal email/message payload", async () => {
    const service = createFakePublicLeadIntakeService();
    const app = createTestApp(service);

    const response = await postLead(app, { email: "lead@example.com", message: "Need a quote." });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      success: true,
      data: {
        id: "00000000-0000-4000-8000-000000000301",
        status: "created"
      }
    });
    expect(service.keys.get(validApiKey)?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects an empty payload", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(app, {});

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ success: false, code: "INVALID_REQUEST" });
  });

  it("rejects secret-like keys in metadata", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(app, {
      email: "lead@example.com",
      metadata: {
        nested: {
          api_key: "never-store-this",
          token: "also-never-store-this",
          secret: "not-here"
        }
      }
    });

    expect(response.status).toBe(422);
  });

  it("rejects workspaceId in body or query", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const bodyResponse = await postLead(app, {
      email: "lead@example.com",
      workspaceId
    });

    const queryResponse = await app.request(`/api/public/leads?workspaceId=${workspaceId}`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ email: "lead@example.com" })
    });

    expect(bodyResponse.status).toBe(400);
    expect(queryResponse.status).toBe(400);
  });

  it("rejects partial external mapping fields", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(app, {
      email: "lead@example.com",
      externalConnectionId: connectionId
    });

    expect(response.status).toBe(422);
  });

  it("returns 404 for a missing or cross-workspace external connection", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());

    const response = await postLead(app, {
      email: "lead@example.com",
      externalConnectionId: otherWorkspaceConnectionId,
      externalObjectType: "form_submission",
      externalObjectId: "submission-1"
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 for duplicate external mappings", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());
    const payload = {
      email: "lead@example.com",
      externalConnectionId: connectionId,
      externalObjectType: "form_submission",
      externalObjectId: "submission-1"
    };

    const firstResponse = await postLead(app, payload);
    const secondResponse = await postLead(app, payload);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(409);
  });

  it("returns idempotent replay for the same Idempotency-Key", async () => {
    const app = createTestApp(createFakePublicLeadIntakeService());
    const headers = {
      ...bearer(validApiKey),
      "idempotency-key": "lead-intake-123"
    };

    const firstResponse = await postLead(app, { email: "lead@example.com", message: "Need a quote." }, headers);
    const firstJson = await firstResponse.json();
    const replayResponse = await postLead(app, { email: "lead@example.com", message: "Need a quote." }, headers);
    const replayJson = await replayResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(replayResponse.status).toBe(200);
    expect(replayJson.data).toEqual({
      id: firstJson.data.id,
      status: "idempotent_replay"
    });
  });

  it("creates a public_lead.received integration event and activity log", async () => {
    const service = createFakePublicLeadIntakeService();
    const app = createTestApp(service);
    const rawIdempotencyKey = "sensitive-ish-replay-key";

    await postLead(
      app,
      { email: "lead@example.com", message: "Need a quote." },
      { ...bearer(validApiKey), "idempotency-key": rawIdempotencyKey }
    );

    expect(service.integrationEvents).toHaveLength(1);
    expect(service.integrationEvents[0]).toMatchObject({
      eventType: "public_lead.received",
      status: "processed",
      syrantisEntityType: "lead"
    });
    expect(service.integrationEvents[0]?.payloadHash).not.toBe(rawIdempotencyKey);
    expect(service.activityLogs).toContainEqual(
      expect.objectContaining({
        action: "public_lead.received",
        entityType: "lead"
      })
    );
  });

  it("returns 401 after the key is revoked", async () => {
    const service = createFakePublicLeadIntakeService();
    const app = createTestApp(service);

    const beforeRevoke = await postLead(app, { email: "lead@example.com", message: "Need a quote." });
    service.revoke(validApiKey);
    const afterRevoke = await postLead(app, { email: "lead@example.com", message: "Need a quote." });

    expect(beforeRevoke.status).toBe(201);
    expect(afterRevoke.status).toBe(401);
  });
});
