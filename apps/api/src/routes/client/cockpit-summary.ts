import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  ClientCockpitSummaryResponseSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionClientCockpitSummaryService,
  type ClientCockpitSummaryService,
} from "../../services/client-cockpit-summary.js";
import type { AppEnv } from "../../types/hono.js";

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type ClientCockpitSummaryRoutesDependencies = {
  authService?: AuthService;
  clientCockpitSummaryService?: ClientCockpitSummaryService;
};

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
}

export function createClientCockpitSummaryRoutes(
  dependencies: ClientCockpitSummaryRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const clientCockpitSummaryService =
    dependencies.clientCockpitSummaryService ?? createProductionClientCockpitSummaryService();

  routes.use("*", guard);

  routes.get("/", async (c: Context<AppEnv>) => {
    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const summary = await clientCockpitSummaryService.getSummary(getWorkspaceId(c));

      return c.json(
        ClientCockpitSummaryResponseSchema.parse({
          success: true,
          data: summary,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const clientCockpitSummaryRoutes = createClientCockpitSummaryRoutes();
