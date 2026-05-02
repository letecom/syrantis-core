import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ApprovalOutput,
  CreateDraftInput,
  DraftOutput,
  RequestDraftApprovalInput,
  UpdateDraftInput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as draftRepository from "../repositories/drafts.js";
import { createApprovalRoutes } from "../routes/approvals.js";
import { createAuthRoutes } from "../routes/auth.js";
import { createDraftRoutes } from "../routes/drafts.js";
import type { ApprovalService, ApprovalServiceMutationResult } from "../services/approvals.js";
import type { AuthService } from "../services/auth.js";
import type {
  DraftApprovalRequestServiceResult,
  DraftService,
  DraftServiceMutationResult,
} from "../services/drafts.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { otherWorkspaceId } from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000899" })),
}));

const currentWorkspaceDraftId = "00000000-0000-4000-8000-000000000901";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000000902";
const createdDraftId = "00000000-0000-4000-8000-000000000903";
const currentWorkspaceLeadId = "00000000-0000-4000-8000-000000000904";
const otherWorkspaceLeadId = "00000000-0000-4000-8000-000000000905";
const currentWorkspaceContactId = "00000000-0000-4000-8000-000000000906";
const otherWorkspaceContactId = "00000000-0000-4000-8000-000000000907";
const draftApprovalId = "00000000-0000-4000-8000-000000000908";

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
  updatedAt: "2026-05-01T10:00:00.000Z",
};

const otherWorkspaceDraft: DraftOutput = {
  ...currentWorkspaceDraft,
  id: otherWorkspaceDraftId,
  workspaceId: otherWorkspaceId,
  leadId: otherWorkspaceLeadId,
  contactId: otherWorkspaceContactId,
  subject: "Other workspace draft",
  metadata: {},
};

const pendingDraftApproval: ApprovalOutput = {
  id: draftApprovalId,
  workspaceId: testUser.workspaceId,
  draftId: currentWorkspaceDraftId,
  taskId: null,
  status: "pending",
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  metadata: { note: "Please review" },
  createdAt: "2026-05-01T15:00:00.000Z",
  updatedAt: "2026-05-01T15:00:00.000Z",
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
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx() {
  const state = {
    selectResponses: [] as unknown[][],
    insertResponse: null as unknown,
    updateResponse: null as unknown,
    updateResponses: [] as unknown[],
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => (state.insertResponse ? [state.insertResponse] : [])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const response =
              state.updateResponses.length > 0
                ? state.updateResponses.shift()
                : state.updateResponse;
            return response ? [response] : [];
          }),
        })),
      })),
    })),
  };
}

function createTestApp(
  draftService: DraftService,
  authService: AuthService = createFakeAuthService(),
): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService,
      draftService,
    }),
  );
  app.route("/auth", createAuthRoutes({ authService }));

  return app;
}

function createDraftApprovalTestApp(
  draftService: DraftService,
  approvalService: ApprovalService,
  authService: AuthService = createFakeAuthService(),
): Hono {
  const app = createTestApp(draftService, authService);

  app.route(
    "/api/approvals",
    createApprovalRoutes({
      authService,
      approvalService,
    }),
  );

  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function jsonHeaders() {
  return {
    ...validSessionHeaders(),
    "content-type": "application/json",
  };
}

function mutationOk(draft: DraftOutput): DraftServiceMutationResult {
  return { result: "ok", draft };
}

function createFakeDraftService(): DraftService {
  const drafts = new Map<string, DraftOutput>([
    [currentWorkspaceDraft.id, currentWorkspaceDraft],
    [otherWorkspaceDraft.id, otherWorkspaceDraft],
  ]);
  const leads = new Map([
    [currentWorkspaceLeadId, testUser.workspaceId],
    [otherWorkspaceLeadId, otherWorkspaceId],
  ]);
  const contacts = new Map([
    [currentWorkspaceContactId, testUser.workspaceId],
    [otherWorkspaceContactId, otherWorkspaceId],
  ]);

  return {
    listDrafts: vi.fn(async (workspaceId: string) => {
      return [...drafts.values()].filter(
        (draft) => draft.workspaceId === workspaceId && draft.status !== "archived",
      );
    }),

    getDraft: vi.fn(async (workspaceId: string, id: string) => {
      const draft = drafts.get(id);
      return draft?.workspaceId === workspaceId && draft.status !== "archived" ? draft : null;
    }),

    createDraft: vi.fn(
      async (workspaceId: string, _actorUserId: string, input: CreateDraftInput) => {
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
          updatedAt: "2026-05-01T12:00:00.000Z",
        };

        drafts.set(draft.id, draft);
        return mutationOk(draft);
      },
    ),

    updateDraft: vi.fn(
      async (workspaceId: string, _actorUserId: string, id: string, input: UpdateDraftInput) => {
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
          updatedAt: "2026-05-01T13:00:00.000Z",
        };

        drafts.set(id, updatedDraft);
        return mutationOk(updatedDraft);
      },
    ),

    archiveDraft: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      const draft = drafts.get(id);

      if (!draft || draft.workspaceId !== workspaceId || draft.status === "archived") {
        return { result: "not_found" } satisfies DraftServiceMutationResult;
      }

      const archivedDraft: DraftOutput = {
        ...draft,
        status: "archived",
        updatedAt: "2026-05-01T14:00:00.000Z",
      };

      drafts.set(id, archivedDraft);
      return mutationOk(archivedDraft);
    }),

    requestApproval: vi.fn(
      async (
        workspaceId: string,
        _actorUserId: string,
        id: string,
        input: RequestDraftApprovalInput,
      ): Promise<DraftApprovalRequestServiceResult> => {
        const draft = drafts.get(id);

        if (!draft || draft.workspaceId !== workspaceId || draft.status === "archived") {
          return { result: "not_found" };
        }

        if (draft.status !== "draft") {
          return { result: "conflict" };
        }

        const requestedDraft: DraftOutput = {
          ...draft,
          status: "pending_approval",
          updatedAt: "2026-05-01T15:00:00.000Z",
        };
        const approval: ApprovalOutput = {
          ...pendingDraftApproval,
          workspaceId,
          draftId: id,
          metadata: input.note ? { note: input.note } : {},
        };

        drafts.set(id, requestedDraft);
        return { result: "ok", draft: requestedDraft, approval };
      },
    ),
  };
}

