import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  CreateLeadInputSchema,
  LeadListQuerySchema,
  LeadListSuccessSchema,
  LeadScoreRequestSuccessSchema,
  LeadSuccessSchema,
  UpdateLeadInputSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionLeadService,
  type LeadService,
  type LeadServiceListResult,
  type LeadServiceMutationResult
} from "../services/leads.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const leadNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Lead not found.",
  code: "LEAD_NOT_FOUND"
});

const leadConflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Lead conflict.",
  code: "LEAD_CONFLICT"
});

export type LeadRoutesDependencies = {
  authService?: AuthService;
  leadService?: LeadService;
};

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
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
      data: result.leads
    })
  );
}

function mutationResponse(
  c: Context<AppEnv>,
  result: LeadServiceMutationResult,
  successStatus: ContentfulStatusCode = 200
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
      data: result.lead
    }),
    successStatus
  );
}

export function createLeadRoutes(dependencies: LeadRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const leadService = dependencies.leadService ?? createProductionLeadService();

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

    const result = await leadService.createLead(getWorkspaceId(c), c.get("userId"), parsedBody.data);
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
          leadId: result.leadId
        }
      }),
      202
    );
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
        data: lead
      })
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

    const result = await leadService.updateLead(getWorkspaceId(c), c.get("userId"), leadId, parsedBody.data);
    return mutationResponse(c, result);
  });

  return routes;
}

export const leadRoutes = createLeadRoutes();
