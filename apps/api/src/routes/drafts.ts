import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  CreateDraftInputSchema,
  DraftApprovalRequestSuccessSchema,
  DraftListQuerySchema,
  DraftListSuccessSchema,
  DraftSuccessSchema,
  RequestDraftApprovalInputSchema,
  UpdateDraftInputSchema,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionDraftService,
  type DraftApprovalRequestServiceResult,
  type DraftService,
  type DraftServiceMutationResult,
} from "../services/drafts.js";
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

const draftApprovalConflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Draft cannot request approval.",
  code: "DRAFT_APPROVAL_CONFLICT",
});

export type DraftRoutesDependencies = {
  authService?: AuthService;
  draftService?: DraftService;
};

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

async function readOptionalJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}

function parseDraftId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function mutationResponse(
  c: Context<AppEnv>,
  result: DraftServiceMutationResult,
  successStatus: ContentfulStatusCode = 200,
) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  if (result.result === "invalid_relation") {
    return c.json(invalidRequestResponse, 400);
  }

  if (result.result === "conflict") {
    return c.json(draftApprovalConflictResponse, 409);
  }

  return c.json(
    DraftSuccessSchema.parse({
      success: true,
      data: result.draft,
    }),
    successStatus,
  );
}

function approvalRequestResponse(c: Context<AppEnv>, result: DraftApprovalRequestServiceResult) {
  if (result.result === "not_found") {
    return c.json(draftNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(draftApprovalConflictResponse, 409);
  }

  return c.json(
    DraftApprovalRequestSuccessSchema.parse({
      success: true,
      data: {
        draft: result.draft,
        approval: result.approval,
      },
    }),
    201,
  );
}

export function createDraftRoutes(dependencies: DraftRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const draftService = dependencies.draftService ?? createProductionDraftService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = DraftListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const drafts = await draftService.listDrafts(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      DraftListSuccessSchema.parse({
        success: true,
        data: drafts,
      }),
    );
  });

  routes.post("/", async (c) => {
    if (hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = CreateDraftInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await draftService.createDraft(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data,
    );
    return mutationResponse(c, result, 201);
  });

  routes.get("/:id", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const draft = await draftService.getDraft(getWorkspaceId(c), draftId);

    if (!draft) {
      return c.json(draftNotFoundResponse, 404);
    }

    return c.json(
      DraftSuccessSchema.parse({
        success: true,
        data: draft,
      }),
    );
  });

  routes.patch("/:id", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = UpdateDraftInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await draftService.updateDraft(
      getWorkspaceId(c),
      c.get("userId"),
      draftId,
      parsedBody.data,
    );
    return mutationResponse(c, result);
  });

  routes.post("/:id/archive", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await draftService.archiveDraft(getWorkspaceId(c), c.get("userId"), draftId);
    return mutationResponse(c, result);
  });

  routes.post("/:id/request-approval", async (c) => {
    const draftId = parseDraftId(c.req.param("id"));

    if (!draftId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = RequestDraftApprovalInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await draftService.requestApproval(
      getWorkspaceId(c),
      c.get("userId"),
      draftId,
      parsedBody.data,
    );
    return approvalRequestResponse(c, result);
  });

  return routes;
}

export const draftRoutes = createDraftRoutes();
