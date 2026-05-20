import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  ClientUserCreateInputSchema,
  ClientUserCreateSuccessSchema,
  ClientUserListSuccessSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionClientUserService,
  type ClientUserService,
  type ClientUserServiceCreateResult,
} from "../services/client-users.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const duplicateEmailResponse = ApiErrorSchema.parse({
  success: false,
  error: "Client user already exists.",
  code: "CLIENT_USER_ALREADY_EXISTS",
});

export type ClientUserRoutesDependencies = {
  authService?: AuthService;
  clientUserService?: ClientUserService;
};

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
}

function hasForbiddenClientIdentity(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenClientIdentity);
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
      key === "role" ||
      hasForbiddenClientIdentity(childValue),
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

function createResponse(c: Context<AppEnv>, result: ClientUserServiceCreateResult) {
  if (result.result === "conflict") {
    return c.json(duplicateEmailResponse, 409);
  }

  return c.json(
    ClientUserCreateSuccessSchema.parse({
      success: true,
      data: result.data,
    }),
    201,
  );
}

export function createClientUserRoutes(dependencies: ClientUserRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const clientUserService =
    dependencies.clientUserService ?? createProductionClientUserService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasForbiddenClientIdentity(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const clientUsers = await clientUserService.listClientUsers(getWorkspaceId(c));

    return c.json(
      ClientUserListSuccessSchema.parse({
        success: true,
        data: clientUsers,
      }),
    );
  });

  routes.post("/", async (c) => {
    if (hasForbiddenClientIdentity(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasForbiddenClientIdentity(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedBody = ClientUserCreateInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await clientUserService.createClientUser(getWorkspaceId(c), parsedBody.data);
    return createResponse(c, result);
  });

  return routes;
}

export const clientUserRoutes = createClientUserRoutes();
