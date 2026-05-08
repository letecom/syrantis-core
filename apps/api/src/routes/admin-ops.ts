import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  adminOpsCheckIdSchema,
  adminOpsHealthResponseSchema,
  adminOpsRecentChecksResponseSchema,
  adminOpsRunCheckResponseSchema,
  forbidden,
  type AdminOpsCheckId,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionAdminOpsService,
  type AdminOpsService,
} from "../services/admin-ops.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const unknownCheckResponse = ApiErrorSchema.parse({
  success: false,
  error: "Unknown check.",
  code: "UNKNOWN_CHECK",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type AdminOpsRoutesDependencies = {
  authService?: AuthService;
  adminOpsService?: AdminOpsService;
};

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
}

function hasClientWorkspaceId(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    ("workspaceId" in value || "workspace_id" in value || "workspace-id" in value)
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

async function readOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const limit = Number(value);
  return Number.isFinite(limit) ? limit : Number.NaN;
}

export function createAdminOpsRoutes(dependencies: AdminOpsRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const adminOpsService = dependencies.adminOpsService ?? createProductionAdminOpsService();

  routes.use("*", guard);

  routes.get("/health", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const health = await adminOpsService.getHealth(getWorkspaceId(c));

      return c.json(
        adminOpsHealthResponseSchema.parse({
          success: true,
          data: health,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.get("/checks/recent", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedCheckId =
      query.checkId === undefined ? undefined : adminOpsCheckIdSchema.safeParse(query.checkId);

    if (parsedCheckId !== undefined && !parsedCheckId.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const limit = parseLimit(query.limit);

    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      return c.json(invalidRequestResponse, 400);
    }

    try {
      const recentInput: {
        workspaceId: string;
        limit?: number;
        checkId?: AdminOpsCheckId;
      } = {
        workspaceId: getWorkspaceId(c),
      };

      if (limit !== undefined) {
        recentInput.limit = limit;
      }

      if (parsedCheckId?.data) {
        recentInput.checkId = parsedCheckId.data;
      }

      const recent = await adminOpsService.getRecentChecks({
        ...recentInput,
      });

      return c.json(
        adminOpsRecentChecksResponseSchema.parse({
          success: true,
          data: recent,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.post("/checks/:checkId", async (c) => {
    const query = c.req.query();
    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(query) || hasClientWorkspaceId(body) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedCheckId = adminOpsCheckIdSchema.safeParse(c.req.param("checkId"));

    if (!parsedCheckId.success) {
      return c.json(unknownCheckResponse, 400);
    }

    try {
      const result = await adminOpsService.runCheck({
        workspaceId: getWorkspaceId(c),
        actorUserId: c.get("userId"),
        checkId: parsedCheckId.data,
      });

      return c.json(
        adminOpsRunCheckResponseSchema.parse({
          success: true,
          data: result,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const adminOpsRoutes = createAdminOpsRoutes();
