import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateDraftInput, DraftOutput, UpdateDraftInput } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as draftRepository from "../repositories/drafts.js";
import { createAuthRoutes } from "../routes/auth.js";
import { createDraftRoutes } from "../routes/drafts.js";
import type { AuthService } from "../services/auth.js";
import type { DraftService, DraftServiceMutationResult } from "../services/drafts.js";
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

const currentWorkspaceDraftId = "00000000-0000-4000-8000-000000000901";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000000902";
const createdDraftId = "00000000-0000-4000-8000-000000000903";
const currentWorkspaceLeadId = "00000000-0000-4000-8000-000000000904";
const otherWorkspaceLeadId = "00000000-0000-4000-8000-000000000905";
const currentWorkspaceContactId = "00000000-0000-4000-8000-000000000906";
const otherWorkspaceContactId = "00000000-0000-4000-8000-000000000907";

const currentWorkspaceDraft: DraftOutput = {
  id: currentWorkspaceDraftId,
  workspaceId: testUser.workspaceId,
  taskId: null,
  leadId: currentWorkspaceLeadId,
  opportunityId: null,
  contactId: currentWorkspaceContactId,
  status: "draft",
  channel: "email",
  subject: "Votre demande de devis",
  textBody: "Bonjour, voici une premiere reponse.",
  htmlBody: null,
  metadata: { source: "test" },
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z"
};

const otherWorkspaceDraft: DraftOutput = {
  ...currentWorkspaceDraft,
  id: otherWorkspaceDraftId,
  workspaceId: otherWorkspaceId,
  leadId: otherWorkspaceLeadId,
  contactId: otherWorkspaceContactId,
  subject: "Other workspace draft",
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

function createTestApp(draftService: DraftService, authService: AuthService = createFakeAuthService()): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService,
      draftService
    })
  );
  app.route("/auth", createAuthRoutes({ authService }));

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

function mutationOk(draft: DraftOutput): DraftServiceMutationResult {
  return { result: "ok", draft };
}

function createFakeDraftService(): DraftService {
  const drafts = new Map<string, DraftOutput>([
    [currentWorkspaceDraft.id, currentWorkspaceDraft],
    [otherWorkspaceDraft.id, otherWorkspaceDraft]
  ]);
  const leads = new Map([
    [currentWorkspaceLeadId, testUser.workspaceId],
    [otherWorkspaceLeadId, otherWorkspaceId]
  ]);
  const contacts = new Map([
    [currentWorkspaceContactId, testUser.workspaceId],
    [otherWorkspaceContactId, otherWorkspaceId]
  ]);

  return {
    listDrafts: vi.fn(async (workspaceId: string) => {
      return [...drafts.values()].filter((draft) => draft.workspaceId === workspaceId && draft.status !== "archived");
    }),

    getDraft: vi.fn(async (workspaceId: string, id: string) => {
      const draft = drafts.get(id);
      return draft?.workspaceId === workspaceId && draft.status !== "archived" ? draft : null;
    }),

    createDraft: vi.fn(async (workspaceId: string, _actorUserId: string, input: CreateDraftInput) => {
      if (leads.get(input.leadId) !== workspaceId) {
        return { result: "not_found" } satisfies DraftServiceMutationResult;
      }

      if (input.contactId && contacts.get(input.contactId) !== workspaceId) {
        return { result: "not_found" } satisfies DraftServiceMutationResult;
      }

      const draft: DraftOutput = {
        id: createdDraftId,
        workspaceId,
        taskId: null,
        leadId: input.leadId,
        opportunityId: null,
        contactId: input.contactId ?? null,
        status: "draft",
        channel: input.channel ?? "email",
        subject: input.subject ?? null,
        textBody: input.textBody ?? null,
        htmlBody: input.htmlBody ?? null,
        metadata: input.metadata ?? {},
        createdAt: "2026-05-01T12:00:00.000Z",
        updatedAt: "2026-05-01T12:00:00.000Z"
      };

      drafts.set(draft.id, draft);
      return mutationOk(draft);
    }),

    updateDraft: vi.fn(async (workspaceId: string, _actorUserId: string, id: string, input: UpdateDraftInput) => {
      const draft = drafts.get(id);

      if (!draft || draft.workspaceId !== workspaceId || draft.status === "archived") {
        return { result: "not_found" } satisfies DraftServiceMutationResult;
      }

      const updatedDraft: DraftOutput = {
        ...draft,
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.textBody !== undefined ? { textBody: input.textBody } : {}),
        ...(input.htmlBody !== undefined ? { htmlBody: input.htmlBody } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        updatedAt: "2026-05-01T13:00:00.000Z"
      };

      drafts.set(id, updatedDraft);
      return mutationOk(updatedDraft);
    }),

    archiveDraft: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      const draft = drafts.get(id);

      if (!draft || draft.workspaceId !== workspaceId || draft.status === "archived") {
        return { result: "not_found" } satisfies DraftServiceMutationResult;
      }

      const archivedDraft: DraftOutput = {
        ...draft,
        status: "archived",
        updatedAt: "2026-05-01T14:00:00.000Z"
      };

      drafts.set(id, archivedDraft);
      return mutationOk(archivedDraft);
    })
  };
}

