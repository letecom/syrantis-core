import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type {
  ExternalConnectionOutput,
  ExternalObjectMappingOutput,
  ExternalObjectType,
  IntegrationEventOutput,
  SyrantisEntityType
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createAuthRoutes } from "../routes/auth.js";
import { createIntegrationRoutes } from "../routes/integrations.js";
import type { AuthService } from "../services/auth.js";
import type {
  IntegrationService,
  IntegrationServiceConnectionResult,
  IntegrationServiceMappingResult
} from "../services/integrations.js";

const testUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "founder@syrantis.test",
  name: "Founder",
  role: "admin" as const,
  workspaceId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "Syrantis Internal"
};

const validLeadId = "00000000-0000-4000-8000-000000000030";
const crossWorkspaceLeadId = "00000000-0000-4000-8000-000000000031";
const missingLeadId = "00000000-0000-4000-8000-000000000032";
const missingConnectionId = "00000000-0000-4000-8000-000000000040";

function uuidFromNumber(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function createFakeAuthService(): AuthService {
  const validToken = "test-session-token";
  let active = true;

  return {
    login: vi.fn(async (email: string, password: string) => {
      if (email.trim().toLowerCase() !== testUser.email || password !== "valid-password") {
        return null;
      }

      return { user: testUser, token: validToken };
    }),
    getCurrentUser: vi.fn(async (token: string) => (active && token === validToken ? testUser : null)),
    logout: vi.fn(async () => {
      active = false;
    })
  };
}

function createFakeIntegrationService() {
  const connections = new Map<string, ExternalConnectionOutput>();
  const mappings = new Map<string, ExternalObjectMappingOutput>();
  const events: IntegrationEventOutput[] = [];
  const activityActions: string[] = [];
  const validLeadIds = new Set([validLeadId]);
  let nextConnectionId = 10;
  let nextMappingId = 20;
  let nextEventId = 100;

  function recordInternalEvent(input: {
    action: string;
    connectionId?: string | null;
    mappingId?: string | null;
    externalObjectType?: ExternalObjectType | null;
    externalObjectId?: string | null;
    syrantisEntityType?: SyrantisEntityType | null;
    syrantisEntityId?: string | null;
  }) {
    activityActions.push(input.action);
    events.unshift({
      id: uuidFromNumber(nextEventId),
      workspaceId: testUser.workspaceId,
      connectionId: input.connectionId ?? null,
      mappingId: input.mappingId ?? null,
      direction: "internal",
      eventType: input.action,
      status: "processed",
      externalObjectType: input.externalObjectType ?? null,
      externalObjectId: input.externalObjectId ?? null,
      syrantisEntityType: input.syrantisEntityType ?? null,
      syrantisEntityId: input.syrantisEntityId ?? null,
      message: null,
      payloadHash: null,
      metadata: {},
      createdAt: "2026-05-01T11:00:00.000Z"
    });
    nextEventId += 1;
  }

  function duplicateMappingExists(input: Record<string, unknown>): boolean {
    return [...mappings.values()].some((mapping) => (
      mapping.connectionId === input.connectionId &&
      mapping.externalObjectType === input.externalObjectType &&
      mapping.externalObjectId === input.externalObjectId &&
      mapping.syrantisEntityType === input.syrantisEntityType
    ));
  }

  return {
    activityActions,
    listConnections: vi.fn(async (_workspaceId: string) => {
      void _workspaceId;
      return [...connections.values()];
    }),
    getConnection: vi.fn(async (_workspaceId: string, id: string) => {
      void _workspaceId;
      const connection = connections.get(id);
      return connection && connection.status !== "archived" ? connection : null;
    }),
    createConnection: vi.fn(async (_workspaceId: string, _actorUserId: string, input: Record<string, unknown>) => {
      void _workspaceId;
      void _actorUserId;
      const connection: ExternalConnectionOutput = {
        id: uuidFromNumber(nextConnectionId),
        workspaceId: testUser.workspaceId,
        provider: input.provider as ExternalConnectionOutput["provider"],
        name: input.name as string,
        status: (input.status as ExternalConnectionOutput["status"]) ?? "setup",
        authType: (input.authType as ExternalConnectionOutput["authType"]) ?? "none",
        externalAccountId: (input.externalAccountId as string | null) ?? null,
        externalAccountLabel: (input.externalAccountLabel as string | null) ?? null,
        config: (input.config as Record<string, unknown>) ?? {},
        metadata: (input.metadata as Record<string, unknown>) ?? {},
        lastSyncAt: (input.lastSyncAt as string | null) ?? null,
        createdAt: "2026-05-01T11:00:00.000Z",
        updatedAt: "2026-05-01T11:00:00.000Z"
      };

      nextConnectionId += 1;
      connections.set(connection.id, connection);
      recordInternalEvent({ action: "external_connection.created", connectionId: connection.id });
      return { result: "ok", connection } as IntegrationServiceConnectionResult;
    }),
    updateConnection: vi.fn(async (_workspaceId: string, _actorUserId: string, id: string, input: Record<string, unknown>) => {
      void _workspaceId;
      void _actorUserId;
      const existing = connections.get(id);

      if (!existing || existing.status === "archived") {
        return { result: "not_found" } as IntegrationServiceConnectionResult;
      }

      const updated: ExternalConnectionOutput = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name as string } : {}),
        ...(input.status !== undefined ? { status: input.status as ExternalConnectionOutput["status"] } : {}),
        ...(input.authType !== undefined ? { authType: input.authType as ExternalConnectionOutput["authType"] } : {}),
        ...(input.externalAccountId !== undefined ? { externalAccountId: input.externalAccountId as string | null } : {}),
        ...(input.externalAccountLabel !== undefined
          ? { externalAccountLabel: input.externalAccountLabel as string | null }
          : {}),
        ...(input.config !== undefined ? { config: input.config as Record<string, unknown> } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as Record<string, unknown> } : {})
      };

      connections.set(id, updated);
      recordInternalEvent({ action: "external_connection.updated", connectionId: id });
      return { result: "ok", connection: updated } as IntegrationServiceConnectionResult;
    }),
    archiveConnection: vi.fn(async (_workspaceId: string, _actorUserId: string, id: string) => {
      void _workspaceId;
      void _actorUserId;
      const existing = connections.get(id);

      if (!existing || existing.status === "archived") {
        return { result: "not_found" } as IntegrationServiceConnectionResult;
      }

      const archived: ExternalConnectionOutput = { ...existing, status: "archived", updatedAt: "2026-05-01T12:00:00.000Z" };
      connections.set(id, archived);
      recordInternalEvent({ action: "external_connection.archived", connectionId: id });
      return { result: "ok", connection: archived } as IntegrationServiceConnectionResult;
    }),
    listMappings: vi.fn(async () => [...mappings.values()]),
    getMapping: vi.fn(async (_workspaceId: string, id: string) => {
      const mapping = mappings.get(id);
      return mapping && mapping.syncStatus !== "archived" ? mapping : null;
    }),
    createMapping: vi.fn(async (_workspaceId: string, _actorUserId: string, input: Record<string, unknown>) => {
      void _workspaceId;
      void _actorUserId;
      const connection = connections.get(input.connectionId as string);

      if (!connection || connection.status === "archived") {
        return { result: "not_found" } as IntegrationServiceMappingResult;
      }

      if (input.syrantisEntityType !== "lead" || !validLeadIds.has(input.syrantisEntityId as string)) {
        return { result: "not_found" } as IntegrationServiceMappingResult;
      }

      if (duplicateMappingExists(input)) {
        return { result: "conflict" } as IntegrationServiceMappingResult;
      }

      const mapping: ExternalObjectMappingOutput = {
        id: uuidFromNumber(nextMappingId),
        workspaceId: testUser.workspaceId,
        connectionId: input.connectionId as string,
        externalObjectType: input.externalObjectType as ExternalObjectType,
        externalObjectId: input.externalObjectId as string,
        syrantisEntityType: input.syrantisEntityType as SyrantisEntityType,
        syrantisEntityId: input.syrantisEntityId as string,
        syncDirection: (input.syncDirection as ExternalObjectMappingOutput["syncDirection"]) ?? "inbound",
        syncStatus: (input.syncStatus as ExternalObjectMappingOutput["syncStatus"]) ?? "active",
        externalUrl: (input.externalUrl as string | null) ?? null,
        externalUpdatedAt: (input.externalUpdatedAt as string | null) ?? null,
        lastSeenAt: (input.lastSeenAt as string | null) ?? null,
        metadata: (input.metadata as Record<string, unknown>) ?? {},
        createdAt: "2026-05-01T11:00:00.000Z",
        updatedAt: "2026-05-01T11:00:00.000Z"
      };

      nextMappingId += 1;
      mappings.set(mapping.id, mapping);
      recordInternalEvent({
        action: "external_object_mapping.created",
        connectionId: mapping.connectionId,
        mappingId: mapping.id,
        externalObjectType: mapping.externalObjectType,
        externalObjectId: mapping.externalObjectId,
        syrantisEntityType: mapping.syrantisEntityType,
        syrantisEntityId: mapping.syrantisEntityId
      });
      return { result: "ok", mapping } as IntegrationServiceMappingResult;
    }),
    updateMapping: vi.fn(async (_workspaceId: string, _actorUserId: string, id: string, input: Record<string, unknown>) => {
      void _workspaceId;
      void _actorUserId;
      const existing = mappings.get(id);

      if (!existing || existing.syncStatus === "archived") {
        return { result: "not_found" } as IntegrationServiceMappingResult;
      }

      const updated: ExternalObjectMappingOutput = {
        ...existing,
        ...(input.externalUrl !== undefined ? { externalUrl: input.externalUrl as string | null } : {}),
        ...(input.syncStatus !== undefined ? { syncStatus: input.syncStatus as ExternalObjectMappingOutput["syncStatus"] } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as Record<string, unknown> } : {})
      };

      mappings.set(id, updated);
      recordInternalEvent({
        action: "external_object_mapping.updated",
        connectionId: updated.connectionId,
        mappingId: updated.id,
        externalObjectType: updated.externalObjectType,
        externalObjectId: updated.externalObjectId,
        syrantisEntityType: updated.syrantisEntityType,
        syrantisEntityId: updated.syrantisEntityId
      });
      return { result: "ok", mapping: updated } as IntegrationServiceMappingResult;
    }),
    archiveMapping: vi.fn(async (_workspaceId: string, _actorUserId: string, id: string) => {
      void _workspaceId;
      void _actorUserId;
      const existing = mappings.get(id);

      if (!existing || existing.syncStatus === "archived") {
        return { result: "not_found" } as IntegrationServiceMappingResult;
      }

      const archived: ExternalObjectMappingOutput = {
        ...existing,
        syncStatus: "archived",
        updatedAt: "2026-05-01T12:00:00.000Z"
      };

      mappings.set(id, archived);
      recordInternalEvent({
        action: "external_object_mapping.archived",
        connectionId: archived.connectionId,
        mappingId: archived.id,
        externalObjectType: archived.externalObjectType,
        externalObjectId: archived.externalObjectId,
        syrantisEntityType: archived.syrantisEntityType,
        syrantisEntityId: archived.syrantisEntityId
      });
      return { result: "ok", mapping: archived } as IntegrationServiceMappingResult;
    }),
    listEvents: vi.fn(async () => events)
  };
}

