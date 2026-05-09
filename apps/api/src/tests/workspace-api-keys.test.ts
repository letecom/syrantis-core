import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthMe, WorkspaceApiKeyCreateInput, WorkspaceApiKeyOutput } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createAuthRoutes } from "../routes/auth.js";
import { createWorkspaceApiKeyRoutes } from "../routes/workspace-api-keys.js";
import type { AuthService } from "../services/auth.js";
import type {
  WorkspaceApiKeyService,
  WorkspaceApiKeyServiceCreateResult,
  WorkspaceApiKeyServiceMutationResult,
} from "../services/workspace-api-keys.js";

const testUser: AuthMe = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "founder@syrantis.test",
  name: "Founder",
  role: "admin",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "Syrantis Internal",
};

const missingKeyId = "00000000-0000-4000-8000-000000000999";
const validSessionToken = "test-session-token";

function uuidFromNumber(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function createStatefulAuthService(): AuthService {
  let active = true;

  return {
    login: vi.fn(async (email: string, password: string) => {
      if (email.trim().toLowerCase() !== testUser.email || password !== "valid-password") {
        return null;
      }

      active = true;
      return { user: testUser, token: validSessionToken };
    }),
    getCurrentUser: vi.fn(async (token: string) =>
      active && token === validSessionToken ? testUser : null,
    ),
    logout: vi.fn(async () => {
      active = false;
    }),
  };
}

type StoredWorkspaceApiKey = WorkspaceApiKeyOutput & { workspaceId: string };

function createFakeWorkspaceApiKeyService() {
  const keys = new Map<string, StoredWorkspaceApiKey>();
  const activityLogs: Array<{ action: string; metadataJson: Record<string, unknown> }> = [];
  let nextKeyId = 100;

  function toSafeKey(key: StoredWorkspaceApiKey): WorkspaceApiKeyOutput {
    const { workspaceId: _workspaceId, ...safeKey } = key;
    void _workspaceId;
    return safeKey;
  }

  const service: WorkspaceApiKeyService & {
    activityLogs: typeof activityLogs;
    storedKeys: typeof keys;
  } = {
    activityLogs,
    storedKeys: keys,
    listWorkspaceApiKeys: vi.fn(async (workspaceId: string) => {
      return [...keys.values()].filter((key) => key.workspaceId === workspaceId).map(toSafeKey);
    }),
    getWorkspaceApiKey: vi.fn(async (workspaceId: string, id: string) => {
      const key = keys.get(id);
      return key && key.workspaceId === workspaceId ? toSafeKey(key) : null;
    }),
    createWorkspaceApiKey: vi.fn(
      async (workspaceId: string, _actorUserId: string, input: WorkspaceApiKeyCreateInput) => {
        void _actorUserId;
        const plaintextApiKey = `syr_live_${String(nextKeyId).padStart(6, "0")}_testonly`;
        const key: StoredWorkspaceApiKey = {
          id: uuidFromNumber(nextKeyId),
          workspaceId,
          name: input.name,
          keyPrefix: "syr_live",
          last4: plaintextApiKey.slice(-4),
          status: "active",
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-05-02T10:00:00.000Z",
          updatedAt: "2026-05-02T10:00:00.000Z",
        };

        nextKeyId += 1;
        keys.set(key.id, key);
        activityLogs.push({
          action: "workspace_api_key.created",
          metadataJson: {
            keyId: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            last4: key.last4,
            status: key.status,
            source: "admin_ui",
          },
        });
        return {
          result: "ok",
          key: { ...toSafeKey(key), plaintextApiKey },
        } as WorkspaceApiKeyServiceCreateResult;
      },
    ),
    revokeWorkspaceApiKey: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      void _actorUserId;
      const existing = keys.get(id);

      if (!existing || existing.workspaceId !== workspaceId || id === missingKeyId) {
        return { result: "not_found" } as WorkspaceApiKeyServiceMutationResult;
      }

      if (existing.status === "revoked") {
        return { result: "ok", key: toSafeKey(existing) } as WorkspaceApiKeyServiceMutationResult;
      }

      const revoked: StoredWorkspaceApiKey = {
        ...existing,
        status: "revoked",
        revokedAt: "2026-05-02T11:00:00.000Z",
        updatedAt: "2026-05-02T11:00:00.000Z",
      };
      keys.set(id, revoked);
      activityLogs.push({
        action: "workspace_api_key.revoked",
        metadataJson: {
          keyId: revoked.id,
          name: revoked.name,
          keyPrefix: revoked.keyPrefix,
          last4: revoked.last4,
          status: revoked.status,
          source: "admin_ui",
        },
      });
      return { result: "ok", key: toSafeKey(revoked) } as WorkspaceApiKeyServiceMutationResult;
    }),
  };

  return service;
}

