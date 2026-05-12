import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  WorkspaceContextGetSuccessSchema,
  WorkspaceContextInputSchema,
  WorkspaceContextPutSuccessSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionWorkspaceContextService,
  type WorkspaceContextService,
} from "../services/workspace-context.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

export type WorkspaceContextRoutesDependencies = {
  authService?: AuthService;
  workspaceContextService?: WorkspaceContextService;
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

export function createWorkspaceContextRoutes(
  dependencies: WorkspaceContextRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const workspaceContextService =
    dependencies.workspaceContextService ?? createProductionWorkspaceContextService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasClientWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const profile = await workspaceContextService.getWorkspaceContext(getWorkspaceId(c));

    return c.json(
      WorkspaceContextGetSuccessSchema.parse({
        success: true,
        data: {
          profile,
        },
      }),
    );
  });

  routes.put("/", async (c) => {
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

    const parsedBody = WorkspaceContextInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await workspaceContextService.putWorkspaceContext(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data,
    );

    return c.json(
      WorkspaceContextPutSuccessSchema.parse({
        success: true,
        data: {
          profile: result.profile,
        },
      }),
    );
  });

  return routes;
}

export const workspaceContextRoutes = createWorkspaceContextRoutes();
