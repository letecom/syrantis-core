import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthMe,
  CreateLeadInput,
  LeadListQuery,
  LeadOutput,
  LeadScoreStatusDto,
  UpdateLeadInput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as leadRepository from "../repositories/leads.js";
import { createLeadRoutes } from "../routes/leads.js";
import type { AuthService } from "../services/auth.js";
import type {
  LeadService,
  LeadServiceListResult,
  LeadServiceMutationResult,
} from "../services/leads.js";
import type { ScoringStatusService } from "../services/scoring-status.js";
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
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000999" })),
}));

const currentWorkspaceLeadId = "00000000-0000-4000-8000-000000000901";
const otherWorkspaceLeadId = "00000000-0000-4000-8000-000000000902";
const createdLeadId = "00000000-0000-4000-8000-000000000903";
const scoreJobId = "00000000-0000-4000-8000-000000000904";
const scoreStatusJobId = "00000000-0000-4000-8000-000000000905";
const scoreStatusScoreId = "00000000-0000-4000-8000-000000000906";
const currentWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000701";
const otherWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000702";
const currentWorkspaceContactId = "00000000-0000-4000-8000-000000000801";
const otherWorkspaceContactId = "00000000-0000-4000-8000-000000000802";

const currentWorkspaceLead: LeadOutput = {
  id: currentWorkspaceLeadId,
  workspaceId: testUser.workspaceId,
  organizationId: currentWorkspaceOrganizationId,
  contactId: currentWorkspaceContactId,
  source: "manual",
  status: "new",
  rawContent: "Client needs a quote for boiler replacement.",
  metadata: { urgency: "week" },
  score: null,
  scoreReason: null,
  receivedAt: "2026-04-30T10:00:00.000Z",
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z",
};

const otherWorkspaceLead: LeadOutput = {
  ...currentWorkspaceLead,
  id: otherWorkspaceLeadId,
  workspaceId: otherWorkspaceId,
  organizationId: otherWorkspaceOrganizationId,
  contactId: otherWorkspaceContactId,
  rawContent: "Other workspace lead.",
  metadata: {},
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
          returning: vi.fn(async () => (state.updateResponse ? [state.updateResponse] : [])),
        })),
      })),
    })),
  };
}

