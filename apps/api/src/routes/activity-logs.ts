import { Hono } from "hono";

import {
  ActivityLogListSuccessSchema,
  ActivityLogQuerySchema,
  ApiErrorSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionActivityLogService,
  type ActivityLogService
} from "../services/activity-logs.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

export type ActivityLogRoutesDependencies = {
  authService?: AuthService;
  activityLogService?: ActivityLogService;
};

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
}

export function createActivityLogRoutes(dependencies: ActivityLogRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const activityLogService = dependencies.activityLogService ?? createProductionActivityLogService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = ActivityLogQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const activityLogs = await activityLogService.listActivityLogs(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      ActivityLogListSuccessSchema.parse({
        success: true,
        data: activityLogs
      })
    );
  });

  return routes;
}

export const activityLogRoutes = createActivityLogRoutes();
