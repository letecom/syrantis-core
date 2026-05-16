import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  ClientResponsePolicyGetSuccessSchema,
  ClientResponsePolicyInputSchema,
  ClientResponsePolicyPutSuccessSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionClientResponsePolicyService,
  type ClientResponsePolicyService,
} from "../../services/client-response-policy.js";
import type { AppEnv } from "../../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

export type ClientResponsePolicyRoutesDependencies = {
  authService?: AuthService;
  clientResponsePolicyService?: ClientResponsePolicyService;
};

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
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

export function createClientResponsePolicyRoutes(
  dependencies: ClientResponsePolicyRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const clientResponsePolicyService =
    dependencies.clientResponsePolicyService ?? createProductionClientResponsePolicyService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const policy = await clientResponsePolicyService.getClientResponsePolicy(getWorkspaceId(c));

    return c.json(
      ClientResponsePolicyGetSuccessSchema.parse({
        success: true,
        data: { policy },
      }),
    );
  });

  routes.put("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedBody = ClientResponsePolicyInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await clientResponsePolicyService.putClientResponsePolicy(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data,
    );

    return c.json(
      ClientResponsePolicyPutSuccessSchema.parse({
        success: true,
        data: { policy: result.policy },
      }),
    );
  });

  return routes;
}

export const clientResponsePolicyRoutes = createClientResponsePolicyRoutes();