function createTestApp(
  leadService: LeadService,
  dependencies: {
    authService?: AuthService;
    scoringStatusService?: ScoringStatusService;
  } = {},
): Hono {
  const app = new Hono();

  app.route(
    "/api/leads",
    createLeadRoutes({
      authService: dependencies.authService ?? createFakeAuthService(),
      leadService,
      ...(dependencies.scoringStatusService
        ? { scoringStatusService: dependencies.scoringStatusService }
        : {}),
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

function createFakeLeadService(): LeadService {
  const leads = new Map<string, LeadOutput>([
    [currentWorkspaceLead.id, currentWorkspaceLead],
    [otherWorkspaceLead.id, otherWorkspaceLead],
  ]);
  const workspaceOrganizations = new Set([currentWorkspaceOrganizationId]);
  const workspaceContacts = new Set([currentWorkspaceContactId]);

  function mutationOk(lead: LeadOutput): LeadServiceMutationResult {
    return { result: "ok", lead };
  }

  function relatedEntitiesExist(input: CreateLeadInput | UpdateLeadInput): boolean {
    if (input.organizationId && !workspaceOrganizations.has(input.organizationId)) {
      return false;
    }

    if (input.contactId && !workspaceContacts.has(input.contactId)) {
      return false;
    }

    return true;
  }

  return {
    listLeads: vi.fn(async (workspaceId: string, query: LeadListQuery) => {
      if (query.organizationId && !workspaceOrganizations.has(query.organizationId)) {
        return { result: "not_found" } satisfies LeadServiceListResult;
      }

      if (query.contactId && !workspaceContacts.has(query.contactId)) {
        return { result: "not_found" } satisfies LeadServiceListResult;
      }

      return {
        result: "ok",
        leads: [...leads.values()].filter((lead) => {
          if (lead.workspaceId !== workspaceId) {
            return false;
          }

          if (query.organizationId && lead.organizationId !== query.organizationId) {
            return false;
          }

          if (query.contactId && lead.contactId !== query.contactId) {
            return false;
          }

          if (query.status && lead.status !== query.status) {
            return false;
          }

          if (query.source && lead.source !== query.source) {
            return false;
          }

          return true;
        }),
      } satisfies LeadServiceListResult;
    }),

    getLead: vi.fn(async (workspaceId: string, id: string) => {
      const lead = leads.get(id);
      return lead?.workspaceId === workspaceId ? lead : null;
    }),

    createLead: vi.fn(async (workspaceId: string, _actorUserId: string, input: CreateLeadInput) => {
      if (!relatedEntitiesExist(input)) {
        return { result: "not_found" } satisfies LeadServiceMutationResult;
      }

      const lead: LeadOutput = {
        id: createdLeadId,
        workspaceId,
        organizationId: input.organizationId ?? null,
        contactId: input.contactId ?? null,
        source: input.source ?? "manual",
        status: input.status ?? "new",
        rawContent: input.rawContent ?? null,
        metadata: input.metadata ?? {},
        score: null,
        scoreReason: null,
        receivedAt: input.receivedAt ?? null,
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z",
      };

      leads.set(lead.id, lead);
      return mutationOk(lead);
    }),

    updateLead: vi.fn(
      async (workspaceId: string, _actorUserId: string, id: string, input: UpdateLeadInput) => {
        if (!relatedEntitiesExist(input)) {
          return { result: "not_found" } satisfies LeadServiceMutationResult;
        }

        const lead = leads.get(id);

        if (!lead || lead.workspaceId !== workspaceId) {
          return { result: "not_found" } satisfies LeadServiceMutationResult;
        }

        const updatedLead: LeadOutput = {
          ...lead,
          ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
          ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.rawContent !== undefined ? { rawContent: input.rawContent } : {}),
          ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          updatedAt: "2026-04-30T13:00:00.000Z",
        };

        leads.set(id, updatedLead);
        return mutationOk(updatedLead);
      },
    ),

    requestLeadScore: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      const lead = leads.get(id);

      if (!lead || lead.workspaceId !== workspaceId) {
        return { result: "not_found" as const };
      }

      return {
        result: "ok" as const,
        jobId: scoreJobId,
        leadId: id,
      };
    }),
  };
}

function createFakeAuthServiceForUser(user: AuthMe): AuthService {
  return {
    login: vi.fn(async () => ({
      user,
      token: validSessionToken,
    })),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

const scoreStatusDto: LeadScoreStatusDto = {
  scoreStatus: "completed",
  latestJob: {
    id: scoreStatusJobId,
    status: "completed",
    attempts: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:05:00.000Z",
    completedAt: "2026-05-01T10:05:00.000Z",
    failedAt: null,
    diagnosticTraceId: null,
  },
  latestScore: {
    id: scoreStatusScoreId,
    score: 84,
    scoreBand: "hot",
    intent: null,
    urgency: null,
    confidence: 91,
    recommendedAction: "Call within 10 minutes.",
    diagnosticTraceId: null,
    createdAt: "2026-05-01T10:06:00.000Z",
  },
  counts: {
    totalScoringJobs: 1,
    totalScores: 1,
  },
  checkedAt: "2026-05-01T10:07:00.000Z",
  processingNote: "Lead scoring status was read without mutating workflow state.",
};

function createFakeScoringStatusService(): ScoringStatusService {
  return {
    getStatus: vi.fn(async (workspaceId: string, id: string) => {
      if (workspaceId !== testUser.workspaceId || id !== currentWorkspaceLeadId) {
        return { result: "not_found" as const };
      }

      return {
        result: "ok" as const,
        status: scoreStatusDto,
      };
    }),
  };
}

function leadRowFromOutput(lead: LeadOutput) {
  return {
    id: lead.id,
    workspaceId: lead.workspaceId,
    organizationId: lead.organizationId,
    contactId: lead.contactId,
    source: lead.source,
    status: lead.status,
    rawContent: lead.rawContent,
    normalizedJson: lead.metadata,
    score: lead.score,
    scoreReason: lead.scoreReason,
    receivedAt: lead.receivedAt ? new Date(lead.receivedAt) : null,
    createdAt: new Date(lead.createdAt),
    updatedAt: new Date(lead.updatedAt),
  };
}

describe("lead routes", () => {
  it("returns 401 for GET /api/leads without session", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request("/api/leads");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION",
    });
  });

  it("creates a lead for the current workspace", async () => {
    const leadService = createFakeLeadService();
    const app = createTestApp(leadService);

    const response = await app.request("/api/leads", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        organizationId: currentWorkspaceOrganizationId,
        contactId: currentWorkspaceContactId,
        source: "form",
        rawContent: "Please call me about a heating quote.",
        receivedAt: "2026-05-01T09:00:00.000Z",
        metadata: { campaign: "spring" },
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: createdLeadId,
        workspaceId: testUser.workspaceId,
        organizationId: currentWorkspaceOrganizationId,
        contactId: currentWorkspaceContactId,
        source: "form",
        status: "new",
        rawContent: "Please call me about a heating quote.",
        metadata: { campaign: "spring" },
        score: null,
        scoreReason: null,
        receivedAt: "2026-05-01T09:00:00.000Z",
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z",
      },
    });
    expect(leadService.createLead).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ source: "form" }),
    );
  });

  it("rejects workspaceId in POST body", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request("/api/leads", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        rawContent: "Forbidden workspace input",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
  });

  it("lists only current workspace leads", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request("/api/leads", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceLead],
    });
  });

  it("returns a current workspace lead by id", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: currentWorkspaceLead,
    });
  });

  it("returns 404 for another workspace lead by id", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request(`/api/leads/${otherWorkspaceLeadId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("returns 401 for score status without session", async () => {
    const scoringStatusService = createFakeScoringStatusService();
    const app = createTestApp(createFakeLeadService(), { scoringStatusService });

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}/score-status`);

    expect(response.status).toBe(401);
    expect(scoringStatusService.getStatus).not.toHaveBeenCalled();
  });

  it("returns 403 for score status when the session role is not admin or founder", async () => {
    const scoringStatusService = createFakeScoringStatusService();
    const app = createTestApp(createFakeLeadService(), {
      authService: createFakeAuthServiceForUser({
        ...testUser,
        role: "operator",
      }),
      scoringStatusService,
    });

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}/score-status`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
    expect(scoringStatusService.getStatus).not.toHaveBeenCalled();
  });

  it("returns score status for a current workspace lead", async () => {
    const scoringStatusService = createFakeScoringStatusService();
    const app = createTestApp(createFakeLeadService(), { scoringStatusService });

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}/score-status`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: scoreStatusDto,
    });
    expect(scoringStatusService.getStatus).toHaveBeenCalledWith(
      testUser.workspaceId,
      currentWorkspaceLeadId,
    );
  });

  it("returns 404 for score status of an unknown lead", async () => {
    const app = createTestApp(createFakeLeadService(), {
      scoringStatusService: createFakeScoringStatusService(),
    });

    const response = await app.request(
      "/api/leads/00000000-0000-4000-8000-000000000999/score-status",
      {
        headers: validSessionHeaders(),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("returns 404 for score status of another workspace lead", async () => {
    const app = createTestApp(createFakeLeadService(), {
      scoringStatusService: createFakeScoringStatusService(),
    });

    const response = await app.request(`/api/leads/${otherWorkspaceLeadId}/score-status`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("does not create activity logs for score status reads", async () => {
    vi.mocked(createActivityLog).mockClear();
    const app = createTestApp(createFakeLeadService(), {
      scoringStatusService: createFakeScoringStatusService(),
    });

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}/score-status`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("does not expose unsafe score status fields", async () => {
    const app = createTestApp(createFakeLeadService(), {
      scoringStatusService: createFakeScoringStatusService(),
    });

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}/score-status`, {
      headers: validSessionHeaders(),
    });

    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("bodyText");
    expect(serialized).not.toContain("body_text");
    expect(serialized).not.toContain("fromEmail");
    expect(serialized).not.toContain("contactEmail");
    expect(serialized).not.toContain("contactName");
    expect(serialized).not.toContain("subject");
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("rawOutput");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("cost");
    expect(serialized).not.toContain("tokens");
    expect(serialized).not.toContain("payload_json");
    expect(serialized).not.toContain("last_error_message");
  });

  it("updates a current workspace lead", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        rawContent: "Updated lead notes.",
        status: "responded",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceLead,
        rawContent: "Updated lead notes.",
        status: "responded",
        updatedAt: "2026-04-30T13:00:00.000Z",
      },
    });
  });

  it("returns 404 when updating another workspace lead", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request(`/api/leads/${otherWorkspaceLeadId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        status: "responded",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("returns 404 when creating a lead with another workspace contactId", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request("/api/leads", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        contactId: otherWorkspaceContactId,
        rawContent: "Should not create",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("returns 404 when creating a lead with another workspace organizationId", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request("/api/leads", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        organizationId: otherWorkspaceOrganizationId,
        rawContent: "Should not create",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("returns 400 for PATCH with empty body", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request(`/api/leads/${currentWorkspaceLeadId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
  });

  it("returns 400 for invalid status", async () => {
    const app = createTestApp(createFakeLeadService());

    const response = await app.request("/api/leads", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        rawContent: "Invalid status lead",
        status: "archived",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
  });
});

describe("lead repository activity logs", () => {
  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("writes activity log lead.created in the create transaction", async () => {
    mockTx.state.insertResponse = leadRowFromOutput(currentWorkspaceLead);

    await leadRepository.createLead({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: { rawContent: "Client needs a quote." },
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "lead.created",
        entityType: "lead",
        entityId: currentWorkspaceLead.id,
      }),
    );
  });

  it("writes activity log lead.updated in the update transaction", async () => {
    mockTx.state.updateResponse = leadRowFromOutput({
      ...currentWorkspaceLead,
      status: "responded",
    });

    await leadRepository.updateLead({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceLead.id,
      data: { status: "responded" },
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "lead.updated",
        entityType: "lead",
        entityId: currentWorkspaceLead.id,
      }),
    );
  });
});
