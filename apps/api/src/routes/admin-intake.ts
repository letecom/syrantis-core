import { Hono, type Context } from "hono";

import {
  AdminIntakeTestEmailRequestSchema,
  AdminIntakeTestEmailResponseSchema,
  ApiErrorSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import {
  createProductionAdminIntakeService,
  type AdminIntakeService,
} from "../services/admin-intake.js";
import type { AuthService } from "../services/auth.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type AdminIntakeRoutesDependencies = {
  authService?: AuthService;
  adminIntakeService?: AdminIntakeService;
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
      hasForbiddenWorkspaceId(childValue),
  );
}

function hasWorkspaceHeader(c: Context<AppEnv>): boolean {
  return Boolean(
    c.req.header("workspaceId") ??
      c.req.header("workspace-id") ??
      c.req.header("workspace_id") ??
      c.req.header("x-workspace-id"),
  );
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export function createAdminIntakeRoutes(dependencies: AdminIntakeRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const adminIntakeService = dependencies.adminIntakeService ?? createProductionAdminIntakeService();

  routes.use("*", guard);

  routes.post("/test-email", async (c) => {
    const body = await readJsonBody(c);

    if (hasForbiddenWorkspaceId(c.req.query()) || hasForbiddenWorkspaceId(body) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedBody = AdminIntakeTestEmailRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 422);
    }

    try {
      const result = await adminIntakeService.createTestEmail({
        workspaceId: getWorkspaceId(c),
        actorUserId: c.get("userId"),
        data: parsedBody.data,
      });

      return c.json(
        AdminIntakeTestEmailResponseSchema.parse({
          success: true,
          data: result,
        }),
        201,
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const adminIntakeRoutes = createAdminIntakeRoutes();
