import { Hono, type Context } from "hono";
import { z } from "zod";

import {
  ApiErrorSchema,
  ClientResponseProfileCreateSchema,
  ClientResponseProfileSchema,
  ClientResponseProfileSuccessSchema,
  ClientResponseProfilesListSuccessSchema,
  ClientResponseProfileUpdateSchema,
  forbidden,
  type ClientResponseProfile,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { WorkspaceResponseProfileRow } from "../../repositories/client-response-profiles.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionClientResponseProfilesService,
  type ClientResponseProfilesService,
} from "../../services/client-response-profiles.js";
import type { AppEnv } from "../../types/hono.js";

const idParamSchema = z.string().uuid();

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const notFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Response profile not found.",
  code: "RESPONSE_PROFILE_NOT_FOUND",
});

function conflictResponse(code: string) {
  return ApiErrorSchema.parse({
    success: false,
    error: "Response profile conflict.",
    code,
  });
}

const forbiddenFieldNames = new Set([
  "workspaceId",
  "workspace_id",
  "prompt",
  "systemPrompt",
  "template",
  "output",
  "generatedText",
  "providerId",
  "modelId",
  "apiKey",
  "api_key",
  "token",
  "secret",
  "raw",
  "metadata",
  "config",
  "settings",
  "password",
  "passwordHash",
]);

export type ClientResponseProfilesRoutesDependencies = {
  authService?: AuthService;
  clientResponseProfilesService?: ClientResponseProfilesService;
};

function canAccessClientConfig(role: string): boolean {
  return role === "client" || role === "admin" || role === "founder";
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
      key === "x-workspace-id" ||
      key === "tenantId" ||
      key === "tenant_id" ||
      key === "tenant-id" ||
      key === "x-tenant-id" ||
      hasForbiddenWorkspaceId(childValue),
  );
}

function hasForbiddenClientField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenClientField);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(
    ([key, childValue]) => forbiddenFieldNames.has(key) || hasForbiddenClientField(childValue),
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

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export function toClientResponseProfile(row: WorkspaceResponseProfileRow): ClientResponseProfile {
  return ClientResponseProfileSchema.parse({
    id: row.id,
    name: row.name,
    senderName: row.senderName,
    roleLabel: row.roleLabel,
    description: row.description,
    tone: row.tone,
    styleNotes: row.styleNotes,
    authorityLevel: row.authorityLevel,
    appliesToCategories: row.appliesToCategories,
    specificRules: row.specificRules,
    escalationRules: row.escalationRules,
    forbiddenClaims: row.forbiddenClaims,
    isDefault: row.isDefault,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function createClientResponseProfilesRoutes(
  dependencies: ClientResponseProfilesRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const profilesService =
    dependencies.clientResponseProfilesService ?? createProductionClientResponseProfilesService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!canAccessClientConfig(c.get("currentUser").role)) {
      return c.json(forbidden("CLIENT_CONFIG_ACCESS_REQUIRED"), 403);
    }

    const profiles = await profilesService.listProfiles(getWorkspaceId(c));

    return c.json(
      ClientResponseProfilesListSuccessSchema.parse({
        success: true,
        data: { profiles: profiles.map(toClientResponseProfile) },
      }),
    );
  });

  routes.post("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasForbiddenClientField(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!canAccessClientConfig(c.get("currentUser").role)) {
      return c.json(forbidden("CLIENT_CONFIG_ACCESS_REQUIRED"), 403);
    }

    const parsedBody = ClientResponseProfileCreateSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await profilesService.createProfile(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data,
    );

    return c.json(
      ClientResponseProfileSuccessSchema.parse({
        success: true,
        data: { profile: toClientResponseProfile(result.profile) },
      }),
      201,
    );
  });

  routes.put("/:id", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const id = idParamSchema.safeParse(c.req.param("id"));

    if (!id.success) {
      return c.json(notFoundResponse, 404);
    }

    const body = await readJsonBody(c);

    if (hasForbiddenClientField(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!canAccessClientConfig(c.get("currentUser").role)) {
      return c.json(forbidden("CLIENT_CONFIG_ACCESS_REQUIRED"), 403);
    }

    const parsedBody = ClientResponseProfileUpdateSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await profilesService.updateProfile(
      getWorkspaceId(c),
      c.get("userId"),
      id.data,
      parsedBody.data,
    );

    if (result.result === "not_found") {
      return c.json(notFoundResponse, 404);
    }

    if (result.result === "conflict") {
      return c.json(conflictResponse(result.code), 409);
    }

    return c.json(
      ClientResponseProfileSuccessSchema.parse({
        success: true,
        data: { profile: toClientResponseProfile(result.profile) },
      }),
    );
  });

  routes.delete("/:id", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const id = idParamSchema.safeParse(c.req.param("id"));

    if (!id.success) {
      return c.json(notFoundResponse, 404);
    }

    if (!canAccessClientConfig(c.get("currentUser").role)) {
      return c.json(forbidden("CLIENT_CONFIG_ACCESS_REQUIRED"), 403);
    }

    const result = await profilesService.deactivateProfile(
      getWorkspaceId(c),
      c.get("userId"),
      id.data,
    );

    if (result.result === "not_found") {
      return c.json(notFoundResponse, 404);
    }

    if (result.result === "conflict") {
      return c.json(conflictResponse(result.code), 409);
    }

    return c.json(
      ClientResponseProfileSuccessSchema.parse({
        success: true,
        data: { profile: toClientResponseProfile(result.profile) },
      }),
    );
  });

  return routes;
}

export const clientResponseProfilesRoutes = createClientResponseProfilesRoutes();
