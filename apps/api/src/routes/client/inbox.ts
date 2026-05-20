import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  ClientInboxDraftEditInputSchema,
  ClientInboxDraftEditResponseSchema,
  ClientInboxMessageDetailResponseSchema,
  ClientInboxMessagesResponseSchema,
  ClientInboxQuerySchema,
  GmailExportCancelResponseSchema,
  GmailExportRequestResponseSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../../middleware/tenant.js";
import type { AuthService } from "../../services/auth.js";
import {
  createProductionClientInboxService,
  type ClientInboxDetailResult,
  type ClientInboxDraftEditServiceResult,
  type ClientInboxGmailExportActionResult,
  type ClientInboxService,
} from "../../services/client-inbox.service.js";
import type {
  GmailExportCancelServiceResult,
  GmailExportRequestServiceResult,
} from "../../services/gmail-export-request.js";
import type { AppEnv } from "../../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const messageNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Inbox message not found.",
  code: "CLIENT_INBOX_MESSAGE_NOT_FOUND",
});

const draftNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Inbox message has no editable draft.",
  code: "CLIENT_INBOX_DRAFT_NOT_FOUND",
});

const internalServerErrorResponse = ApiErrorSchema.parse({
  success: false,
  error: "Internal server error.",
  code: "INTERNAL_SERVER_ERROR",
});

export type ClientInboxRoutesDependencies = {
  authService?: AuthService;
  clientInboxService?: ClientInboxService;
};

function canAccessClientInbox(role: string): boolean {
  return role === "client" || role === "admin" || role === "founder";
}

function requireClientInboxAccess(c: Context<AppEnv>) {
  if (!canAccessClientInbox(c.get("currentUser").role)) {
    return c.json(forbidden("CLIENT_INBOX_ACCESS_REQUIRED"), 403);
  }

  return null;
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

function parseMailItemId(value: string | undefined): string | null {
  return value && uuidPattern.test(value) ? value : null;
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
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

function detailResponse(c: Context<AppEnv>, result: ClientInboxDetailResult) {
  if (result.result === "not_found") {
    return c.json(messageNotFoundResponse, 404);
  }

  return c.json(
    ClientInboxMessageDetailResponseSchema.parse({
      success: true,
      data: result.detail,
    }),
  );
}

function draftEditResponse(c: Context<AppEnv>, result: ClientInboxDraftEditServiceResult) {
  if (result.result === "not_found") {
    return c.json(messageNotFoundResponse, 404);
  }

  if (result.result === "no_draft") {
    return c.json(draftNotFoundResponse, 409);
  }

  return c.json(
    ClientInboxDraftEditResponseSchema.parse({
      success: true,
      data: result.data,
    }),
  );
}

function requestConflictResponse(result: { code: string }) {
  return ApiErrorSchema.parse({
    success: false,
    error: "Gmail export request conflict.",
    code: result.code,
  });
}

function gmailRequestResponse(c: Context<AppEnv>, result: ClientInboxGmailExportActionResult) {
  if (result.result === "not_found") {
    return c.json(messageNotFoundResponse, 404);
  }

  if (result.result === "no_draft") {
    return c.json(draftNotFoundResponse, 409);
  }

  if (result.result === "conflict") {
    return c.json(requestConflictResponse(result), 409);
  }

  return c.json(
    GmailExportRequestResponseSchema.parse({
      success: true,
      data: (result as GmailExportRequestServiceResult & { result: "ok" }).data,
    }),
  );
}

function gmailCancelResponse(c: Context<AppEnv>, result: ClientInboxGmailExportActionResult) {
  if (result.result === "not_found") {
    return c.json(messageNotFoundResponse, 404);
  }

  if (result.result === "no_draft") {
    return c.json(draftNotFoundResponse, 409);
  }

  if (result.result === "conflict") {
    return c.json(requestConflictResponse(result), 409);
  }

  return c.json(
    GmailExportCancelResponseSchema.parse({
      success: true,
      data: (result as GmailExportCancelServiceResult & { result: "ok" }).data,
    }),
  );
}

export function createClientInboxRoutes(dependencies: ClientInboxRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const clientInboxService =
    dependencies.clientInboxService ?? createProductionClientInboxService();

  routes.use("*", guard);

  routes.get("/messages", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const accessDenied = requireClientInboxAccess(c);

    if (accessDenied) {
      return accessDenied;
    }

    const parsedQuery = ClientInboxQuerySchema.safeParse(c.req.query());

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    try {
      const data = await clientInboxService.listMessages(getWorkspaceId(c), parsedQuery.data);

      return c.json(
        ClientInboxMessagesResponseSchema.parse({
          success: true,
          data,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.patch("/messages/:mailItemId/draft", async (c) => {
    const mailItemId = parseMailItemId(c.req.param("mailItemId"));

    if (!mailItemId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const accessDenied = requireClientInboxAccess(c);

    if (accessDenied) {
      return accessDenied;
    }

    const body = await readJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = ClientInboxDraftEditInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    try {
      const result = await clientInboxService.updateDraft(
        getWorkspaceId(c),
        c.get("userId"),
        mailItemId,
        parsedBody.data,
      );

      return draftEditResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.post("/messages/:mailItemId/gmail-export-request", async (c) => {
    const mailItemId = parseMailItemId(c.req.param("mailItemId"));

    if (!mailItemId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const accessDenied = requireClientInboxAccess(c);

    if (accessDenied) {
      return accessDenied;
    }

    try {
      const result = await clientInboxService.requestGmailExport(
        getWorkspaceId(c),
        c.get("userId"),
        mailItemId,
      );

      return gmailRequestResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.post("/messages/:mailItemId/gmail-export-cancel", async (c) => {
    const mailItemId = parseMailItemId(c.req.param("mailItemId"));

    if (!mailItemId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const accessDenied = requireClientInboxAccess(c);

    if (accessDenied) {
      return accessDenied;
    }

    try {
      const result = await clientInboxService.cancelGmailExport(
        getWorkspaceId(c),
        c.get("userId"),
        mailItemId,
      );

      return gmailCancelResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.get("/messages/:mailItemId", async (c) => {
    const mailItemId = parseMailItemId(c.req.param("mailItemId"));

    if (!mailItemId || hasForbiddenWorkspaceId(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    const accessDenied = requireClientInboxAccess(c);

    if (accessDenied) {
      return accessDenied;
    }

    try {
      const result = await clientInboxService.getMessageDetail(getWorkspaceId(c), mailItemId);
      return detailResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const clientInboxRoutes = createClientInboxRoutes();
