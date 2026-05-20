import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthMe } from "@syrantis/shared";

import { verifyPassword } from "../lib/password.js";
import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import type {
  ClientUserMutationResult,
  ClientUserRow,
  CreateClientUserInput,
} from "../repositories/client-users.js";
import { createClientUserRoutes } from "../routes/client-users.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionClientUserService,
  type ClientUserRepository,
  type ClientUserService,
} from "../services/client-users.js";

const validSessionToken = "test-session-token";
const workspaceId = "22222222-2222-4222-8222-222222222222";

const testUser: AuthMe = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.com",
  name: "Admin User",
  role: "admin",
  workspaceId,
  workspaceName: "Syrantis Internal",
};

const clientUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "client@example.com",
  displayName: "Client User",
  role: "client" as const,
  status: "active" as const,
  createdAt: "2026-05-20T10:00:00.000Z",
  updatedAt: "2026-05-20T10:00:00.000Z",
};

function createAuthService(user: AuthMe | null): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function createService(): ClientUserService & {
  createCalls: Array<{ workspaceId: string; input: { email: string; displayName?: string } }>;
  listCalls: string[];
  conflict: boolean;
} {
  const service = {
    createCalls: [] as Array<{ workspaceId: string; input: { email: string; displayName?: string } }>,
    listCalls: [] as string[],
    conflict: false,
    async listClientUsers(inputWorkspaceId: string) {
      service.listCalls.push(inputWorkspaceId);
      return [clientUser];
    },
    async createClientUser(
      inputWorkspaceId: string,
      input: { email: string; displayName?: string },
    ) {
      service.createCalls.push({ workspaceId: inputWorkspaceId, input });

      if (service.conflict) {
        return { result: "conflict" as const };
      }

      return {
        result: "ok" as const,
        data: {
          user: {
            ...clientUser,
            email: input.email,
            displayName: input.displayName ?? null,
          },
          temporaryPassword: "temporary-password-shown-once",
        },
      };
    },
  };

  return service;
}

function createApp(user: AuthMe | null = testUser, service: ClientUserService = createService()) {
  const app = new Hono();
  app.route(
    "/api/admin/client-users",
    createClientUserRoutes({
      authService: createAuthService(user),
      clientUserService: service,
    }),
  );

  return app;
}

function sessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

async function postClientUser(
  app: Hono,
  body: unknown,
  headers: Record<string, string> = sessionHeaders(),
) {
  return app.request("/api/admin/client-users", {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("admin client user routes", () => {
  it("allows admin sessions to create active client users in the trusted workspace", async () => {
    const service = createService();
    const app = createApp(testUser, service);

    const response = await postClientUser(app, {
      email: " Client@Example.COM ",
      displayName: " Client User ",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(service.createCalls).toEqual([
      {
        workspaceId,
        input: {
          email: "client@example.com",
          displayName: "Client User",
        },
      },
    ]);
    expect(body).toEqual({
      success: true,
      data: {
        user: {
          ...clientUser,
          email: "client@example.com",
          displayName: "Client User",
        },
        temporaryPassword: "temporary-password-shown-once",
      },
    });
    expect(JSON.stringify(body.data.user)).not.toContain("workspaceId");
    expect(JSON.stringify(body.data.user)).not.toContain("passwordHash");
  });

  it("allows founder sessions to list client users without secret fields", async () => {
    const service = createService();
    const app = createApp({ ...testUser, role: "founder" }, service);

    const response = await app.request("/api/admin/client-users", {
      headers: sessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(service.listCalls).toEqual([workspaceId]);
    expect(body).toEqual({
      success: true,
      data: [clientUser],
    });
    expect(JSON.stringify(body)).not.toContain("temporaryPassword");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("rejects client-supplied workspace identity and role fields", async () => {
    const service = createService();
    const app = createApp(testUser, service);

    const workspaceResponse = await postClientUser(app, {
      email: "client@example.com",
      workspaceId: "99999999-9999-4999-8999-999999999999",
    });
    const roleResponse = await postClientUser(app, {
      email: "client@example.com",
      role: "admin",
    });
    const queryResponse = await app.request(
      "/api/admin/client-users?workspaceId=99999999-9999-4999-8999-999999999999",
      {
        headers: sessionHeaders(),
      },
    );
    const headerResponse = await postClientUser(
      app,
      { email: "client@example.com" },
      {
        ...sessionHeaders(),
        "x-workspace-id": "99999999-9999-4999-8999-999999999999",
      },
    );

    expect(workspaceResponse.status).toBe(400);
    expect(roleResponse.status).toBe(400);
    expect(queryResponse.status).toBe(400);
    expect(headerResponse.status).toBe(400);
    expect(service.createCalls).toEqual([]);
  });

  it("returns 409 for duplicate email", async () => {
    const service = createService();
    service.conflict = true;
    const app = createApp(testUser, service);

    const response = await postClientUser(app, {
      email: "client@example.com",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Client user already exists.",
      code: "CLIENT_USER_ALREADY_EXISTS",
    });
  });

  it("blocks client, operator, and unauthenticated sessions", async () => {
    const clientResponse = await createApp({ ...testUser, role: "client" }).request(
      "/api/admin/client-users",
      {
        headers: sessionHeaders(),
      },
    );
    const operatorResponse = await createApp({ ...testUser, role: "operator" }).request(
      "/api/admin/client-users",
      {
        headers: sessionHeaders(),
      },
    );
    const unauthenticatedResponse = await createApp(testUser).request("/api/admin/client-users");

    expect(clientResponse.status).toBe(403);
    expect(operatorResponse.status).toBe(403);
    expect(unauthenticatedResponse.status).toBe(401);
  });
});

describe("client user service", () => {
  it("hashes generated temporary passwords and returns plaintext only in the create result", async () => {
    const createdRows: CreateClientUserInput[] = [];
    const now = new Date("2026-05-20T10:00:00.000Z");
    const repository: ClientUserRepository = {
      async listClientUsers() {
        return [];
      },
      async createClientUser(input): Promise<ClientUserMutationResult> {
        createdRows.push(input);
        const row: ClientUserRow = {
          id: "44444444-4444-4444-8444-444444444444",
          email: input.email,
          name: input.displayName,
          role: "client",
          status: "active",
          createdAt: now,
          updatedAt: now,
        };
        return { result: "ok", user: row };
      },
    };
    const service = createProductionClientUserService({
      repository,
      generateTemporaryPassword: () => "S3cureTemporaryPassword123",
    });

    const result = await service.createClientUser(workspaceId, {
      email: " NewClient@Example.COM ",
      displayName: "New Client",
    });

    expect(result.result).toBe("ok");
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({
      workspaceId,
      email: "newclient@example.com",
      displayName: "New Client",
    });
    expect(createdRows[0]?.passwordHash).not.toBe("S3cureTemporaryPassword123");
    await expect(
      verifyPassword("S3cureTemporaryPassword123", createdRows[0]?.passwordHash ?? ""),
    ).resolves.toBe(true);

    if (result.result === "ok") {
      expect(result.data.temporaryPassword).toBe("S3cureTemporaryPassword123");
      expect(JSON.stringify(result.data.user)).not.toContain("passwordHash");
    }
  });
});
