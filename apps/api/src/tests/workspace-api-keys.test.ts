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
  WorkspaceApiKeyServiceMutationResult
} from "../services/workspace-api-keys.js";

const testUser: AuthMe = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "founder@syrantis.test",
  name: "Founder",
  role: "admin",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "Syrantis Internal"
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
    getCurrentUser: vi.fn(async (token: string) => (active && token === validSessionToken ? testUser : null)),
    logout: vi.fn(async () => {
      active = false;
    })
  };
}

function createFakeWorkspaceApiKeyService() {
  const keys = new Map<string, WorkspaceApiKeyOutput>();
  const activityActions: string[] = [];
  let nextKeyId = 100;

  const service: WorkspaceApiKeyService & { activityActions: string[] } = {
    activityActions,
    listWorkspaceApiKeys: vi.fn(async (workspaceId: string) => {
      return [...keys.values()].filter((key) => key.workspaceId === workspaceId);
    }),
    getWorkspaceApiKey: vi.fn(async (workspaceId: string, id: string) => {
      const key = keys.get(id);
      return key && key.workspaceId === workspaceId ? key : null;
    }),
    createWorkspaceApiKey: vi.fn(async (
      workspaceId: string,
      _actorUserId: string,
      input: WorkspaceApiKeyCreateInput
    ) => {
      void _actorUserId;
      const plaintextApiKey = `syr_live_${String(nextKeyId).padStart(6, "0")}_testonly`;
      const key: WorkspaceApiKeyOutput = {
        id: uuidFromNumber(nextKeyId),
        workspaceId,
        name: input.name,
        keyPrefix: "syr_live",
        last4: plaintextApiKey.slice(-4),
        status: "active",
        lastUsedAt: null,
        revokedAt: null,
        createdAt: "2026-05-02T10:00:00.000Z",
        updatedAt: "2026-05-02T10:00:00.000Z"
      };

      nextKeyId += 1;
      keys.set(key.id, key);
      activityActions.push("workspace_api_key.created");
      return { result: "ok", key: { ...key, plaintextApiKey } } as WorkspaceApiKeyServiceCreateResult;
    }),
    revokeWorkspaceApiKey: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      void _actorUserId;
      const existing = keys.get(id);

      if (!existing || existing.workspaceId !== workspaceId || id === missingKeyId) {
        return { result: "not_found" } as WorkspaceApiKeyServiceMutationResult;
      }

      if (existing.status === "revoked") {
        return { result: "conflict" } as WorkspaceApiKeyServiceMutationResult;
      }

      const revoked: WorkspaceApiKeyOutput = {
        ...existing,
        status: "revoked",
        revokedAt: "2026-05-02T11:00:00.000Z",
        updatedAt: "2026-05-02T11:00:00.000Z"
      };
      keys.set(id, revoked);
      activityActions.push("workspace_api_key.revoked");
      return { result: "ok", key: revoked } as WorkspaceApiKeyServiceMutationResult;
    })
  };

  return service;
}

function createTestApp(authService: AuthService, workspaceApiKeyService: WorkspaceApiKeyService): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ authService }));
  app.route(
    "/api/workspace-api-keys",
    createWorkspaceApiKeyRoutes({
      authService,
      workspaceApiKeyService
    })
  );
  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`
  };
}

async function createKey(app: Hono) {
  return app.request("/api/workspace-api-keys", {
    method: "POST",
    headers: {
      ...validSessionHeaders(),
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: "Website form production"
    })
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
      code: "NO_SESSION"
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
    expect(createJson.data.plaintextApiKey).toMatch(/^syr_live_/);
    expect(createJson.data).not.toHaveProperty("keyHash");

    const listResponse = await app.request("/api/workspace-api-keys", {
      headers: validSessionHeaders()
    });
    const listJson = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0]).not.toHaveProperty("plaintextApiKey");
    expect(listJson.data[0]).not.toHaveProperty("keyHash");

    const detailResponse = await app.request(`/api/workspace-api-keys/${createJson.data.id}`, {
      headers: validSessionHeaders()
    });
    const detailJson = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detailJson.data.id).toBe(createJson.data.id);
    expect(detailJson.data).not.toHaveProperty("plaintextApiKey");
    expect(detailJson.data).not.toHaveProperty("keyHash");
  });

  it("rejects workspaceId in body and query", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());

    const bodyResponse = await app.request("/api/workspace-api-keys", {
      method: "POST",
      headers: {
        ...validSessionHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Bad key",
        workspaceId: testUser.workspaceId
      })
    });

    expect(bodyResponse.status).toBe(400);

    const queryResponse = await app.request(`/api/workspace-api-keys?workspaceId=${testUser.workspaceId}`, {
      headers: validSessionHeaders()
    });

    expect(queryResponse.status).toBe(400);
  });

  it("revokes a key, returns revoked detail, and rejects double revoke", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());
    const createResponse = await createKey(app);
    const createJson = await createResponse.json();

    const revokeResponse = await app.request(`/api/workspace-api-keys/${createJson.data.id}/revoke`, {
      method: "POST",
      headers: validSessionHeaders()
    });
    const revokeJson = await revokeResponse.json();

    expect(revokeResponse.status).toBe(200);
    expect(revokeJson.data.status).toBe("revoked");
    expect(revokeJson.data.revokedAt).toBe("2026-05-02T11:00:00.000Z");

    const detailResponse = await app.request(`/api/workspace-api-keys/${createJson.data.id}`, {
      headers: validSessionHeaders()
    });
    const detailJson = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detailJson.data.status).toBe("revoked");
    expect(detailJson.data).not.toHaveProperty("plaintextApiKey");
    expect(detailJson.data).not.toHaveProperty("keyHash");

    const doubleRevokeResponse = await app.request(`/api/workspace-api-keys/${createJson.data.id}/revoke`, {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(doubleRevokeResponse.status).toBe(409);
  });

  it("returns 404 for missing keys", async () => {
    const app = createTestApp(createStatefulAuthService(), createFakeWorkspaceApiKeyService());

    const response = await app.request(`/api/workspace-api-keys/${missingKeyId}`, {
      headers: validSessionHeaders()
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
      headers: validSessionHeaders()
    });

    expect(workspaceApiKeyService.activityActions).toEqual([
      "workspace_api_key.created",
      "workspace_api_key.revoked"
    ]);
  });

  it("returns 401 after logout", async () => {
    const authService = createStatefulAuthService();
    const app = createTestApp(authService, createFakeWorkspaceApiKeyService());

    const logoutResponse = await app.request("/auth/logout", {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(logoutResponse.status).toBe(200);

    const response = await app.request("/api/workspace-api-keys", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(401);
  });
});
