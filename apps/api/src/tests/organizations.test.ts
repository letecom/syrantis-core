import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreateOrganizationInput,
  OrganizationListQuery,
  OrganizationOutput,
  UpdateOrganizationInput
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as organizationRepository from "../repositories/organizations.js";
import { createOrganizationRoutes } from "../routes/organizations.js";
import type { OrganizationService, OrganizationServiceMutationResult } from "../services/organizations.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { otherWorkspaceId } from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockDb.tx))
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000799" }))
}));

const currentWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000701";
const otherWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000702";
const createdOrganizationId = "00000000-0000-4000-8000-000000000703";

const currentWorkspaceOrganization: OrganizationOutput = {
  id: currentWorkspaceOrganizationId,
  workspaceId: testUser.workspaceId,
  name: "Dupont Chauffage",
  sector: "heating",
  websiteUrl: "https://dupont.example",
  phone: "+33123456789",
  email: "contact@dupont.example",
  status: "prospect",
  metadata: { source: "test" },
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z"
};

const otherWorkspaceOrganization: OrganizationOutput = {
  ...currentWorkspaceOrganization,
  id: otherWorkspaceOrganizationId,
  workspaceId: otherWorkspaceId,
  name: "Other workspace organization",
  metadata: {}
};

let mockTx: ReturnType<typeof createMockTx>;

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(async () => response),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject)
  };

  return builder;
}

function createMockTx() {
  const state = {
    selectResponses: [] as unknown[][],
    insertResponse: null as unknown,
    updateResponse: null as unknown
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => (state.insertResponse ? [state.insertResponse] : []))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => (state.updateResponse ? [state.updateResponse] : []))
        }))
      }))
    }))
  };
}

