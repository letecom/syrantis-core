import { Hono } from "hono";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceContextProfiles } from "@syrantis/db";
import type { AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createClientResponsePolicyRoutes } from "../routes/client/response-policy.js";
import type { AuthService } from "../services/auth.js";
import { createProductionClientResponsePolicyService } from "../services/client-response-policy.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
  txQueue: [] as unknown[],
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = mockDb.txQueue.shift() ?? mockDb.tx;
    return fn(tx);
  }),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => ({
    id: "00000000-0000-4000-8000-000000009999",
    ...input,
  })),
}));

const profileId = "00000000-0000-4000-8000-000000004601";

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    ...extra,
  };
}

function nonAdminAuthService(): AuthService {
  const nonAdminUser: AuthMe = {
    ...testUser,
    role: "operator",
  };

  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? nonAdminUser : null)),
    logout: vi.fn(async () => undefined),
  };
}

function createTestApp(authService: AuthService = createFakeAuthService()) {
  const app = new Hono();
  app.route(
    "/api/client/response-policy",
    createClientResponsePolicyRoutes({
      authService,
      clientResponsePolicyService: createProductionClientResponsePolicyService(),
    }),
  );
  return app;
}

function responsePolicyInput(overrides: Record<string, unknown> = {}) {
  return {
    language: "fr",
    tone: "warm",
    customToneNotes: "Repondre avec clarte et empathie.",
    signature: "L'equipe Acme Chauffage",
    defaultGreeting: "Bonjour,",
    defaultClosing: "Bien cordialement,",
    responseStructure: ["acknowledge request", "propose next step"],
    businessRules: ["never promise same-day intervention unless urgent slot is confirmed"],
    forbiddenClaims: ["do not guarantee exact price before qualification"],
    escalationRules: ["if complaint/refund/legal threat, do not draft commercial reply"],
    offerNotes: ["lead with diagnostic visit for heating inquiries"],
    catalogSummary: "Installation et entretien chauffage avec devis apres qualification.",
    exampleReplies: [{ label: "Warm quote", bodyText: "Bonjour, merci pour votre demande." }],
    ...overrides,
  };
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: profileId,
    workspaceId: testUser.workspaceId,
    companyName: "Acme Chauffage",
    sector: "plomberie chauffage",
    language: "fr",
    timezone: "Europe/Paris",
    contextJson: {
      companySummary: "Entreprise de chauffage.",
      offers: [{ name: "Installation chaudiere" }],
    },
    createdBy: testUser.id,
    updatedBy: testUser.id,
    createdAt: new Date("2026-05-01T09:00:00.000Z"),
    updatedAt: new Date("2026-05-01T09:00:00.000Z"),
    ...overrides,
  };
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => response),
  };

  return builder;
}

function createInsertBuilder(insertedValues: Record<string, unknown>[], responseQueue: unknown[]) {
  return {
    values: vi.fn((values: Record<string, unknown>) => {
      insertedValues.push(values);
      return {
        returning: vi.fn(async () => {
          const response = responseQueue.shift();
          return response ? [response] : [];
        }),
      };
    }),
  };
}

function createUpdateBuilder(updates: Record<string, unknown>[], responseQueue: unknown[]) {
  const builder = {
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return builder;
    }),
    where: vi.fn(() => builder),
    returning: vi.fn(async () => {
      const response = responseQueue.shift();
      return response ? [response] : [];
    }),
  };

  return builder;
}

function createMockTx(input: {
  selectResponses: unknown[][];
  insertResponses?: unknown[];
  updateResponses?: unknown[];
}) {
  const insertedValues: Record<string, unknown>[] = [];
  const insertTargets: unknown[] = [];
  const updates: Record<string, unknown>[] = [];
  const selectResponses = [...input.selectResponses];
  const insertResponses = [...(input.insertResponses ?? [])];
  const updateResponses = [...(input.updateResponses ?? [])];
  const tx = {
    select: vi.fn(() => createSelectBuilder(selectResponses.shift() ?? [])),
    insert: vi.fn((target: unknown) => {
      insertTargets.push(target);
      return createInsertBuilder(insertedValues, insertResponses);
    }),
    update: vi.fn(() => createUpdateBuilder(updates, updateResponses)),
  };

  return {
    tx,
    insertedValues,
    insertTargets,
    updates,
  };
}

