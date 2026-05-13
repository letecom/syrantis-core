import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  GmailExportCancelResponseSchema,
  GmailExportRequestResponseSchema,
  GmailExportStatusSuccessSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionGmailExportStatusService,
  type GmailExportStatusService,
  type GmailExportStatusServiceResult,
} from "../services/gmail-export-status.js";
import {
  createProductionGmailExportRequestService,
  type GmailExportCancelServiceResult,
  type GmailExportRequestService,
  type GmailExportRequestServiceResult,
} from "../services/gmail-export-request.js";
import type { AppEnv } from "../types/hono.js";

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

export type DraftGmailExportStatusRoutesDependencies = {
  authService?: AuthService;
  gmailExportStatusService?: GmailExportStatusService;
  gmailExportRequestService?: GmailExportRequestService;
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

function parseDraftId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function gmailExportStatusResponse(c: Context<AppEnv>, result: GmailExportStatusServiceResult) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  return c.json(
    GmailExportStatusSuccessSchema.parse({
      success: true,
      data: result.status,
    }),
  );
}

async function readOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
  const text = await c.req.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function requestConflictResponse(result: { code: string }) {
  return ApiErrorSchema.parse({
    success: false,
    error: "Gmail export request conflict.",
    code: result.code,
  });
}

function gmailExportRequestResponse(c: Context<AppEnv>, result: GmailExportRequestServiceResult) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(requestConflictResponse(result), 409);
  }

  return c.json(
    GmailExportRequestResponseSchema.parse({
      success: true,
      data: result.data,
    }),
  );
}

function gmailExportCancelResponse(c: Context<AppEnv>, result: GmailExportCancelServiceResult) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(requestConflictResponse(result), 409);
  }

  return c.json(
    GmailExportCancelResponseSchema.parse({
      success: true,
      data: result.data,
    }),
  );
}

export function createDraftGmailExportStatusRoutes(
  dependencies: DraftGmailExportStatusRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const gmailExportStatusService =
    dependencies.gmailExportStatusService ?? createProductionGmailExportStatusService();
  const gmailExportRequestService =
    dependencies.gmailExportRequestService ?? createProductionGmailExportRequestService();

  routes.use("*", guard);

  routes.get("/:id/gmail-export-status", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const result = await gmailExportStatusService.getGmailExportStatus(
        getWorkspaceId(c),
        draftId,
      );
      return gmailExportStatusResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.post("/:id/gmail-export-request", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const result = await gmailExportRequestService.requestGmailExport(
        getWorkspaceId(c),
        c.get("userId"),
        draftId,
      );
      return gmailExportRequestResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.post("/:id/gmail-export-cancel", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    try {
      const result = await gmailExportRequestService.cancelGmailExport(
        getWorkspaceId(c),
        c.get("userId"),
        draftId,
      );
      return gmailExportCancelResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const draftGmailExportStatusRoutes = createDraftGmailExportStatusRoutes();