function createTestApp(organizationService: OrganizationService): Hono {
  const app = new Hono();

  app.route(
    "/api/organizations",
    createOrganizationRoutes({
      authService: createFakeAuthService(),
      organizationService
    })
  );

  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`
  };
}

function jsonHeaders() {
  return {
    ...validSessionHeaders(),
    "content-type": "application/json"
  };
}

function createFakeOrganizationService(): OrganizationService {
  const organizations = new Map<string, OrganizationOutput>([
    [currentWorkspaceOrganization.id, currentWorkspaceOrganization],
    [otherWorkspaceOrganization.id, otherWorkspaceOrganization]
  ]);

  function mutationOk(organization: OrganizationOutput): OrganizationServiceMutationResult {
    return { result: "ok", organization };
  }

  return {
    listOrganizations: vi.fn(async (workspaceId: string, query: OrganizationListQuery) => {
      return [...organizations.values()].filter((organization) => {
        if (organization.workspaceId !== workspaceId) {
          return false;
        }

        if (organization.status === "archived") {
          return false;
        }

        if (query.status && organization.status !== query.status) {
          return false;
        }

        return true;
      });
    }),

    getOrganization: vi.fn(async (workspaceId: string, id: string) => {
      const organization = organizations.get(id);
      return organization?.workspaceId === workspaceId && organization.status !== "archived" ? organization : null;
    }),

    createOrganization: vi.fn(async (workspaceId: string, _actorUserId: string, input: CreateOrganizationInput) => {
      const organization: OrganizationOutput = {
        id: createdOrganizationId,
        workspaceId,
        name: input.name,
        sector: input.sector ?? null,
        websiteUrl: input.websiteUrl ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        status: input.status ?? "prospect",
        metadata: input.metadata ?? {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      };

      organizations.set(organization.id, organization);
      return mutationOk(organization);
    }),

    updateOrganization: vi.fn(
      async (workspaceId: string, _actorUserId: string, id: string, input: UpdateOrganizationInput) => {
        const organization = organizations.get(id);

        if (!organization || organization.workspaceId !== workspaceId || organization.status === "archived") {
          return { result: "not_found" } satisfies OrganizationServiceMutationResult;
        }

        const updatedOrganization: OrganizationOutput = {
          ...organization,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sector !== undefined ? { sector: input.sector } : {}),
          ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          updatedAt: "2026-04-30T13:00:00.000Z"
        };

        organizations.set(id, updatedOrganization);
        return mutationOk(updatedOrganization);
      }
    ),

    archiveOrganization: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      const organization = organizations.get(id);

      if (!organization || organization.workspaceId !== workspaceId || organization.status === "archived") {
        return { result: "not_found" } satisfies OrganizationServiceMutationResult;
      }

      const archivedOrganization: OrganizationOutput = {
        ...organization,
        status: "archived",
        updatedAt: "2026-04-30T14:00:00.000Z"
      };

      organizations.set(id, archivedOrganization);
      return mutationOk(archivedOrganization);
    })
  };
}

describe("organization routes", () => {
  it("returns 401 for GET /api/organizations without session", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request("/api/organizations");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("creates an organization for the current workspace", async () => {
    const organizationService = createFakeOrganizationService();
    const app = createTestApp(organizationService);

    const response = await app.request("/api/organizations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Acme Plomberie",
        sector: "plumbing",
        websiteUrl: "acme.example",
        phone: "+33111111111",
        email: "INFO@ACME.EXAMPLE",
        metadata: { source: "manual" }
      })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: createdOrganizationId,
        workspaceId: testUser.workspaceId,
        name: "Acme Plomberie",
        sector: "plumbing",
        websiteUrl: "https://acme.example",
        phone: "+33111111111",
        email: "info@acme.example",
        status: "prospect",
        metadata: { source: "manual" },
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
    expect(organizationService.createOrganization).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ email: "info@acme.example", websiteUrl: "https://acme.example" })
    );
  });

  it("rejects workspaceId in POST body", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request("/api/organizations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        name: "Forbidden organization"
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("lists only current workspace organizations", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request("/api/organizations", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceOrganization]
    });
  });

  it("returns a current workspace organization by id", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: currentWorkspaceOrganization
    });
  });

  it("updates a current workspace organization", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Dupont Chauffage Pro",
        status: "active_client"
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceOrganization,
        name: "Dupont Chauffage Pro",
        status: "active_client",
        updatedAt: "2026-04-30T13:00:00.000Z"
      }
    });
  });

  it("returns 404 for another workspace organization by id", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request(`/api/organizations/${otherWorkspaceOrganizationId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Organization not found.",
      code: "ORGANIZATION_NOT_FOUND"
    });
  });

  it("archives a current workspace organization", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const response = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}/archive`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceOrganization,
        status: "archived",
        updatedAt: "2026-04-30T14:00:00.000Z"
      }
    });
  });

  it("returns 404 for an organization after archive", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const archiveResponse = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}/archive`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(archiveResponse.status).toBe(200);

    const response = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Organization not found.",
      code: "ORGANIZATION_NOT_FOUND"
    });
  });

  it("does not list an organization after archive", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const archiveResponse = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}/archive`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(archiveResponse.status).toBe(200);

    const response = await app.request("/api/organizations", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: []
    });
  });

  it("returns 404 when patching an archived organization", async () => {
    const app = createTestApp(createFakeOrganizationService());

    const archiveResponse = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}/archive`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(archiveResponse.status).toBe(200);

    const response = await app.request(`/api/organizations/${currentWorkspaceOrganizationId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "Should remain hidden"
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Organization not found.",
      code: "ORGANIZATION_NOT_FOUND"
    });
  });
});

describe("organization repository activity logs", () => {
  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("writes activity log organization.created in the create transaction", async () => {
    mockTx.state.insertResponse = {
      ...currentWorkspaceOrganization,
      configJson: currentWorkspaceOrganization.metadata,
      createdAt: new Date(currentWorkspaceOrganization.createdAt),
      updatedAt: new Date(currentWorkspaceOrganization.updatedAt)
    };

    await organizationRepository.createOrganization({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: { name: "Dupont Chauffage" }
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "organization.created",
        entityType: "organization",
        entityId: currentWorkspaceOrganization.id
      })
    );
  });

  it("writes activity log organization.updated in the update transaction", async () => {
    mockTx.state.updateResponse = {
      ...currentWorkspaceOrganization,
      name: "Updated organization",
      configJson: currentWorkspaceOrganization.metadata,
      createdAt: new Date(currentWorkspaceOrganization.createdAt),
      updatedAt: new Date(currentWorkspaceOrganization.updatedAt)
    };

    await organizationRepository.updateOrganization({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceOrganization.id,
      data: { name: "Updated organization" }
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "organization.updated",
        entityType: "organization",
        entityId: currentWorkspaceOrganization.id
      })
    );
  });

  it("writes activity log organization.archived in the archive transaction", async () => {
    mockTx.state.updateResponse = {
      ...currentWorkspaceOrganization,
      status: "archived",
      configJson: currentWorkspaceOrganization.metadata,
      createdAt: new Date(currentWorkspaceOrganization.createdAt),
      updatedAt: new Date(currentWorkspaceOrganization.updatedAt)
    };

    await organizationRepository.archiveOrganization({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceOrganization.id
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "organization.archived",
        entityType: "organization",
        entityId: currentWorkspaceOrganization.id
      })
    );
  });
});