function createTestApp(authService: AuthService, integrationService: IntegrationService): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ authService }));
  app.route("/api/integrations", createIntegrationRoutes({ authService, integrationService }));
  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=test-session-token`,
    "content-type": "application/json"
  };
}

function jsonHeaders() {
  return {
    ...validSessionHeaders()
  };
}

async function createConnection(app: Hono): Promise<ExternalConnectionOutput> {
  const response = await app.request("/api/integrations/connections", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      provider: "generic",
      name: "CRM Import",
      authType: "none"
    })
  });

  expect(response.status).toBe(201);
  return (await response.json()).data as ExternalConnectionOutput;
}

async function createMapping(app: Hono, connectionId: string): Promise<ExternalObjectMappingOutput> {
  const response = await app.request("/api/integrations/mappings", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      connectionId,
      externalObjectType: "lead",
      externalObjectId: "external-123",
      syrantisEntityType: "lead",
      syrantisEntityId: validLeadId
    })
  });

  expect(response.status).toBe(201);
  return (await response.json()).data as ExternalObjectMappingOutput;
}

describe("integration routes", () => {
  it("returns 401 for GET /api/integrations/connections without session", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);

    const response = await app.request("/api/integrations/connections");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("creates, lists, gets, updates, and archives a connection", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);

    const createResponse = await app.request("/api/integrations/connections", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        provider: "generic",
        name: "CRM Import",
        authType: "none",
        config: { source: "manual" },
        metadata: { purpose: "test" }
      })
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.success).toBe(true);
    expect(created.data.name).toBe("CRM Import");

    const listResponse = await app.request("/api/integrations/connections", {
      headers: validSessionHeaders()
    });

    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).data.length).toBe(1);

    const connectionId = created.data.id;

    const getResponse = await app.request(`/api/integrations/connections/${connectionId}`, {
      headers: validSessionHeaders()
    });

    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).data.id).toBe(connectionId);

    const updateResponse = await app.request(`/api/integrations/connections/${connectionId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: "CRM Import Updated"
      })
    });

    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).data.name).toBe("CRM Import Updated");

    const archiveResponse = await app.request(`/api/integrations/connections/${connectionId}/archive`, {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(archiveResponse.status).toBe(200);
    expect((await archiveResponse.json()).data.status).toBe("archived");
  });

  it("rejects workspaceId in body and query", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);

    const response = await app.request("/api/integrations/connections?workspaceId=00000000-0000-4000-8000-000000000003", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid request.", code: "INVALID_REQUEST" });

    const postResponse = await app.request("/api/integrations/connections", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: "00000000-0000-4000-8000-000000000003",
        provider: "generic",
        name: "CRM Import"
      })
    });

    expect(postResponse.status).toBe(400);
    expect(await postResponse.json()).toEqual({ success: false, error: "Invalid request.", code: "INVALID_REQUEST" });
  });

  it("rejects config and metadata secret-like keys", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);

    const response = await app.request("/api/integrations/connections", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        provider: "generic",
        name: "CRM Import",
        config: { apiKey: "secret" }
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid request.", code: "INVALID_REQUEST" });
  });

  it("creates a mapping for a valid lead and updates it", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);

    const createResponse = await app.request("/api/integrations/mappings", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        connectionId: connection.id,
        externalObjectType: "lead",
        externalObjectId: "external-123",
        syrantisEntityType: "lead",
        syrantisEntityId: validLeadId
      })
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.success).toBe(true);
    expect(created.data.externalObjectType).toBe("lead");

    const mappingId = created.data.id;

    const updateResponse = await app.request(`/api/integrations/mappings/${mappingId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ syncStatus: "stale" })
    });

    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).data.syncStatus).toBe("stale");
  });

  it("returns 409 for a duplicate mapping on the same connection, external object, and entity type", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);
    await createMapping(app, connection.id);

    const duplicateResponse = await app.request("/api/integrations/mappings", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        connectionId: connection.id,
        externalObjectType: "lead",
        externalObjectId: "external-123",
        syrantisEntityType: "lead",
        syrantisEntityId: validLeadId
      })
    });

    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toEqual({
      success: false,
      error: "Mapping conflict.",
      code: "MAPPING_CONFLICT"
    });
  });

  it("returns 404 when creating a mapping for a missing or cross-workspace lead", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);

    for (const syrantisEntityId of [missingLeadId, crossWorkspaceLeadId]) {
      const response = await app.request("/api/integrations/mappings", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          connectionId: connection.id,
          externalObjectType: "lead",
          externalObjectId: `external-${syrantisEntityId.slice(-2)}`,
          syrantisEntityType: "lead",
          syrantisEntityId
        })
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        success: false,
        error: "Mapping not found.",
        code: "MAPPING_NOT_FOUND"
      });
    }
  });

  it("returns 404 when creating a mapping with a missing connection", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);

    const response = await app.request("/api/integrations/mappings", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        connectionId: missingConnectionId,
        externalObjectType: "lead",
        externalObjectId: "external-missing-connection",
        syrantisEntityType: "lead",
        syrantisEntityId: validLeadId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Mapping not found.",
      code: "MAPPING_NOT_FOUND"
    });
  });

  it("returns 404 when creating a mapping with an archived connection", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);

    const archiveResponse = await app.request(`/api/integrations/connections/${connection.id}/archive`, {
      method: "POST",
      headers: validSessionHeaders()
    });
    expect(archiveResponse.status).toBe(200);

    const response = await app.request("/api/integrations/mappings", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        connectionId: connection.id,
        externalObjectType: "lead",
        externalObjectId: "external-archived-connection",
        syrantisEntityType: "lead",
        syrantisEntityId: validLeadId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Mapping not found.",
      code: "MAPPING_NOT_FOUND"
    });
  });

  it("archives a mapping and returns syncStatus archived", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);
    const mapping = await createMapping(app, connection.id);

    const response = await app.request(`/api/integrations/mappings/${mapping.id}/archive`, {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.syncStatus).toBe("archived");
  });

  it("returns internal integration events for connection and mapping changes", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);
    await createMapping(app, connection.id);

    const response = await app.request("/api/integrations/events", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    const eventTypes = ((await response.json()).data as IntegrationEventOutput[]).map((event) => event.eventType);
    expect(eventTypes).toContain("external_connection.created");
    expect(eventTypes).toContain("external_object_mapping.created");
  });

  it("records the expected activity and integration actions for integration mutations", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);
    const connection = await createConnection(app);

    const updateConnectionResponse = await app.request(`/api/integrations/connections/${connection.id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "CRM Import Updated" })
    });
    expect(updateConnectionResponse.status).toBe(200);

    const mapping = await createMapping(app, connection.id);

    const updateMappingResponse = await app.request(`/api/integrations/mappings/${mapping.id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ syncStatus: "stale" })
    });
    expect(updateMappingResponse.status).toBe(200);

    const archiveMappingResponse = await app.request(`/api/integrations/mappings/${mapping.id}/archive`, {
      method: "POST",
      headers: validSessionHeaders()
    });
    expect(archiveMappingResponse.status).toBe(200);

    const archiveConnectionResponse = await app.request(`/api/integrations/connections/${connection.id}/archive`, {
      method: "POST",
      headers: validSessionHeaders()
    });
    expect(archiveConnectionResponse.status).toBe(200);

    const expectedActions = [
      "external_connection.created",
      "external_connection.updated",
      "external_connection.archived",
      "external_object_mapping.created",
      "external_object_mapping.updated",
      "external_object_mapping.archived"
    ];

    expect(integrationService.activityActions).toEqual(expect.arrayContaining(expectedActions));

    const eventsResponse = await app.request("/api/integrations/events", {
      headers: validSessionHeaders()
    });
    expect(eventsResponse.status).toBe(200);
    const eventTypes = ((await eventsResponse.json()).data as IntegrationEventOutput[]).map((event) => event.eventType);
    expect(eventTypes).toEqual(expect.arrayContaining(expectedActions));
  });

  it("returns 401 after logout", async () => {
    const authService = createFakeAuthService();
    const integrationService = createFakeIntegrationService();
    const app = createTestApp(authService, integrationService);

    await app.request("/auth/logout", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=test-session-token` }
    });

    const response = await app.request("/api/integrations/connections", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Unauthorized.", code: "INVALID_SESSION" });
  });
});
