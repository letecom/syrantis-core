import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  ApiErrorSchema,
  ContactListQuerySchema,
  ContactListSuccessSchema,
  ContactSuccessSchema,
  CreateContactInputSchema,
  UpdateContactInputSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionContactService,
  type ContactService,
  type ContactServiceListResult,
  type ContactServiceMutationResult
} from "../services/contacts.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const contactNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Contact not found.",
  code: "CONTACT_NOT_FOUND"
});

export type ContactRoutesDependencies = {
  authService?: AuthService;
  contactService?: ContactService;
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

function mutationResponse(
  c: Context<AppEnv>,
  result: ContactServiceMutationResult,
  successStatus: ContentfulStatusCode = 200
) {
  if (result.result === "not_found") {
    return c.json(contactNotFoundResponse, 404);
  }

  return c.json(
    ContactSuccessSchema.parse({
      success: true,
      data: result.contact
    }),
    successStatus
  );
}

function listResponse(c: Context<AppEnv>, result: ContactServiceListResult) {
  if (result.result === "not_found") {
    return c.json(contactNotFoundResponse, 404);
  }

  return c.json(
    ContactListSuccessSchema.parse({
      success: true,
      data: result.contacts
    })
  );
}

export function createContactRoutes(dependencies: ContactRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const contactService = dependencies.contactService ?? createProductionContactService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = ContactListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await contactService.listContacts(getWorkspaceId(c), parsedQuery.data);
    return listResponse(c, result);
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = CreateContactInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await contactService.createContact(getWorkspaceId(c), c.get("userId"), parsedBody.data);
    return mutationResponse(c, result, 201);
  });

  routes.get("/:id", async (c) => {
    const contactId = parseId(c.req.param("id"));

    if (!contactId) {
      return c.json(invalidRequestResponse, 400);
    }

    const contact = await contactService.getContact(getWorkspaceId(c), contactId);

    if (!contact) {
      return c.json(contactNotFoundResponse, 404);
    }

    return c.json(
      ContactSuccessSchema.parse({
        success: true,
        data: contact
      })
    );
  });

  routes.patch("/:id", async (c) => {
    const contactId = parseId(c.req.param("id"));

    if (!contactId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = UpdateContactInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const result = await contactService.updateContact(getWorkspaceId(c), c.get("userId"), contactId, parsedBody.data);
    return mutationResponse(c, result);
  });

  return routes;
}

export const contactRoutes = createContactRoutes();
