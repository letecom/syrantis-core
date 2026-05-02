import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  PublicLeadIntakeInputSchema,
  PublicLeadIntakeSuccessSchema
} from "@syrantis/shared";

import {
  createProductionPublicLeadIntakeService,
  type PublicLeadIntakeService,
  type PublicLeadIntakeServiceResult
} from "../services/public-lead-intake.js";
import type { AppEnv } from "../types/hono.js";

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const unauthorizedResponse = ApiErrorSchema.parse({
  success: false,
  error: "Unauthorized.",
  code: "UNAUTHORIZED"
});

const notFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Resource not found.",
  code: "NOT_FOUND"
});

const conflictResponse = ApiErrorSchema.parse({
  success: false,
  error: "Conflict.",
  code: "CONFLICT"
});

export type PublicLeadRoutesDependencies = {
  publicLeadIntakeService?: PublicLeadIntakeService;
};

function hasForbiddenWorkspaceId(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenWorkspaceId);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(([key, childValue]) => key === "workspaceId" || hasForbiddenWorkspaceId(childValue));
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function intakeResponse(c: Context<AppEnv>, result: PublicLeadIntakeServiceResult) {
  switch (result.result) {
    case "unauthorized":
      return c.json(unauthorizedResponse, 401);
    case "invalid_request":
      return c.json(invalidRequestResponse, 422);
    case "not_found":
      return c.json(notFoundResponse, 404);
    case "conflict":
      return c.json(conflictResponse, 409);
    case "idempotent_replay":
      return c.json(
        PublicLeadIntakeSuccessSchema.parse({
          success: true,
          data: {
            id: result.leadId,
            status: "idempotent_replay"
          }
        }),
        200
      );
    case "created":
      return c.json(
        PublicLeadIntakeSuccessSchema.parse({
          success: true,
          data: {
            id: result.leadId,
            status: "created"
          }
        }),
        201
      );
  }
}

export function createPublicLeadRoutes(dependencies: PublicLeadRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const publicLeadIntakeService =
    dependencies.publicLeadIntakeService ?? createProductionPublicLeadIntakeService();

  routes.post("/", async (c) => {
    if (hasForbiddenWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasForbiddenWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = PublicLeadIntakeInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 422);
    }

    const result = await publicLeadIntakeService.receivePublicLead({
      authorizationHeader: c.req.header("authorization") ?? null,
      idempotencyKey: c.req.header("idempotency-key") ?? null,
      payload: parsedBody.data
    });

    return intakeResponse(c, result);
  });

  return routes;
}

export const publicLeadRoutes = createPublicLeadRoutes();
