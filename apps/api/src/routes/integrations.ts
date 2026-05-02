import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  ExternalConnectionCreateInputSchema,
  ExternalConnectionListQuerySchema,
  ExternalConnectionListSuccessSchema,
  ExternalConnectionSuccessSchema,
  ExternalConnectionUpdateInputSchema,
  ExternalObjectMappingCreateInputSchema,
  ExternalObjectMappingListQuerySchema,
  ExternalObjectMappingListSuccessSchema,
  ExternalObjectMappingSuccessSchema,
  ExternalObjectMappingUpdateInputSchema,
  IntegrationEventListQuerySchema,
  IntegrationEventListSuccessSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionIntegrationService,
  type IntegrationService,
  type IntegrationServiceConnectionResult,
  type IntegrationServiceMappingResult
} from "../services/integrations.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const connectionNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Connection not found.",
  code: "CONNECTION_NOT_FOUND"
});

const connectionConflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Connection conflict.",
  code: "CONNECTION_CONFLICT"
});

const mappingNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Mapping not found.",
  code: "MAPPING_NOT_FOUND"
});

const mappingConflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Mapping conflict.",
  code: "MAPPING_CONFLICT"
});

export type IntegrationRoutesDependencies = {
  authService?: AuthService;
  integrationService?: IntegrationService;
};

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

async function readOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}

function parseId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

const secretLikeKeys = new Set([
  "apiKey",
  "api_key",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "password",
  "secret",
  "clientSecret",
  "client_secret",
  "bearer",
  "authorization",
  "privateKey",
  "private_key"
]);

function containsSecretLikeKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSecretLikeKeys);
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([key, child]) => secretLikeKeys.has(key) || containsSecretLikeKeys(child));
  }

  return false;
}

function mutationResponse(
  c: Context<AppEnv>,
  result: IntegrationServiceConnectionResult | IntegrationServiceMappingResult,
  successStatus: ContentfulStatusCode = 200
) {
  if (result.result === "not_found") {
    return c.json("connection" in result ? connectionNotFoundResponse : mappingNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json("connection" in result ? connectionConflictResponse : mappingConflictResponse, 409);
  }

  return c.json(
    ("connection" in result
      ? ExternalConnectionSuccessSchema.parse({ success: true, data: result.connection })
      : ExternalObjectMappingSuccessSchema.parse({ success: true, data: result.mapping })) as unknown,
    successStatus
  );
}

export function createIntegrationRoutes(dependencies: IntegrationRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const integrationService = dependencies.integrationService ?? createProductionIntegrationService();

  routes.use("*", guard);

  routes.get("/connections", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = ExternalConnectionListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const connections = await integrationService.listConnections(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      ExternalConnectionListSuccessSchema.parse({
        success: true,
        data: connections
      })
    );
  });

  routes.post("/connections", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = ExternalConnectionCreateInputSchema.safeParse(body);

    if (!parsedBody.success || containsSecretLikeKeys(parsedBody.data.config) || containsSecretLikeKeys(parsedBody.data.metadata)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await integrationService.createConnection(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data
    );
    return mutationResponse(c, result, 201);
  });

  routes.get("/connections/:id", async (c) => {
    const connectionId = parseId(c.req.param("id"));

    if (!connectionId) {
      return c.json(invalidRequestResponse, 400);
    }

    const connection = await integrationService.getConnection(getWorkspaceId(c), connectionId);

    if (!connection) {
      return c.json(connectionNotFoundResponse, 404);
    }

    return c.json(
      ExternalConnectionSuccessSchema.parse({
        success: true,
        data: connection
      })
    );
  });

  routes.patch("/connections/:id", async (c) => {
    const connectionId = parseId(c.req.param("id"));

    if (!connectionId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = ExternalConnectionUpdateInputSchema.safeParse(body);

    if (!parsedBody.success || containsSecretLikeKeys(parsedBody.data.config) || containsSecretLikeKeys(parsedBody.data.metadata)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await integrationService.updateConnection(
      getWorkspaceId(c),
      c.get("userId"),
      connectionId,
      parsedBody.data
    );
    return mutationResponse(c, result);
  });

  routes.post("/connections/:id/archive", async (c) => {
    const connectionId = parseId(c.req.param("id"));

    if (!connectionId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await integrationService.archiveConnection(getWorkspaceId(c), c.get("userId"), connectionId);
    return mutationResponse(c, result);
  });

  routes.get("/mappings", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = ExternalObjectMappingListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const mappings = await integrationService.listMappings(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      ExternalObjectMappingListSuccessSchema.parse({
        success: true,
        data: mappings
      })
    );
  });

  routes.post("/mappings", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = ExternalObjectMappingCreateInputSchema.safeParse(body);

    if (!parsedBody.success || containsSecretLikeKeys(parsedBody.data.metadata)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await integrationService.createMapping(getWorkspaceId(c), c.get("userId"), parsedBody.data);
    return mutationResponse(c, result, 201);
  });

  routes.get("/mappings/:id", async (c) => {
    const mappingId = parseId(c.req.param("id"));

    if (!mappingId) {
      return c.json(invalidRequestResponse, 400);
    }

    const mapping = await integrationService.getMapping(getWorkspaceId(c), mappingId);

    if (!mapping) {
      return c.json(mappingNotFoundResponse, 404);
    }

    return c.json(
      ExternalObjectMappingSuccessSchema.parse({
        success: true,
        data: mapping
      })
    );
  });

  routes.patch("/mappings/:id", async (c) => {
    const mappingId = parseId(c.req.param("id"));

    if (!mappingId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = ExternalObjectMappingUpdateInputSchema.safeParse(body);

    if (!parsedBody.success || containsSecretLikeKeys(parsedBody.data.metadata)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await integrationService.updateMapping(getWorkspaceId(c), c.get("userId"), mappingId, parsedBody.data);
    return mutationResponse(c, result);
  });

  routes.post("/mappings/:id/archive", async (c) => {
    const mappingId = parseId(c.req.param("id"));

    if (!mappingId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await integrationService.archiveMapping(getWorkspaceId(c), c.get("userId"), mappingId);
    return mutationResponse(c, result);
  });

  routes.get("/events", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = IntegrationEventListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const events = await integrationService.listEvents(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      IntegrationEventListSuccessSchema.parse({
        success: true,
        data: events
      })
    );
  });

  return routes;
}

export const integrationRoutes = createIntegrationRoutes();