function expectNoSensitivePolicyLogLeak(value: unknown) {
  const serialized = JSON.stringify(
    Array.isArray(value)
      ? value.map((call) =>
          Array.isArray(call) ? (call[1] as { metadataJson?: unknown })?.metadataJson : call,
        )
      : value,
  );
  expect(serialized).not.toContain("Repondre avec clarte");
  expect(serialized).not.toContain("L'equipe Acme");
  expect(serialized).not.toContain("Installation et entretien");
  expect(serialized).not.toContain("Bonjour, merci");
  expect(serialized).not.toContain("workspaceId");
}

describe("client response policy route", () => {
  beforeEach(() => {
    vi.mocked(createActivityLog).mockClear();
    mockDb.tx = undefined;
    mockDb.txQueue = [];
  });

  it("GET without session returns 401", async () => {
    const response = await createTestApp().request("/api/client/response-policy");

    expect(response.status).toBe(401);
  });

  it("PUT without session returns 401", async () => {
    const response = await createTestApp().request("/api/client/response-policy", {
      method: "PUT",
      body: JSON.stringify(responsePolicyInput()),
    });

    expect(response.status).toBe(401);
  });

  it("rejects API key-only requests", async () => {
    const response = await createTestApp().request("/api/client/response-policy", {
      headers: { authorization: "Bearer syr_live_forbidden_plaintext" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin sessions", async () => {
    const response = await createTestApp(nonAdminAuthService()).request(
      "/api/client/response-policy",
      {
        headers: validSessionHeaders(),
      },
    );

    expect(response.status).toBe(403);
  });

  it("GET empty policy returns a safe default DTO", async () => {
    const harness = createMockTx({ selectResponses: [[]] });
    mockDb.tx = harness.tx;

    const response = await createTestApp().request("/api/client/response-policy", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.policy).toMatchObject({
      language: "auto",
      tone: "professional",
      status: "empty",
      updatedAt: null,
      responseStructure: [],
      exampleReplies: [],
    });
    expect(JSON.stringify(body)).not.toContain("workspaceId");
    expect(JSON.stringify(body)).not.toContain("contextJson");
    expect(JSON.stringify(body)).not.toContain("createdBy");
    expect(JSON.stringify(body)).not.toContain("updatedBy");
  });

  it("PUT creates policy when workspace context profile does not exist", async () => {
    const storedRow = profileRow({
      contextJson: {
        responsePolicy: {
          ...responsePolicyInput(),
          updatedAt: "2026-05-01T10:00:00.000Z",
          status: "configured",
        },
      },
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    });
    const findTx = createMockTx({ selectResponses: [[]] });
    const putTx = createMockTx({
      selectResponses: [[]],
      insertResponses: [storedRow],
    });
    mockDb.txQueue = [findTx.tx, putTx.tx];

    const response = await createTestApp().request("/api/client/response-policy", {
      method: "PUT",
      headers: validSessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(responsePolicyInput()),
    });

    expect(response.status).toBe(200);
    expect(putTx.insertTargets).toEqual([workspaceContextProfiles]);
    expect(putTx.insertedValues[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      createdBy: testUser.id,
      updatedBy: testUser.id,
    });
    expect(putTx.insertedValues[0]?.contextJson).toMatchObject({
      responsePolicy: expect.objectContaining({
        language: "fr",
        status: "configured",
      }),
    });
    expect(createActivityLog).toHaveBeenCalledWith(
      putTx.tx,
      expect.objectContaining({
        action: "client_response_policy.created",
        metadataJson: {
          policyConfigured: true,
          changedFields: expect.arrayContaining(["signature", "catalogSummary", "exampleReplies"]),
          source: "admin_ui",
        },
      }),
    );
  });

  it("PUT updates policy and preserves existing profile fields and unrelated context keys", async () => {
    const existing = profileRow({
      contextJson: {
        companySummary: "Preserve this company summary.",
        customKey: { keep: true },
        responsePolicy: {
          ...responsePolicyInput({ signature: "Old signature" }),
          updatedAt: "2026-05-01T09:00:00.000Z",
          status: "configured",
        },
      },
    });
    const updated = profileRow({
      contextJson: {
        ...(existing.contextJson as Record<string, unknown>),
        responsePolicy: {
          ...responsePolicyInput(),
          updatedAt: "2026-05-01T10:00:00.000Z",
          status: "configured",
        },
      },
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    });
    const findTx = createMockTx({ selectResponses: [[existing]] });
    const putTx = createMockTx({
      selectResponses: [[existing]],
      updateResponses: [updated],
    });
    mockDb.txQueue = [findTx.tx, putTx.tx];

    const response = await createTestApp().request("/api/client/response-policy", {
      method: "PUT",
      headers: validSessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(responsePolicyInput()),
    });

    expect(response.status).toBe(200);
    expect(putTx.updates[0]).toMatchObject({
      updatedBy: testUser.id,
      contextJson: expect.objectContaining({
        companySummary: "Preserve this company summary.",
        customKey: { keep: true },
        responsePolicy: expect.objectContaining({
          signature: "L'equipe Acme Chauffage",
          status: "configured",
        }),
      }),
    });
    expect(createActivityLog).toHaveBeenCalledWith(
      putTx.tx,
      expect.objectContaining({
        action: "client_response_policy.updated",
        metadataJson: {
          policyConfigured: true,
          changedFields: ["signature"],
          source: "admin_ui",
        },
      }),
    );
  });

  it("rejects workspace identifiers in body query and headers", async () => {
    for (const request of [
      createTestApp().request("/api/client/response-policy?workspaceId=bad", {
        headers: validSessionHeaders(),
      }),
      createTestApp().request("/api/client/response-policy", {
        method: "PUT",
        headers: validSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ...responsePolicyInput(), workspaceId: testUser.workspaceId }),
      }),
      createTestApp().request("/api/client/response-policy", {
        headers: validSessionHeaders({ "x-workspace-id": testUser.workspaceId }),
      }),
    ]) {
      const response = await request;
      expect(response.status).toBe(400);
    }
  });

  it("rejects oversized fields and credential-like strings", async () => {
    for (const input of [
      responsePolicyInput({ signature: "x".repeat(1001) }),
      responsePolicyInput({ catalogSummary: `keep this out syr_live_${"a".repeat(24)}` }),
    ]) {
      const response = await createTestApp().request("/api/client/response-policy", {
        method: "PUT",
        headers: validSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(input),
      });

      expect(response.status).toBe(400);
    }
  });

  it("activity log metadata is compact and contains no policy text", async () => {
    const storedRow = profileRow({
      contextJson: {
        responsePolicy: {
          ...responsePolicyInput(),
          updatedAt: "2026-05-01T10:00:00.000Z",
          status: "configured",
        },
      },
    });
    const findTx = createMockTx({ selectResponses: [[]] });
    const putTx = createMockTx({
      selectResponses: [[]],
      insertResponses: [storedRow],
    });
    mockDb.txQueue = [findTx.tx, putTx.tx];

    await createTestApp().request("/api/client/response-policy", {
      method: "PUT",
      headers: validSessionHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(responsePolicyInput()),
    });

    expectNoSensitivePolicyLogLeak(vi.mocked(createActivityLog).mock.calls);
  });

  it("does not import providers or outbound clients in route and service files", () => {
    const files = [
      new URL("../routes/client/response-policy.ts", import.meta.url),
      new URL("../services/client-response-policy.ts", import.meta.url),
      new URL("../repositories/client-response-policy.ts", import.meta.url),
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toMatch(/OpenRouter|Provider|fetch\(|Gmail|Google|Resend/i);
  });

  it("does not add a migration for 023AD", () => {
    const migrationNames = readdirSync(
      new URL("../../../../packages/db/migrations", import.meta.url),
    ).join("\n");

    expect(migrationNames).not.toMatch(/023AD|response_policy|client_response_policy/i);
  });
});
