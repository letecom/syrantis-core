import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  ApprovalListQuerySchema,
  ApprovalListSuccessSchema,
  ApprovalSuccessSchema,
  CreateApprovalInputSchema,
  RejectApprovalInputSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionApprovalService,
  type ApprovalService,
  type ApprovalServiceMutationResult
} from "../services/approvals.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const approvalNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Approval not found.",
  code: "APPROVAL_NOT_FOUND"
});

const approvalNotPendingResponse = ApiErrorSchema.parse({
  success: false,
  error: "Approval is not pending.",
  code: "APPROVAL_NOT_PENDING"
});

export type ApprovalRoutesDependencies = {
  authService?: AuthService;
  approvalService?: ApprovalService;
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

function parseId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function mutationResponse(
  c: Context<AppEnv>,
  result: ApprovalServiceMutationResult,
  successStatus: ContentfulStatusCode = 200
) {
  if (result.result === "not_found") {
    return c.json(approvalNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(approvalNotPendingResponse, 409);
  }

  return c.json(
    ApprovalSuccessSchema.parse({
      success: true,
      data: result.approval
    }),
    successStatus
  );
}

export function createApprovalRoutes(dependencies: ApprovalRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const approvalService = dependencies.approvalService ?? createProductionApprovalService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = ApprovalListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const approvals = await approvalService.listApprovals(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      ApprovalListSuccessSchema.parse({
        success: true,
        data: approvals
      })
    );
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = CreateApprovalInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await approvalService.createApproval(getWorkspaceId(c), c.get("userId"), parsedBody.data);
    return mutationResponse(c, result, 201);
  });

  routes.get("/:id", async (c) => {
    const approvalId = parseId(c.req.param("id"));

    if (!approvalId) {
      return c.json(invalidRequestResponse, 400);
    }

    const approval = await approvalService.getApproval(getWorkspaceId(c), approvalId);

    if (!approval) {
      return c.json(approvalNotFoundResponse, 404);
    }

    return c.json(
      ApprovalSuccessSchema.parse({
        success: true,
        data: approval
      })
    );
  });

  routes.post("/:id/approve", async (c) => {
    const approvalId = parseId(c.req.param("id"));

    if (!approvalId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await approvalService.approveApproval(getWorkspaceId(c), c.get("userId"), approvalId);
    return mutationResponse(c, result);
  });

  routes.post("/:id/reject", async (c) => {
    const approvalId = parseId(c.req.param("id"));

    if (!approvalId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = RejectApprovalInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await approvalService.rejectApproval(getWorkspaceId(c), c.get("userId"), approvalId, parsedBody.data);
    return mutationResponse(c, result);
  });

  return routes;
}

export const approvalRoutes = createApprovalRoutes();
