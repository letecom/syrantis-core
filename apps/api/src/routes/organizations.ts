import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  CreateOrganizationInputSchema,
  OrganizationListQuerySchema,
  OrganizationListSuccessSchema,
  OrganizationSuccessSchema,
  UpdateOrganizationInputSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionOrganizationService,
  type OrganizationService,
  type OrganizationServiceMutationResult
} from "../services/organizations.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const organizationNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Organization not found.",
  code: "ORGANIZATION_NOT_FOUND"
});

const organizationConflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Organization conflict.",
  code: "ORGANIZATION_CONFLICT"
});

export type OrganizationRoutesDependencies = {
  authService?: AuthService;
  organizationService?: OrganizationService;
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
  result: OrganizationServiceMutationResult,
  successStatus: ContentfulStatusCode = 200
) {
  if (result.result === "not_found") {
    return c.json(organizationNotFoundResponse, 404);
  }

  if (result.result === "conflict") {
    return c.json(organizationConflictResponse, 409);
  }

  return c.json(
    OrganizationSuccessSchema.parse({
      success: true,
      data: result.organization
    }),
    successStatus
  );
}

export function createOrganizationRoutes(dependencies: OrganizationRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const organizationService = dependencies.organizationService ?? createProductionOrganizationService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = OrganizationListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const organizations = await organizationService.listOrganizations(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      OrganizationListSuccessSchema.parse({
        success: true,
        data: organizations
      })
    );
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = CreateOrganizationInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await organizationService.createOrganization(getWorkspaceId(c), c.get("userId"), parsedBody.data);
    return mutationResponse(c, result, 201);
  });

  routes.get("/:id", async (c) => {
    const organizationId = parseId(c.req.param("id"));

    if (!organizationId) {
      return c.json(invalidRequestResponse, 400);
    }

    const organization = await organizationService.getOrganization(getWorkspaceId(c), organizationId);

    if (!organization) {
      return c.json(organizationNotFoundResponse, 404);
    }

    return c.json(
      OrganizationSuccessSchema.parse({
        success: true,
        data: organization
      })
    );
  });

  routes.patch("/:id", async (c) => {
    const organizationId = parseId(c.req.param("id"));

    if (!organizationId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = UpdateOrganizationInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await organizationService.updateOrganization(
      getWorkspaceId(c),
      c.get("userId"),
      organizationId,
      parsedBody.data
    );
    return mutationResponse(c, result);
  });

  routes.post("/:id/archive", async (c) => {
    const organizationId = parseId(c.req.param("id"));

    if (!organizationId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readOptionalJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await organizationService.archiveOrganization(getWorkspaceId(c), c.get("userId"), organizationId);
    return mutationResponse(c, result);
  });

  return routes;
}

export const organizationRoutes = createOrganizationRoutes();
