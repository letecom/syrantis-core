import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  DraftQueueDetailResponseSchema,
  DraftQueueQuerySchema,
  DraftQueueResponseSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionDraftQueueService,
  type DraftQueueDetailResult,
  type DraftQueueService,
} from "../../services/draft-queue.service.js";
import type { AppEnv } from "../../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const draftNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Draft not found.",
  code: "DRAFT_NOT_FOUND",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type ClientDraftQueueRoutesDependencies = {
  authService?: AuthService;
  draftQueueService?: DraftQueueService;
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

function parseDraftId(value: string | undefined): string | null {
  return value && uuidPattern.test(value) ? value : null;
}

function detailResponse(c: Context<AppEnv>, result: DraftQueueDetailResult) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  return c.json(
    DraftQueueDetailResponseSchema.parse({
      success: true,
      data: result.detail,
    }),
  );
}

export function createClientDraftQueueRoutes(
  dependencies: ClientDraftQueueRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const draftQueueService =
    dependencies.draftQueueService ?? createProductionDraftQueueService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedQuery = DraftQueueQuerySchema.safeParse(c.req.query());

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    try {
      const data = await draftQueueService.listDraftQueue(getWorkspaceId(c), parsedQuery.data);

      return c.json(
        DraftQueueResponseSchema.parse({
          success: true,
          data,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.get("/:draftId", async (c) => {
    const draftId = parseDraftId(c.req.param("draftId") ?? c.req.path.split("/").pop());

    if (!draftId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const result = await draftQueueService.getDraftQueueDetail(getWorkspaceId(c), draftId);
      return detailResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const clientDraftQueueRoutes = createClientDraftQueueRoutes();
