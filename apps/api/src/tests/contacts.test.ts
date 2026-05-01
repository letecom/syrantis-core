import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ContactListQuery,
  ContactOutput,
  CreateContactInput,
  UpdateContactInput
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as contactRepository from "../repositories/contacts.js";
import { createContactRoutes } from "../routes/contacts.js";
import type {
  ContactService,
  ContactServiceListResult,
  ContactServiceMutationResult
} from "../services/contacts.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { otherWorkspaceId } from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockDb.tx))
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000899" }))
}));

const currentWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000701";
const otherWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000702";
const missingOrganizationId = "00000000-0000-4000-8000-000000000799";
const currentWorkspaceContactId = "00000000-0000-4000-8000-000000000801";
const otherWorkspaceContactId = "00000000-0000-4000-8000-000000000802";
const createdContactId = "00000000-0000-4000-8000-000000000803";

const currentWorkspaceContact: ContactOutput = {
  id: currentWorkspaceContactId,
  workspaceId: testUser.workspaceId,
  organizationId: currentWorkspaceOrganizationId,
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean@dupont.example",
  phone: "+33123456789",
  roleTitle: "Owner",
  optOut: false,
  metadata: { source: "test" },
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z"
};

const otherWorkspaceContact: ContactOutput = {
  ...currentWorkspaceContact,
  id: otherWorkspaceContactId,
  workspaceId: otherWorkspaceId,
  organizationId: otherWorkspaceOrganizationId,
  email: "other@example.com",
  metadata: {}
};

let mockTx: ReturnType<typeof createMockTx>;

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(async () => response),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject)
  };

  return builder;
}

function createMockTx() {
  const state = {
    selectResponses: [] as unknown[][],
    insertResponse: null as unknown,
    updateResponse: null as unknown
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => (state.insertResponse ? [state.insertResponse] : []))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => (state.updateResponse ? [state.updateResponse] : []))
        }))
      }))
    }))
  };
}

