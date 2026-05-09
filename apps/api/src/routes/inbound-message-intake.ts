import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  InboundMessageIntakeRequestSchema,
  InboundMessageIntakeResponseSchema,
} from "@syrantis/shared";

import {
  createProductionInboundMessageIntakeService,
  type InboundMessageIntakeService,
  type InboundMessageIntakeServiceResult,
} from "../services/inbound-message-intake.js";
import { authenticateWorkspaceApiKey } from "../services/public-api-key-auth.js";
import type { PublicApiKeyLookupRow } from "../repositories/public-lead-intake.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const unauthorizedResponse = ApiErrorSchema.parse({
  success: false,
  error: "Unauthorized.",
  code: "UNAUTHORIZED",
});

const rateLimitedResponse = ApiErrorSchema.parse({
  success: false,
  error: "Too many requests.",
  code: "RATE_LIMITED",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type InboundMessageIntakeRoutesDependencies = {
  authenticateApiKey?: (authorizationHeader?: string | null) => Promise<PublicApiKeyLookupRow | null>;
  inboundMessageIntakeService?: InboundMessageIntakeService;
};

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function hasForbiddenWorkspaceId(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenWorkspaceId);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(
    ([key, childValue]) =>
      key === "workspaceId" ||
      key === "workspace_id" ||
      key === "workspace-id" ||
      key === "tenantId" ||
      key === "tenant_id" ||
      hasForbiddenWorkspaceId(childValue),
  );
}

function hasWorkspaceHeader(c: Context<AppEnv>): boolean {
  return Boolean(
    c.req.header("workspaceId") ??
      c.req.header("workspace-id") ??
      c.req.header("workspace_id") ??
      c.req.header("x-workspace-id") ??
      c.req.header("tenantId") ??
      c.req.header("tenant-id") ??
      c.req.header("tenant_id") ??
      c.req.header("x-tenant-id"),
  );
}

function hasCredentialQuery(value: Record<string, string | string[]>): boolean {
  return Object.keys(value).some((key) =>
    ["apiKey", "api_key", "token", "authorization", "bearer"].includes(key),
  );
}

function intakeResponse(c: Context<AppEnv>, result: InboundMessageIntakeServiceResult) {
  switch (result.result) {
    case "rate_limited":
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(rateLimitedResponse, 429);
    case "idempotent_replay":
      return c.json(
        InboundMessageIntakeResponseSchema.parse({
          success: true,
          data: result.data,
        }),
        200,
      );
    case "created":
      return c.json(
        InboundMessageIntakeResponseSchema.parse({
          success: true,
          data: result.data,
        }),
        201,
      );
  }
}

export function createInboundMessageIntakeRoutes(
  dependencies: InboundMessageIntakeRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const authenticateApiKey = dependencies.authenticateApiKey ?? authenticateWorkspaceApiKey;
  const inboundMessageIntakeService =
    dependencies.inboundMessageIntakeService ?? createProductionInboundMessageIntakeService();

  routes.post("/inbound-message", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c) || hasCredentialQuery(c.req.query())) {
      return c.json(invalidRequestResponse, 422);
    }

    try {
      const apiKey = await authenticateApiKey(c.req.header("authorization") ?? null);

      if (!apiKey) {
        return c.json(unauthorizedResponse, 401);
      }

      const body = await readJsonBody(c);

      if (hasForbiddenWorkspaceId(body)) {
        return c.json(invalidRequestResponse, 422);
      }

      const parsedBody = InboundMessageIntakeRequestSchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(invalidRequestResponse, 422);
      }

      const result = await inboundMessageIntakeService.receiveInboundMessage({
        apiKey,
        payload: parsedBody.data,
      });

      return intakeResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const inboundMessageIntakeRoutes = createInboundMessageIntakeRoutes();
