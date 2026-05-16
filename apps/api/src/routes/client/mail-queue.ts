import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  MailQueueDetailResponseSchema,
  MailQueueQuerySchema,
  MailQueueResponseSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionMailQueueService,
  type MailQueueDetailResult,
  type MailQueueService,
} from "../../services/mail-queue.service.js";
import type { AppEnv } from "../../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const mailNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Mail classification not found.",
  code: "MAIL_CLASSIFICATION_NOT_FOUND",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type ClientMailQueueRoutesDependencies = {
  authService?: AuthService;
  mailQueueService?: MailQueueService;
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

function parseClassificationId(value: string | undefined): string | null {
  return value && uuidPattern.test(value) ? value : null;
}

function detailResponse(c: Context<AppEnv>, result: MailQueueDetailResult) {
  if (result.result === "not_found") {
    return c.json(mailNotFoundResponse, 404);
  }

  return c.json(
    MailQueueDetailResponseSchema.parse({
      success: true,
      data: result.detail,
    }),
  );
}

export function createClientMailQueueRoutes(dependencies: ClientMailQueueRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const mailQueueService = dependencies.mailQueueService ?? createProductionMailQueueService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const parsedQuery = MailQueueQuerySchema.safeParse(c.req.query());

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    try {
      const data = await mailQueueService.listMailQueue(getWorkspaceId(c), parsedQuery.data);

      return c.json(
        MailQueueResponseSchema.parse({
          success: true,
          data,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.get("/:classificationId", async (c) => {
    const classificationId = parseClassificationId(
      c.req.param("classificationId") ?? c.req.path.split("/").pop(),
    );

    if (!classificationId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const result = await mailQueueService.getMailQueueDetail(getWorkspaceId(c), classificationId);
      return detailResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const clientMailQueueRoutes = createClientMailQueueRoutes();