function draftRowFromOutput(draft: DraftOutput) {
  return {
    id: draft.id,
    workspaceId: draft.workspaceId,
    taskId: draft.taskId,
    leadId: draft.leadId,
    opportunityId: draft.opportunityId,
    contactId: draft.contactId,
    status: draft.status,
    channel: draft.channel,
    subject: draft.subject,
    textBody: draft.textBody,
    htmlBody: draft.htmlBody,
    metadataJson: draft.metadata,
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt)
  };
}

describe("draft routes", () => {
  it("returns 401 for GET /api/drafts without session", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request("/api/drafts");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("rejects workspaceId in POST body or query", async () => {
    const app = createTestApp(createFakeDraftService());

    const bodyResponse = await app.request("/api/drafts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        leadId: currentWorkspaceLeadId,
        textBody: "Forbidden workspace input"
      })
    });

    expect(bodyResponse.status).toBe(400);
    expect(await bodyResponse.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });

    const queryResponse = await app.request(`/api/drafts?workspaceId=${testUser.workspaceId}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        leadId: currentWorkspaceLeadId,
        textBody: "Forbidden workspace query"
      })
    });

    expect(queryResponse.status).toBe(400);
    expect(await queryResponse.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("returns 404 when creating a draft with a missing or cross-workspace lead", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request("/api/drafts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        leadId: otherWorkspaceLeadId,
        textBody: "Should not create"
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Draft not found.",
      code: "DRAFT_NOT_FOUND"
    });
  });

  it("creates a draft for a valid lead", async () => {
    const draftService = createFakeDraftService();
    const app = createTestApp(draftService);

    const response = await app.request("/api/drafts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        leadId: currentWorkspaceLeadId,
        contactId: currentWorkspaceContactId,
        subject: "Relance devis",
        textBody: "Bonjour, voulez-vous avancer sur le devis ?",
        metadata: { tone: "polite" }
      })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: createdDraftId,
        workspaceId: testUser.workspaceId,
        taskId: null,
        leadId: currentWorkspaceLeadId,
        opportunityId: null,
        contactId: currentWorkspaceContactId,
        status: "draft",
        channel: "email",
        subject: "Relance devis",
        textBody: "Bonjour, voulez-vous avancer sur le devis ?",
        htmlBody: null,
        metadata: { tone: "polite" },
        createdAt: "2026-05-01T12:00:00.000Z",
        updatedAt: "2026-05-01T12:00:00.000Z"
      }
    });
    expect(draftService.createDraft).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ leadId: currentWorkspaceLeadId })
    );
  });

  it("lists current workspace drafts", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request("/api/drafts", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceDraft]
    });
  });

  it("returns draft detail", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request(`/api/drafts/${currentWorkspaceDraftId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: currentWorkspaceDraft
    });
  });

  it("updates editable fields", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request(`/api/drafts/${currentWorkspaceDraftId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        subject: "Relance mise a jour",
        textBody: "Texte mis a jour.",
        metadata: { tone: "direct" }
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceDraft,
        subject: "Relance mise a jour",
        textBody: "Texte mis a jour.",
        metadata: { tone: "direct" },
        updatedAt: "2026-05-01T13:00:00.000Z"
      }
    });
  });

  it("archives a draft and hides it from future detail reads", async () => {
    const draftService = createFakeDraftService();
    const app = createTestApp(draftService);

    const archiveResponse = await app.request(`/api/drafts/${currentWorkspaceDraftId}/archive`, {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(archiveResponse.status).toBe(200);
    expect(await archiveResponse.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceDraft,
        status: "archived",
        updatedAt: "2026-05-01T14:00:00.000Z"
      }
    });

    const detailResponse = await app.request(`/api/drafts/${currentWorkspaceDraftId}`, {
      headers: validSessionHeaders()
    });

    expect(detailResponse.status).toBe(404);
    expect(await detailResponse.json()).toEqual({
      success: false,
      error: "Draft not found.",
      code: "DRAFT_NOT_FOUND"
    });
  });

  it("returns 401 for /api/drafts after logout", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(createFakeDraftService(), authService);

    const logoutResponse = await app.request("/auth/logout", {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(logoutResponse.status).toBe(200);

    const response = await app.request("/api/drafts");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });
});

describe("draft repository activity logs", () => {
  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("writes activity log draft.created in the create transaction", async () => {
    mockTx.state.selectResponses.push([{ id: currentWorkspaceLeadId, contactId: currentWorkspaceContactId }]);
    mockTx.state.insertResponse = draftRowFromOutput(currentWorkspaceDraft);

    await draftRepository.createDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: {
        leadId: currentWorkspaceLeadId,
        textBody: "Bonjour."
      }
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "draft.created",
        entityType: "draft",
        entityId: currentWorkspaceDraft.id
      })
    );
  });

  it("writes activity log draft.updated in the update transaction", async () => {
    mockTx.state.updateResponse = draftRowFromOutput({
      ...currentWorkspaceDraft,
      textBody: "Updated."
    });

    await draftRepository.updateDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceDraftId,
      data: {
        textBody: "Updated."
      }
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.updated",
        entityType: "draft",
        entityId: currentWorkspaceDraft.id
      })
    );
  });

  it("writes activity log draft.archived in the archive transaction", async () => {
    mockTx.state.updateResponse = draftRowFromOutput({
      ...currentWorkspaceDraft,
      status: "archived"
    });

    await draftRepository.archiveDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceDraftId
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.archived",
        entityType: "draft",
        entityId: currentWorkspaceDraft.id
      })
    );
  });
});
