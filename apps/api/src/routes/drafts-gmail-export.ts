import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  GmailExportConfirmBodySchema,
  GmailExportConfirmResponseSchema,
  GmailExportPendingQuerySchema,
  GmailExportPendingResponseSchema,
} from "@syrantis/shared";

import type { PublicApiKeyLookupRow } from "../repositories/public-lead-intake.js";
import {
  createProductionGmailExportConfirmService,
  type GmailExportConfirmService,
  type GmailExportConfirmServiceResult,
} from "../services/gmail-export-confirm.js";
import {
  createProductionGmailExportPendingService,
  type GmailExportPendingService,
} from "../services/gmail-export-pending.js";
import { authenticateWorkspaceApiKey } from "../services/public-api-key-auth.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const unauthorizedResponse = ApiErrorSchema.parse({
  success: false,
  error: "Unauthorized.",
  code: "UNAUTHORIZED",
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

export type DraftGmailExportRoutesDependencies = {
  authenticateApiKey?: (authorizationHeader?: string | null) => Promise<PublicApiKeyLookupRow | null>;
  gmailExportPendingService?: GmailExportPendingService;
  gmailExportConfirmService?: GmailExportConfirmService;
};

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
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

function hasCredentialQuery(value: Record<string, string | string[]>): boolean {
  return Object.keys(value).some((key) =>
    ["apiKey", "api_key", "token", "authorization", "bearer"].includes(key),
  );
}

function parseDraftId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function conflictResponse(result: Extract<GmailExportConfirmServiceResult, { result: "conflict" }>) {
  return ApiErrorSchema.parse({
    success: false,
    error: "Gmail export lease conflict.",
    code: result.code,
  });
}

function confirmResponse(c: Context<AppEnv>, result: GmailExportConfirmServiceResult) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(conflictResponse(result), 409);
  }

  return c.json(
    GmailExportConfirmResponseSchema.parse({
      success: true,
      data: result.data,
    }),
  );
}

export function createDraftGmailExportRoutes(
  dependencies: DraftGmailExportRoutesDependencies = {},
) {
  const routes = new Hono<AppEnv>();
  const authenticateApiKey = dependencies.authenticateApiKey ?? authenticateWorkspaceApiKey;
  const gmailExportPendingService =
    dependencies.gmailExportPendingService ?? createProductionGmailExportPendingService();
  const gmailExportConfirmService =
    dependencies.gmailExportConfirmService ?? createProductionGmailExportConfirmService();

  routes.get("/gmail-export-pending", async (c) => {
    const query = c.req.query();

    if (hasForbiddenWorkspaceId(query) || hasWorkspaceHeader(c) || hasCredentialQuery(query)) {
      return c.json(invalidRequestResponse, 422);
    }

    try {
      const apiKey = await authenticateApiKey(c.req.header("authorization") ?? null);

      if (!apiKey) {
        return c.json(unauthorizedResponse, 401);
      }

      const parsedQuery = GmailExportPendingQuerySchema.safeParse(query);

      if (!parsedQuery.success) {
        return c.json(invalidRequestResponse, 422);
      }

      const drafts = await gmailExportPendingService.getPendingGmailExports(
        apiKey.workspaceId,
        parsedQuery.data,
      );

      return c.json(
        GmailExportPendingResponseSchema.parse({
          success: true,
          data: drafts,
        }),
      );
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  routes.post("/:id/gmail-export-confirmed", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    const query = c.req.query();

    if (
      !draftId ||
      hasForbiddenWorkspaceId(query) ||
      hasWorkspaceHeader(c) ||
      hasCredentialQuery(query)
    ) {
      return c.json(invalidRequestResponse, 422);
    }

    try {
      const apiKey = await authenticateApiKey(c.req.header("authorization") ?? null);

      if (!apiKey) {
        return c.json(unauthorizedResponse, 401);
      }

      const body = await readJsonBody(c);

      if (hasForbiddenWorkspaceId(body)) {
        return c.json(invalidRequestResponse, 422);
      }

      const parsedBody = GmailExportConfirmBodySchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(invalidRequestResponse, 422);
      }

      const result = await gmailExportConfirmService.confirmGmailExport(
        apiKey.workspaceId,
        draftId,
        parsedBody.data.leaseToken,
      );

      return confirmResponse(c, result);
    } catch {
      return c.json(internalServerErrorResponse, 500);
    }
  });

  return routes;
}

export const draftGmailExportRoutes = createDraftGmailExportRoutes();