function createTestApp(contactService: ContactService): Hono {
  const app = new Hono();

  app.route(
    "/api/contacts",
    createContactRoutes({
      authService: createFakeAuthService(),
      contactService
    })
  );

  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`
  };
}

function jsonHeaders() {
  return {
    ...validSessionHeaders(),
    "content-type": "application/json"
  };
}

function createFakeContactService(): ContactService {
  const contacts = new Map<string, ContactOutput>([
    [currentWorkspaceContact.id, currentWorkspaceContact],
    [otherWorkspaceContact.id, otherWorkspaceContact]
  ]);
  const workspaceOrganizations = new Set([currentWorkspaceOrganizationId]);

  function mutationOk(contact: ContactOutput): ContactServiceMutationResult {
    return { result: "ok", contact };
  }

  return {
    listContacts: vi.fn(async (workspaceId: string, query: ContactListQuery) => {
      if (query.organizationId && !workspaceOrganizations.has(query.organizationId)) {
        return { result: "not_found" } satisfies ContactServiceListResult;
      }

      return {
        result: "ok",
        contacts: [...contacts.values()].filter((contact) => {
          if (contact.workspaceId !== workspaceId) {
            return false;
          }

          if (query.organizationId && contact.organizationId !== query.organizationId) {
            return false;
          }

          return true;
        })
      } satisfies ContactServiceListResult;
    }),

    getContact: vi.fn(async (workspaceId: string, id: string) => {
      const contact = contacts.get(id);
      return contact?.workspaceId === workspaceId ? contact : null;
    }),

    createContact: vi.fn(async (workspaceId: string, _actorUserId: string, input: CreateContactInput) => {
      if (input.organizationId && !workspaceOrganizations.has(input.organizationId)) {
        return { result: "not_found" } satisfies ContactServiceMutationResult;
      }

      const contact: ContactOutput = {
        id: createdContactId,
        workspaceId,
        organizationId: input.organizationId ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        roleTitle: input.roleTitle ?? null,
        optOut: input.optOut ?? false,
        metadata: input.metadata ?? {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      };

      contacts.set(contact.id, contact);
      return mutationOk(contact);
    }),

    updateContact: vi.fn(async (workspaceId: string, _actorUserId: string, id: string, input: UpdateContactInput) => {
      if (input.organizationId && !workspaceOrganizations.has(input.organizationId)) {
        return { result: "not_found" } satisfies ContactServiceMutationResult;
      }

      const contact = contacts.get(id);

      if (!contact || contact.workspaceId !== workspaceId) {
        return { result: "not_found" } satisfies ContactServiceMutationResult;
      }

      const updatedContact: ContactOutput = {
        ...contact,
        ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.roleTitle !== undefined ? { roleTitle: input.roleTitle } : {}),
        ...(input.optOut !== undefined ? { optOut: input.optOut } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        updatedAt: "2026-04-30T13:00:00.000Z"
      };

      contacts.set(id, updatedContact);
      return mutationOk(updatedContact);
    })
  };
}

describe("contact routes", () => {
  it("returns 401 for GET /api/contacts without session", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request("/api/contacts");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("creates a contact with normalized email", async () => {
    const contactService = createFakeContactService();
    const app = createTestApp(contactService);

    const response = await app.request("/api/contacts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        firstName: "Marie",
        email: "MARIE@EXAMPLE.COM",
        phone: "+33111111111"
      })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: createdContactId,
        workspaceId: testUser.workspaceId,
        organizationId: null,
        firstName: "Marie",
        lastName: null,
        email: "marie@example.com",
        phone: "+33111111111",
        roleTitle: null,
        optOut: false,
        metadata: {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
    expect(contactService.createContact).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ email: "marie@example.com" })
    );
  });

  it("creates a contact linked to an organization", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request("/api/contacts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        organizationId: currentWorkspaceOrganizationId,
        lastName: "Martin",
        email: "martin@example.com"
      })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        organizationId: currentWorkspaceOrganizationId,
        lastName: "Martin",
        email: "martin@example.com"
      })
    });
  });

  it("returns 404 when creating a contact for a missing or cross-workspace organization", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request("/api/contacts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        organizationId: missingOrganizationId,
        email: "missing-org@example.com"
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Contact not found.",
      code: "CONTACT_NOT_FOUND"
    });
  });

  it("rejects workspaceId in POST body", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request("/api/contacts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        email: "forbidden@example.com"
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("lists only current workspace contacts", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request("/api/contacts", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceContact]
    });
  });

  it("lists contacts filtered by organizationId", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request(`/api/contacts?organizationId=${currentWorkspaceOrganizationId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceContact]
    });
  });

  it("returns a current workspace contact by id", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request(`/api/contacts/${currentWorkspaceContactId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: currentWorkspaceContact
    });
  });

  it("updates a current workspace contact", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request(`/api/contacts/${currentWorkspaceContactId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        firstName: "Jean-Pierre",
        optOut: true
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceContact,
        firstName: "Jean-Pierre",
        optOut: true,
        updatedAt: "2026-04-30T13:00:00.000Z"
      }
    });
  });

  it("returns 404 for another workspace contact by id", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request(`/api/contacts/${otherWorkspaceContactId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Contact not found.",
      code: "CONTACT_NOT_FOUND"
    });
  });

  it("does not expose a contact archive route without a dedicated archive field", async () => {
    const app = createTestApp(createFakeContactService());

    const response = await app.request(`/api/contacts/${currentWorkspaceContactId}/archive`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(response.status).toBe(404);
  });
});

describe("contact repository activity logs", () => {
  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("writes activity log contact.created in the create transaction", async () => {
    mockTx.state.insertResponse = {
      ...currentWorkspaceContact,
      metadataJson: currentWorkspaceContact.metadata,
      createdAt: new Date(currentWorkspaceContact.createdAt),
      updatedAt: new Date(currentWorkspaceContact.updatedAt)
    };

    await contactRepository.createContact({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: { email: "jean@dupont.example" }
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "contact.created",
        entityType: "contact",
        entityId: currentWorkspaceContact.id
      })
    );
  });

  it("writes activity log contact.updated in the update transaction", async () => {
    mockTx.state.updateResponse = {
      ...currentWorkspaceContact,
      firstName: "Updated",
      metadataJson: currentWorkspaceContact.metadata,
      createdAt: new Date(currentWorkspaceContact.createdAt),
      updatedAt: new Date(currentWorkspaceContact.updatedAt)
    };

    await contactRepository.updateContact({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceContact.id,
      data: { firstName: "Updated" }
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "contact.updated",
        entityType: "contact",
        entityId: currentWorkspaceContact.id
      })
    );
  });
});