function createFakeDraftApprovalServices() {
  const drafts = new Map<string, DraftOutput>([
    [currentWorkspaceDraft.id, currentWorkspaceDraft],
    [
      otherWorkspaceDraft.id,
      {
        ...otherWorkspaceDraft,
      },
    ],
  ]);
  const approvals = new Map<string, ApprovalOutput>();

  const draftService: DraftService = {
    listDrafts: vi.fn(async (workspaceId: string) => {
      return [...drafts.values()].filter(
        (draft) => draft.workspaceId === workspaceId && draft.status !== "archived",
      );
    }),

    getDraft: vi.fn(async (workspaceId: string, id: string) => {
      const draft = drafts.get(id);
      return draft?.workspaceId === workspaceId && draft.status !== "archived" ? draft : null;
    }),

    createDraft: vi.fn(
      async (workspaceId: string, _actorUserId: string, input: CreateDraftInput) => {
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
          updatedAt: "2026-05-01T12:00:00.000Z",
        };

        drafts.set(draft.id, draft);
        return mutationOk(draft);
      },
    ),

    updateDraft: vi.fn(async () => ({ result: "not_found" }) satisfies DraftServiceMutationResult),
    archiveDraft: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      const draft = drafts.get(id);

      if (!draft || draft.workspaceId !== workspaceId || draft.status === "archived") {
        return { result: "not_found" } satisfies DraftServiceMutationResult;
      }

      const archivedDraft: DraftOutput = { ...draft, status: "archived" };
      drafts.set(id, archivedDraft);
      return mutationOk(archivedDraft);
    }),

    requestApproval: vi.fn(
      async (
        workspaceId: string,
        _actorUserId: string,
        id: string,
        input: RequestDraftApprovalInput,
      ): Promise<DraftApprovalRequestServiceResult> => {
        const draft = drafts.get(id);

        if (!draft || draft.workspaceId !== workspaceId || draft.status === "archived") {
          return { result: "not_found" };
        }

        if (
          draft.status !== "draft" ||
          [...approvals.values()].some(
            (approval) => approval.draftId === id && approval.status === "pending",
          )
        ) {
          return { result: "conflict" };
        }

        const requestedDraft: DraftOutput = {
          ...draft,
          status: "pending_approval",
          updatedAt: "2026-05-01T15:00:00.000Z",
        };
        const approval: ApprovalOutput = {
          ...pendingDraftApproval,
          id: `00000000-0000-4000-8000-00000000090${approvals.size + 8}`,
          workspaceId,
          draftId: id,
          metadata: input.note ? { note: input.note } : {},
          createdAt: "2026-05-01T15:00:00.000Z",
          updatedAt: "2026-05-01T15:00:00.000Z",
        };

        drafts.set(id, requestedDraft);
        approvals.set(approval.id, approval);
        return { result: "ok", draft: requestedDraft, approval };
      },
    ),
  };

  const approvalService: ApprovalService = {
    listApprovals: vi.fn(async (workspaceId: string) => {
      return [...approvals.values()].filter((approval) => approval.workspaceId === workspaceId);
    }),
    getApproval: vi.fn(async (workspaceId: string, id: string) => {
      const approval = approvals.get(id);
      return approval?.workspaceId === workspaceId ? approval : null;
    }),
    createApproval: vi.fn(
      async () => ({ result: "not_found" }) satisfies ApprovalServiceMutationResult,
    ),
    approveApproval: vi.fn(async (workspaceId: string, actorUserId: string, id: string) => {
      const approval = approvals.get(id);

      if (!approval || approval.workspaceId !== workspaceId) {
        return { result: "not_found" } satisfies ApprovalServiceMutationResult;
      }

      if (approval.status !== "pending") {
        return { result: "conflict" } satisfies ApprovalServiceMutationResult;
      }

      const approvedApproval: ApprovalOutput = {
        ...approval,
        status: "approved",
        approvedBy: actorUserId,
        approvedAt: "2026-05-01T16:00:00.000Z",
        updatedAt: "2026-05-01T16:00:00.000Z",
      };
      approvals.set(id, approvedApproval);

      if (approval.draftId) {
        const draft = drafts.get(approval.draftId);

        if (draft?.workspaceId !== workspaceId || draft.status !== "pending_approval") {
          return { result: "conflict" } satisfies ApprovalServiceMutationResult;
        }

        drafts.set(approval.draftId, {
          ...draft,
          status: "approved",
          updatedAt: "2026-05-01T16:00:00.000Z",
        });
      }

      return { result: "ok", approval: approvedApproval } satisfies ApprovalServiceMutationResult;
    }),
    rejectApproval: vi.fn(async (workspaceId: string, actorUserId: string, id: string, input) => {
      const approval = approvals.get(id);

      if (!approval || approval.workspaceId !== workspaceId) {
        return { result: "not_found" } satisfies ApprovalServiceMutationResult;
      }

      if (approval.status !== "pending") {
        return { result: "conflict" } satisfies ApprovalServiceMutationResult;
      }

      const rejectedApproval: ApprovalOutput = {
        ...approval,
        status: "rejected",
        rejectedBy: actorUserId,
        rejectedAt: "2026-05-01T16:30:00.000Z",
        rejectionReason: input.reason ?? null,
        updatedAt: "2026-05-01T16:30:00.000Z",
      };
      approvals.set(id, rejectedApproval);

      if (approval.draftId) {
        const draft = drafts.get(approval.draftId);

        if (draft?.workspaceId !== workspaceId || draft.status !== "pending_approval") {
          return { result: "conflict" } satisfies ApprovalServiceMutationResult;
        }

        drafts.set(approval.draftId, {
          ...draft,
          status: "rejected",
          updatedAt: "2026-05-01T16:30:00.000Z",
        });
      }

      return { result: "ok", approval: rejectedApproval } satisfies ApprovalServiceMutationResult;
    }),
  };

  return { draftService, approvalService, drafts, approvals };
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
    updatedAt: new Date(draft.updatedAt),
  };
}

