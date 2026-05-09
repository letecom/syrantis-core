import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  WorkspaceApiKeyCreateInputSchema,
  WorkspaceApiKeyCreateSuccessSchema,
  WorkspaceApiKeyListSuccessSchema,
  WorkspaceApiKeySuccessSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionWorkspaceApiKeyService,
  type WorkspaceApiKeyService,
  type WorkspaceApiKeyServiceCreateResult,
  type WorkspaceApiKeyServiceMutationResult,
} from "../services/workspace-api-keys.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const workspaceApiKeyNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Workspace API key not found.",
  code: "WORKSPACE_API_KEY_NOT_FOUND",
});

export type WorkspaceApiKeyRoutesDependencies = {
  authService?: AuthService;
  workspaceApiKeyService?: WorkspaceApiKeyService;
};

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
}

function hasClientWorkspaceId(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasClientWorkspaceId);
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
      key === "tenant-id" ||
      hasClientWorkspaceId(childValue),
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

async function readOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}

function parseId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function mutationResponse(
  c: Context<AppEnv>,
  result: WorkspaceApiKeyServiceCreateResult | WorkspaceApiKeyServiceMutationResult,
  successStatus: ContentfulStatusCode = 200,
) {
  if (result.result === "not_found") {
    return c.json(workspaceApiKeyNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(invalidRequestResponse, 409);
  }

  return c.json(
    ("plaintextApiKey" in result.key
      ? WorkspaceApiKeyCreateSuccessSchema.parse({ success: true, data: result.key })
      : WorkspaceApiKeySuccessSchema.parse({ success: true, data: result.key })) as unknown,
    successStatus,
  );
}

export function createWorkspaceApiKeyRoutes(dependencies: WorkspaceApiKeyRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const workspaceApiKeyService =
    dependencies.workspaceApiKeyService ?? createProductionWorkspaceApiKeyService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasClientWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const keys = await workspaceApiKeyService.listWorkspaceApiKeys(getWorkspaceId(c));

    return c.json(
      WorkspaceApiKeyListSuccessSchema.parse({
        success: true,
        data: keys,
      }),
    );
  });

  routes.post("/", async (c) => {
    if (hasClientWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedBody = WorkspaceApiKeyCreateInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await workspaceApiKeyService.createWorkspaceApiKey(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data,
    );

    return mutationResponse(c, result, 201);
  });

  routes.get("/:id", async (c) => {
    if (hasClientWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const keyId = parseId(c.req.param("id"));

    if (!keyId) {
      return c.json(invalidRequestResponse, 400);
    }

    const key = await workspaceApiKeyService.getWorkspaceApiKey(getWorkspaceId(c), keyId);

    if (!key) {
      return c.json(workspaceApiKeyNotFoundResponse, 404);
    }

    return c.json(
      WorkspaceApiKeySuccessSchema.parse({
        success: true,
        data: key,
      }),
    );
  });

  routes.post("/:id/revoke", async (c) => {
    if (hasClientWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const keyId = parseId(c.req.param("id"));

    if (!keyId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const result = await workspaceApiKeyService.revokeWorkspaceApiKey(
      getWorkspaceId(c),
      c.get("userId"),
      keyId,
    );
    return mutationResponse(c, result);
  });

  return routes;
}

export const workspaceApiKeyRoutes = createWorkspaceApiKeyRoutes();