function expectNoSensitiveKeyMaterial(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "key_hash",
    "keyHash",
    "plaintextKey",
    "token",
    "Authorization",
    "Bearer",
    testUser.workspaceId,
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function createTestApp(
  authService: AuthService,
  workspaceApiKeyService: WorkspaceApiKeyService,
): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ authService }));
  app.route(
    "/api/workspace-api-keys",
    createWorkspaceApiKeyRoutes({
      authService,
      workspaceApiKeyService,
    }),
  );
  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

async function createKey(app: Hono) {
  return app.request("/api/workspace-api-keys", {
    method: "POST",
    headers: {
      ...validSessionHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "Website form production",
    }),
  });
}

describe("workspace API key routes", () => {
  it("returns 401 for GET /api/workspace-api-keys without session", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());

    const response = await app.request("/api/workspace-api-keys");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION",
    });
  });

  it("creates a key and returns plaintextApiKey once", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());

    const createResponse = await createKey(app);
    const createJson = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createJson.success).toBe(true);
    expect(createJson.data.name).toBe("Website form production");
    expect(createJson.data.keyPrefix).toBe("syr_live");
    expect(createJson.data.last4).toBe(createJson.data.plaintextApiKey.slice(-4));
    expect(createJson.data.plaintextApiKey).toMatch(/^syr_live_/);
    expect(createJson.data).not.toHaveProperty("keyHash");
    expect(createJson.data).not.toHaveProperty("key_hash");
    expect(createJson.data).not.toHaveProperty("workspaceId");

    const listResponse = await app.request("/api/workspace-api-keys", {
      headers: validSessionHeaders(),
    });
    const listJson = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0]).not.toHaveProperty("plaintextApiKey");
    expect(listJson.data[0]).not.toHaveProperty("keyHash");
    expect(listJson.data[0]).not.toHaveProperty("key_hash");
    expect(listJson.data[0]).not.toHaveProperty("workspaceId");
    expectNoSensitiveKeyMaterial(listJson);

    const detailResponse = await app.request(`/api/workspace-api-keys/${createJson.data.id}`, {
      headers: validSessionHeaders(),
    });
    const detailJson = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detailJson.data.id).toBe(createJson.data.id);
    expect(detailJson.data).not.toHaveProperty("plaintextApiKey");
    expect(detailJson.data).not.toHaveProperty("keyHash");
    expect(detailJson.data).not.toHaveProperty("workspaceId");
  });

  it("rejects workspaceId in body, query, and header", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());

    const bodyResponse = await app.request("/api/workspace-api-keys", {
      method: "POST",
      headers: {
        ...validSessionHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Bad key",
        workspaceId: testUser.workspaceId,
      }),
    });

    expect(bodyResponse.status).toBe(400);

    const queryResponse = await app.request(
      `/api/workspace-api-keys?workspaceId=${testUser.workspaceId}`,
      {
        headers: validSessionHeaders(),
      },
    );

    expect(queryResponse.status).toBe(400);

    const headerResponse = await app.request("/api/workspace-api-keys", {
      headers: {
        ...validSessionHeaders(),
        "x-workspace-id": testUser.workspaceId,
      },
    });

    expect(headerResponse.status).toBe(400);
  });

  it("revokes a key, returns revoked detail, and treats double revoke as idempotent", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());
    const createResponse = await createKey(app);
    const createJson = await createResponse.json();

    const revokeResponse = await app.request(
      `/api/workspace-api-keys/${createJson.data.id}/revoke`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );
    const revokeJson = await revokeResponse.json();

    expect(revokeResponse.status).toBe(200);
    expect(revokeJson.data.status).toBe("revoked");
    expect(revokeJson.data.revokedAt).toBe("2026-05-02T11:00:00.000Z");

    const detailResponse = await app.request(`/api/workspace-api-keys/${createJson.data.id}`, {
      headers: validSessionHeaders(),
    });
    const detailJson = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detailJson.data.status).toBe("revoked");
    expect(detailJson.data).not.toHaveProperty("plaintextApiKey");
    expect(detailJson.data).not.toHaveProperty("keyHash");
    expect(detailJson.data).not.toHaveProperty("workspaceId");

    const doubleRevokeResponse = await app.request(
      `/api/workspace-api-keys/${createJson.data.id}/revoke`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );
    const doubleRevokeJson = await doubleRevokeResponse.json();

    expect(doubleRevokeResponse.status).toBe(200);
    expect(doubleRevokeJson.data.status).toBe("revoked");
    expect(doubleRevokeJson.data).not.toHaveProperty("plaintextApiKey");
  });

  it("returns 404 for missing keys", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());

    const response = await app.request(`/api/workspace-api-keys/${missingKeyId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
  });

  it("records create and revoke activity log actions", async () => {
    const workspaceApiKeyService = createFakeWorkspaceApiKeyService();
    const app = createTestApp(createStatefulAuthService(), workspaceApiKeyService);
    const createResponse = await createKey(app);
    const createJson = await createResponse.json();

    await app.request(`/api/workspace-api-keys/${createJson.data.id}/revoke`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(workspaceApiKeyService.activityLogs.map((log) => log.action)).toEqual([
      "workspace_api_key.created",
      "workspace_api_key.revoked",
    ]);
    expect(workspaceApiKeyService.activityLogs[0]?.metadataJson).toEqual({
      keyId: createJson.data.id,
      name: "Website form production",
      keyPrefix: "syr_live",
      last4: createJson.data.last4,
      status: "active",
      source: "admin_ui",
    });
    expect(workspaceApiKeyService.activityLogs[1]?.metadataJson).toMatchObject({
      keyId: createJson.data.id,
      name: "Website form production",
      keyPrefix: "syr_live",
      last4: createJson.data.last4,
      status: "revoked",
      source: "admin_ui",
    });
    expectNoSensitiveKeyMaterial(workspaceApiKeyService.activityLogs);
  });

  it("stores only hash material outside the create response", async () => {
    const workspaceApiKeyService = createFakeWorkspaceApiKeyService();
    const app = createTestApp(createStatefulAuthService(), workspaceApiKeyService);
    const createResponse = await createKey(app);
    const createJson = await createResponse.json();
    const stored = workspaceApiKeyService.storedKeys.get(createJson.data.id);

    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty("plaintextApiKey");
    expect(JSON.stringify([...workspaceApiKeyService.storedKeys.values()])).not.toContain(
      createJson.data.plaintextApiKey,
    );
  });

  it("forbids non-admin sessions", async () => {
    const authService = createStatefulAuthService();
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      ...testUser,
      role: "operator",
    });
    const app = createTestApp(authService, createFakeWorkspaceApiKeyService());

    const response = await app.request("/api/workspace-api-keys", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
  });

  it("returns 401 after logout", async () => {
    const authService = createStatefulAuthService();
    const app = createTestApp(authService, createFakeWorkspaceApiKeyService());

    const logoutResponse = await app.request("/auth/logout", {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(logoutResponse.status).toBe(200);

    const response = await app.request("/api/workspace-api-keys", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(401);
  });
});
