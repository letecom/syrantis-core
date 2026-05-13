import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import {
  ApiErrorSchema,
  CreateLeadInputSchema,
  LeadContactContextSuccessSchema,
  LeadDraftGenerationRequestSuccessSchema,
  LeadListQuerySchema,
  LeadListSuccessSchema,
  LeadScoreStatusSuccessSchema,
  LeadScoreRequestSuccessSchema,
  LeadSuccessSchema,
  UpdateLeadInputSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionLeadScoreService,
  type LeadScoreService,
} from "../services/lead-scores.js";
import {
  createProductionScoringStatusService,
  type ScoringStatusService,
} from "../services/scoring-status.js";
import {
  createProductionLeadDraftGenerationService,
  type LeadDraftGenerationService,
} from "../services/lead-draft-generation.js";
import {
  createProductionLeadContactContextService,
  type LeadContactContextService,
} from "../services/lead-contact-context.js";
import {
  createProductionLeadService,
  type LeadService,
  type LeadServiceListResult,
  type LeadServiceMutationResult,
} from "../services/leads.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const leadNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Lead not found.",
  code: "LEAD_NOT_FOUND",
});

const leadConflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Lead conflict.",
  code: "LEAD_CONFLICT",
});

const LeadScoreHistoryRouteQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
});

export type LeadRoutesDependencies = {
  authService?: AuthService;
  leadService?: LeadService;
  leadScoreService?: LeadScoreService;
  scoringStatusService?: ScoringStatusService;
  leadDraftGenerationService?: LeadDraftGenerationService;
  leadContactContextService?: LeadContactContextService;
};

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
}

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
}

function hasClientTenantMaterial(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasClientTenantMaterial);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(
    ([key, childValue]) =>
      key === "workspaceId" ||
      key === "workspace_id" ||
      key === "workspace-id" ||
      key === "tenantId" ||
      key === "tenant_id" ||
      key === "tenant-id" ||
      hasClientTenantMaterial(childValue),
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

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function parseId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function listResponse(c: Context<AppEnv>, result: LeadServiceListResult) {
  if (result.result === "not_found") {
    return c.json(leadNotFoundResponse, 404);
  }

  return c.json(
    LeadListSuccessSchema.parse({
      success: true,
      data: result.leads,
    }),
  );
}

function mutationResponse(
  c: Context<AppEnv>,
  result: LeadServiceMutationResult,
  successStatus: ContentfulStatusCode = 200,
) {
  if (result.result === "not_found") {
    return c.json(leadNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(leadConflictResponse, 409);
  }

  return c.json(
    LeadSuccessSchema.parse({
      success: true,
      data: result.lead,
    }),
    successStatus,
  );
}

export function createLeadRoutes(dependencies: LeadRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const leadService = dependencies.leadService ?? createProductionLeadService();
  const leadScoreService = dependencies.leadScoreService ?? createProductionLeadScoreService();
  const scoringStatusService =
    dependencies.scoringStatusService ?? createProductionScoringStatusService();
  const leadDraftGenerationService =
    dependencies.leadDraftGenerationService ?? createProductionLeadDraftGenerationService();
  const leadContactContextService =
    dependencies.leadContactContextService ?? createProductionLeadContactContextService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = LeadListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadService.listLeads(getWorkspaceId(c), parsedQuery.data);
    return listResponse(c, result);
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = CreateLeadInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadService.createLead(
      getWorkspaceId(c),
      c.get("userId"),
      parsedBody.data,
    );
    return mutationResponse(c, result, 201);
  });

  routes.post("/:id/score", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (body && typeof body === "object" && Object.keys(body).length > 0) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadService.requestLeadScore(getWorkspaceId(c), c.get("userId"), leadId);

    if (result.result === "not_found") {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json(
      LeadScoreRequestSuccessSchema.parse({
        success: true,
        data: {
          jobId: result.jobId,
          leadId: result.leadId,
        },
      }),
      202,
    );
  });

  routes.post("/:id/generate-draft", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId) {
      return c.json(invalidRequestResponse, 400);
    }

    if (hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (body && typeof body === "object" && Object.keys(body).length > 0) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadDraftGenerationService.requestLeadDraftGeneration(
      getWorkspaceId(c),
      c.get("userId"),
      leadId,
    );

    if (result.result === "not_found") {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json(
      LeadDraftGenerationRequestSuccessSchema.parse({
        success: true,
        data: {
          jobId: result.jobId,
          leadId: result.leadId,
        },
      }),
      202,
    );
  });

  routes.get("/:id/score", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadScoreService.getLatestLeadScore(getWorkspaceId(c), leadId);

    if (result.result === "not_found") {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json({
      success: true,
      data: result.score,
    });
  });

  routes.get("/:id/score-status", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const result = await scoringStatusService.getStatus(getWorkspaceId(c), leadId);

    if (result.result === "not_found") {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json(
      LeadScoreStatusSuccessSchema.parse({
        success: true,
        data: result.status,
      }),
    );
  });

  routes.get("/:id/contact-context", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId || hasClientTenantMaterial(c.req.query()) || hasWorkspaceHeader(c)) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const result = await leadContactContextService.getContactContext(getWorkspaceId(c), leadId);

    if (result.result === "not_found") {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json(
      LeadContactContextSuccessSchema.parse({
        success: true,
        data: result.context,
      }),
    );
  });

  routes.get("/:id/scores", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = LeadScoreHistoryRouteQuerySchema.safeParse(c.req.query());

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadScoreService.listLeadScores(
      getWorkspaceId(c),
      leadId,
      parsedQuery.data,
    );

    if (result.result === "not_found") {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json({
      success: true,
      data: result.scores,
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    });
  });

  routes.get("/:id", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId) {
      return c.json(invalidRequestResponse, 400);
    }

    const lead = await leadService.getLead(getWorkspaceId(c), leadId);

    if (!lead) {
      return c.json(leadNotFoundResponse, 404);
    }

    return c.json(
      LeadSuccessSchema.parse({
        success: true,
        data: lead,
      }),
    );
  });

  routes.patch("/:id", async (c) => {
    const leadId = parseId(c.req.param("id"));

    if (!leadId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = UpdateLeadInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await leadService.updateLead(
      getWorkspaceId(c),
      c.get("userId"),
      leadId,
      parsedBody.data,
    );
    return mutationResponse(c, result);
  });

  return routes;
}

export const leadRoutes = createLeadRoutes();
