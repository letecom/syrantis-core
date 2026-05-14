import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  GmailExportStaleLeaseExpireRequestSchema,
  GmailExportStaleLeaseExpireResponseSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionGmailExportStaleLeaseService,
  type GmailExportStaleLeaseService,
} from "../../services/gmail-export-stale-lease.js";
import type { AppEnv } from "../../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const invalidConfirmResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid Gmail export stale lease confirmation.",
  code: "INVALID_CONFIRMATION",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type GmailExportStaleLeaseRoutesDependencies = {
  authService?: AuthService;
  gmailExportStaleLeaseService?: GmailExportStaleLeaseService;
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

async function readOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
  const text = await c.req.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createGmailExportStaleLeaseRoutes(
  dependencies: GmailExportStaleLeaseRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const gmailExportStaleLeaseService =
    dependencies.gmailExportStaleLeaseService ?? createProductionGmailExportStaleLeaseService();

  routes.use("*", guard);

  routes.post("/stale-leases/expire", async (c) => {
    const body = await readOptionalJsonBody(c);

    if (
      hasForbiddenWorkspaceId(c.req.query()) ||
      hasForbiddenWorkspaceId(body) ||
      hasWorkspaceHeader(c)
    ) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedBody = GmailExportStaleLeaseExpireRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    try {
      const serviceInput: {
        workspaceId: string;
        actorUserId: string;
        dryRun: boolean;
        maxLimit: number;
        confirm?: string;
      } = {
        workspaceId: getWorkspaceId(c),
        actorUserId: c.get("userId"),
        dryRun: parsedBody.data.dryRun,
        maxLimit: parsedBody.data.maxLimit,
      };

      if (parsedBody.data.confirm !== undefined) {
        serviceInput.confirm = parsedBody.data.confirm;
      }

      const result = await gmailExportStaleLeaseService.expireStaleLeases(serviceInput);

      if (result.result === "invalid_confirm") {
        return c.json(invalidConfirmResponse, 400);
      }

      return c.json(
        GmailExportStaleLeaseExpireResponseSchema.parse({
          success: true,
          data: result.data,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const gmailExportStaleLeaseRoutes = createGmailExportStaleLeaseRoutes();