function approvalRowFromOutput(approval: ApprovalOutput) {
  return {
    id: approval.id,
    workspaceId: approval.workspaceId,
    entityType: approval.draftId ? "draft" : "task",
    entityId: approval.draftId ?? approval.taskId ?? currentWorkspaceDraftId,
    draftId: approval.draftId,
    taskId: approval.taskId,
    approvalType: "manual",
    status: approval.status,
    requestedBy: testUser.id,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt ? new Date(approval.approvedAt) : null,
    rejectedBy: approval.rejectedBy,
    rejectedAt: approval.rejectedAt ? new Date(approval.rejectedAt) : null,
    rejectionReason: approval.rejectionReason,
    riskLevel: "medium",
    metadataJson: approval.metadata,
    createdAt: new Date(approval.createdAt),
    updatedAt: new Date(approval.updatedAt),
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
      code: "NO_SESSION",
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
        textBody: "Forbidden workspace input",
      }),
    });

    expect(bodyResponse.status).toBe(400);
    expect(await bodyResponse.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });

    const queryResponse = await app.request(`/api/drafts?workspaceId=${testUser.workspaceId}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        leadId: currentWorkspaceLeadId,
        textBody: "Forbidden workspace query",
      }),
    });

    expect(queryResponse.status).toBe(400);
    expect(await queryResponse.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
  });

  it("returns 404 when creating a draft with a missing or cross-workspace lead", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request("/api/drafts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        leadId: otherWorkspaceLeadId,
        textBody: "Should not create",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Draft not found.",
      code: "DRAFT_NOT_FOUND",
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
        metadata: { tone: "polite" },
      }),
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
        updatedAt: "2026-05-01T12:00:00.000Z",
      },
    });
    expect(draftService.createDraft).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ leadId: currentWorkspaceLeadId }),
    );
  });

  it("lists current workspace drafts", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request("/api/drafts", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceDraft],
    });
  });

  it("returns draft detail", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request(`/api/drafts/${currentWorkspaceDraftId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: currentWorkspaceDraft,
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
        metadata: { tone: "direct" },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceDraft,
        subject: "Relance mise a jour",
        textBody: "Texte mis a jour.",
        metadata: { tone: "direct" },
        updatedAt: "2026-05-01T13:00:00.000Z",
      },
    });
  });

  it("archives a draft and hides it from future detail reads", async () => {
    const draftService = createFakeDraftService();
    const app = createTestApp(draftService);

    const archiveResponse = await app.request(`/api/drafts/${currentWorkspaceDraftId}/archive`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(archiveResponse.status).toBe(200);
    expect(await archiveResponse.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceDraft,
        status: "archived",
        updatedAt: "2026-05-01T14:00:00.000Z",
      },
    });

    const detailResponse = await app.request(`/api/drafts/${currentWorkspaceDraftId}`, {
      headers: validSessionHeaders(),
    });

    expect(detailResponse.status).toBe(404);
    expect(await detailResponse.json()).toEqual({
      success: false,
      error: "Draft not found.",
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("returns 401 for POST /api/drafts/:id/request-approval without session", async () => {
    const app = createTestApp(createFakeDraftService());

    const response = await app.request(`/api/drafts/${currentWorkspaceDraftId}/request-approval`, {
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION",
    });
  });

  it("rejects workspaceId in request approval body or query", async () => {
    const app = createTestApp(createFakeDraftService());

    const bodyResponse = await app.request(
      `/api/drafts/${currentWorkspaceDraftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          workspaceId: testUser.workspaceId,
          note: "Forbidden workspace input",
        }),
      },
    );

    expect(bodyResponse.status).toBe(400);
    expect(await bodyResponse.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });

    const queryResponse = await app.request(
      `/api/drafts/${currentWorkspaceDraftId}/request-approval?workspaceId=${testUser.workspaceId}`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ note: "Forbidden workspace query" }),
      },
    );

    expect(queryResponse.status).toBe(400);
    expect(await queryResponse.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
  });

  it("creates a draft approval request and returns the pending draft and linked approval", async () => {
    const draftService = createFakeDraftService();
    const app = createTestApp(draftService);

    const createResponse = await app.request("/api/drafts", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        leadId: currentWorkspaceLeadId,
        textBody: "Bonjour, voici le brouillon.",
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { data: DraftOutput };

    const response = await app.request(`/api/drafts/${created.data.id}/request-approval`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ note: "Please review" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draft: {
          ...created.data,
          status: "pending_approval",
          updatedAt: "2026-05-01T15:00:00.000Z",
        },
        approval: {
          ...pendingDraftApproval,
          draftId: created.data.id,
        },
      },
    });

    const detailResponse = await app.request(`/api/drafts/${created.data.id}`, {
      headers: validSessionHeaders(),
    });
    expect(detailResponse.status).toBe(200);
    expect((await detailResponse.json()) as { data: DraftOutput }).toMatchObject({
      data: { status: "pending_approval" },
    });
  });

  it("returns 409 for a second request approval on the same draft", async () => {
    const app = createTestApp(createFakeDraftService());

    const firstResponse = await app.request(
      `/api/drafts/${currentWorkspaceDraftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );
    expect(firstResponse.status).toBe(201);

    const secondResponse = await app.request(
      `/api/drafts/${currentWorkspaceDraftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );

    expect(secondResponse.status).toBe(409);
    expect(await secondResponse.json()).toEqual({
      success: false,
      error: "Draft cannot request approval.",
      code: "DRAFT_APPROVAL_CONFLICT",
    });
  });

  it("returns 404 for request approval on archived, missing, or cross-workspace drafts", async () => {
    const draftService = createFakeDraftService();
    const app = createTestApp(draftService);

    const archiveResponse = await app.request(`/api/drafts/${currentWorkspaceDraftId}/archive`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    expect(archiveResponse.status).toBe(200);

    for (const draftId of [
      currentWorkspaceDraftId,
      "00000000-0000-4000-8000-000000000999",
      otherWorkspaceDraftId,
    ]) {
      const response = await app.request(`/api/drafts/${draftId}/request-approval`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        success: false,
        error: "Draft not found.",
        code: "DRAFT_NOT_FOUND",
      });
    }
  });

  it("propagates draft approval approve and reject decisions to draft status", async () => {
    const approveFixture = createFakeDraftApprovalServices();
    const approveApp = createDraftApprovalTestApp(
      approveFixture.draftService,
      approveFixture.approvalService,
    );

    const requestResponse = await approveApp.request(
      `/api/drafts/${currentWorkspaceDraftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );
    expect(requestResponse.status).toBe(201);
    const requested = (await requestResponse.json()) as { data: { approval: ApprovalOutput } };

    const approveResponse = await approveApp.request(
      `/api/approvals/${requested.data.approval.id}/approve`,
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );
    expect(approveResponse.status).toBe(200);

    const approvedDraftResponse = await approveApp.request(
      `/api/drafts/${currentWorkspaceDraftId}`,
      {
        headers: validSessionHeaders(),
      },
    );
    expect(approvedDraftResponse.status).toBe(200);
    expect((await approvedDraftResponse.json()) as { data: DraftOutput }).toMatchObject({
      data: { status: "approved" },
    });

    const rejectFixture = createFakeDraftApprovalServices();
    const rejectApp = createDraftApprovalTestApp(
      rejectFixture.draftService,
      rejectFixture.approvalService,
    );

    const rejectRequestResponse = await rejectApp.request(
      `/api/drafts/${currentWorkspaceDraftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );
    expect(rejectRequestResponse.status).toBe(201);
    const rejectRequested = (await rejectRequestResponse.json()) as {
      data: { approval: ApprovalOutput };
    };

    const rejectResponse = await rejectApp.request(
      `/api/approvals/${rejectRequested.data.approval.id}/reject`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ reason: "Needs changes" }),
      },
    );
    expect(rejectResponse.status).toBe(200);

    const rejectedDraftResponse = await rejectApp.request(
      `/api/drafts/${currentWorkspaceDraftId}`,
      {
        headers: validSessionHeaders(),
      },
    );
    expect(rejectedDraftResponse.status).toBe(200);
    expect((await rejectedDraftResponse.json()) as { data: DraftOutput }).toMatchObject({
      data: { status: "rejected" },
    });
  });

  it("returns 401 for /api/drafts after logout", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(createFakeDraftService(), authService);

    const logoutResponse = await app.request("/auth/logout", {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(logoutResponse.status).toBe(200);

    const response = await app.request("/api/drafts");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION",
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
    mockTx.state.selectResponses.push([
      { id: currentWorkspaceLeadId, contactId: currentWorkspaceContactId },
    ]);
    mockTx.state.insertResponse = draftRowFromOutput(currentWorkspaceDraft);

    await draftRepository.createDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: {
        leadId: currentWorkspaceLeadId,
        textBody: "Bonjour.",
      },
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "draft.created",
        entityType: "draft",
        entityId: currentWorkspaceDraft.id,
      }),
    );
  });

  it("writes activity log draft.updated in the update transaction", async () => {
    mockTx.state.updateResponse = draftRowFromOutput({
      ...currentWorkspaceDraft,
      textBody: "Updated.",
    });

    await draftRepository.updateDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceDraftId,
      data: {
        textBody: "Updated.",
      },
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.updated",
        entityType: "draft",
        entityId: currentWorkspaceDraft.id,
      }),
    );
  });

  it("writes activity log draft.archived in the archive transaction", async () => {
    mockTx.state.updateResponse = draftRowFromOutput({
      ...currentWorkspaceDraft,
      status: "archived",
    });

    await draftRepository.archiveDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceDraftId,
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.archived",
        entityType: "draft",
        entityId: currentWorkspaceDraft.id,
      }),
    );
  });

  it("writes draft.approval_requested and approval.created in the request approval transaction", async () => {
    const pendingDraft = {
      ...currentWorkspaceDraft,
      status: "pending_approval" as const,
    };

    mockTx.state.selectResponses.push([draftRowFromOutput(currentWorkspaceDraft)], []);
    mockTx.state.updateResponse = draftRowFromOutput(pendingDraft);
    mockTx.state.insertResponse = approvalRowFromOutput({
      ...pendingDraftApproval,
      draftId: currentWorkspaceDraftId,
    });

    await draftRepository.requestDraftApproval({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceDraftId,
      data: {
        note: "Please review",
      },
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.approval_requested",
        entityType: "draft",
        entityId: currentWorkspaceDraftId,
      }),
    );
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "approval.created",
        entityType: "approval",
        entityId: draftApprovalId,
      }),
    );
  });
});
