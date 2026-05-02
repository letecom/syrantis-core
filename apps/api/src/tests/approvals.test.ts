import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ApprovalListQuery,
  ApprovalOutput,
  CreateApprovalInput,
  RejectApprovalInput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as approvalRepository from "../repositories/approvals.js";
import { createApprovalRoutes } from "../routes/approvals.js";
import type { ApprovalService, ApprovalServiceMutationResult } from "../services/approvals.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { currentWorkspaceTaskId, otherWorkspaceId, otherWorkspaceTaskId } from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000699" })),
}));

const pendingApprovalId = "00000000-0000-4000-8000-000000000601";
const approvedApprovalId = "00000000-0000-4000-8000-000000000602";
const rejectedApprovalId = "00000000-0000-4000-8000-000000000603";
const otherWorkspaceApprovalId = "00000000-0000-4000-8000-000000000604";
const missingTaskId = "00000000-0000-4000-8000-000000000999";
const currentWorkspaceDraftId = "00000000-0000-4000-8000-000000000606";

const pendingApproval: ApprovalOutput = {
  id: pendingApprovalId,
  workspaceId: testUser.workspaceId,
  draftId: null,
  taskId: currentWorkspaceTaskId,
  status: "pending",
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  metadata: { source: "test" },
  createdAt: "2026-04-30T15:00:00.000Z",
  updatedAt: "2026-04-30T15:00:00.000Z",
};

const approvedApproval: ApprovalOutput = {
  ...pendingApproval,
  id: approvedApprovalId,
  status: "approved",
  approvedBy: testUser.id,
  approvedAt: "2026-04-30T16:00:00.000Z",
  updatedAt: "2026-04-30T16:00:00.000Z",
};

const rejectedApproval: ApprovalOutput = {
  ...pendingApproval,
  id: rejectedApprovalId,
  status: "rejected",
  rejectedBy: testUser.id,
  rejectedAt: "2026-04-30T16:30:00.000Z",
  rejectionReason: "Not ready",
  updatedAt: "2026-04-30T16:30:00.000Z",
};

const otherWorkspaceApproval: ApprovalOutput = {
  ...pendingApproval,
  id: otherWorkspaceApprovalId,
  workspaceId: otherWorkspaceId,
  taskId: otherWorkspaceTaskId,
  metadata: {},
};

const pendingDraftApproval: ApprovalOutput = {
  ...pendingApproval,
  id: "00000000-0000-4000-8000-000000000607",
  draftId: currentWorkspaceDraftId,
  taskId: null,
  metadata: {},
};

let mockTx: ReturnType<typeof createMockTx>;

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx() {
  const state = {
    selectResponses: [] as unknown[][],
    updateResponses: [] as unknown[],
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const response = state.updateResponses.shift();
            return response ? [response] : [];
          }),
        })),
      })),
    })),
  };
}

function approvalRowFromOutput(approval: ApprovalOutput) {
  return {
    id: approval.id,
    workspaceId: approval.workspaceId,
    entityType: approval.draftId ? "draft" : "task",
    entityId: approval.draftId ?? approval.taskId ?? currentWorkspaceTaskId,
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

function draftRow(status: "pending_approval" | "approved" | "rejected") {
  return {
    id: currentWorkspaceDraftId,
    workspaceId: testUser.workspaceId,
    taskId: null,
    leadId: null,
    opportunityId: null,
    contactId: null,
    status,
    channel: "email",
    subject: "Draft",
    textBody: "Body",
    htmlBody: null,
    metadataJson: {},
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  };
}

function createFakeApprovalService(): ApprovalService {
  const approvals = new Map<string, ApprovalOutput>([
    [pendingApproval.id, pendingApproval],
    [approvedApproval.id, approvedApproval],
    [rejectedApproval.id, rejectedApproval],
    [otherWorkspaceApproval.id, otherWorkspaceApproval],
  ]);

  function mutationOk(approval: ApprovalOutput): ApprovalServiceMutationResult {
    return { result: "ok", approval };
  }

  return {
    listApprovals: vi.fn(async (workspaceId: string, query: ApprovalListQuery) => {
      return [...approvals.values()].filter((approval) => {
        if (approval.workspaceId !== workspaceId) {
          return false;
        }

        if (query.taskId && approval.taskId !== query.taskId) {
          return false;
        }

        if (query.status && approval.status !== query.status) {
          return false;
        }

        return true;
      });
    }),

    getApproval: vi.fn(async (workspaceId: string, id: string) => {
      const approval = approvals.get(id);
      return approval?.workspaceId === workspaceId ? approval : null;
    }),

    createApproval: vi.fn(
      async (workspaceId: string, _actorUserId: string, input: CreateApprovalInput) => {
        if (input.taskId === missingTaskId) {
          return { result: "not_found" } satisfies ApprovalServiceMutationResult;
        }

        const approval: ApprovalOutput = {
          id: "00000000-0000-4000-8000-000000000605",
          workspaceId,
          draftId: null,
          taskId: input.taskId,
          status: "pending",
          approvedBy: null,
          approvedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          metadata: input.metadata ?? {},
          createdAt: "2026-04-30T17:00:00.000Z",
          updatedAt: "2026-04-30T17:00:00.000Z",
        };

        approvals.set(approval.id, approval);
        return mutationOk(approval);
      },
    ),

    approveApproval: vi.fn(async (workspaceId: string, actorUserId: string, id: string) => {
      const approval = approvals.get(id);

      if (!approval || approval.workspaceId !== workspaceId) {
        return { result: "not_found" } satisfies ApprovalServiceMutationResult;
      }

      if (approval.status !== "pending") {
        return { result: "conflict" } satisfies ApprovalServiceMutationResult;
      }

      const approved: ApprovalOutput = {
        ...approval,
        status: "approved",
        approvedBy: actorUserId,
        approvedAt: "2026-04-30T18:00:00.000Z",
        updatedAt: "2026-04-30T18:00:00.000Z",
      };

      approvals.set(id, approved);
      return mutationOk(approved);
    }),

    rejectApproval: vi.fn(
      async (workspaceId: string, actorUserId: string, id: string, input: RejectApprovalInput) => {
        const approval = approvals.get(id);

        if (!approval || approval.workspaceId !== workspaceId) {
          return { result: "not_found" } satisfies ApprovalServiceMutationResult;
        }

        if (approval.status !== "pending") {
          return { result: "conflict" } satisfies ApprovalServiceMutationResult;
        }

        const rejected: ApprovalOutput = {
          ...approval,
          status: "rejected",
          rejectedBy: actorUserId,
          rejectedAt: "2026-04-30T18:30:00.000Z",
          rejectionReason: input.reason ?? null,
          metadata: approval.metadata,
          updatedAt: "2026-04-30T18:30:00.000Z",
        };

        approvals.set(id, rejected);
        return mutationOk(rejected);
      },
    ),
  };
}

function createTestApp(approvalService: ApprovalService): Hono {
  const app = new Hono();

  app.route(
    "/api/approvals",
    createApprovalRoutes({
      authService: createFakeAuthService(),
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

describe("approval routes", () => {
  it("returns 401 for GET /api/approvals without session", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION",
    });
  });

  it("creates a pending approval linked to a task", async () => {
    const approvalService = createFakeApprovalService();
    const app = createTestApp(approvalService);

    const response = await app.request("/api/approvals", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        taskId: currentWorkspaceTaskId,
        metadata: { requestedFor: "send_quote" },
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: "00000000-0000-4000-8000-000000000605",
        workspaceId: testUser.workspaceId,
        draftId: null,
        taskId: currentWorkspaceTaskId,
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        metadata: { requestedFor: "send_quote" },
        createdAt: "2026-04-30T17:00:00.000Z",
        updatedAt: "2026-04-30T17:00:00.000Z",
      },
    });
    expect(approvalService.createApproval).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ taskId: currentWorkspaceTaskId }),
    );
  });

  it("rejects workspaceId in create body", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        taskId: currentWorkspaceTaskId,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST",
    });
  });

  it("returns 404 when creating approval for missing task", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        taskId: missingTaskId,
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval not found.",
      code: "APPROVAL_NOT_FOUND",
    });
  });

  it("lists only current workspace approvals", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [pendingApproval, approvedApproval, rejectedApproval],
    });
  });

  it("filters approvals by taskId", async () => {
    const approvalService = createFakeApprovalService();
    const app = createTestApp(approvalService);

    const response = await app.request(`/api/approvals?taskId=${currentWorkspaceTaskId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [pendingApproval, approvedApproval, rejectedApproval],
    });
    expect(approvalService.listApprovals).toHaveBeenCalledWith(testUser.workspaceId, {
      taskId: currentWorkspaceTaskId,
      limit: 50,
      offset: 0,
    });
  });

  it("returns approval detail", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${pendingApprovalId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: pendingApproval,
    });
  });

  it("returns 404 for another workspace approval detail", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${otherWorkspaceApprovalId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval not found.",
      code: "APPROVAL_NOT_FOUND",
    });
  });

  it("approves a pending approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${pendingApprovalId}/approve`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...pendingApproval,
        status: "approved",
        approvedBy: testUser.id,
        approvedAt: "2026-04-30T18:00:00.000Z",
        updatedAt: "2026-04-30T18:00:00.000Z",
      },
    });
  });

  it("rejects a pending approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${pendingApprovalId}/reject`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        reason: "Needs a cleaner draft",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...pendingApproval,
        status: "rejected",
        rejectedBy: testUser.id,
        rejectedAt: "2026-04-30T18:30:00.000Z",
        rejectionReason: "Needs a cleaner draft",
        updatedAt: "2026-04-30T18:30:00.000Z",
      },
    });
  });

  it("returns 409 when approving an already approved approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${approvedApprovalId}/approve`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval is not pending.",
      code: "APPROVAL_NOT_PENDING",
    });
  });

  it("returns 409 when rejecting an already approved approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${approvedApprovalId}/reject`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval is not pending.",
      code: "APPROVAL_NOT_PENDING",
    });
  });
});

describe("approval repository draft propagation", () => {
  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("approves a draft approval and logs approval.approved plus draft.approved in one transaction", async () => {
    const approvedApproval: ApprovalOutput = {
      ...pendingDraftApproval,
      status: "approved",
      approvedBy: testUser.id,
      approvedAt: "2026-05-01T16:00:00.000Z",
      updatedAt: "2026-05-01T16:00:00.000Z",
    };

    mockTx.state.selectResponses.push(
      [approvalRowFromOutput(pendingDraftApproval)],
      [draftRow("pending_approval")],
    );
    mockTx.state.updateResponses.push(
      draftRow("approved"),
      approvalRowFromOutput(approvedApproval),
    );

    const result = await approvalRepository.approveApproval({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: pendingDraftApproval.id,
    });

    expect(result.result).toBe("ok");
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "approval.approved",
        entityType: "approval",
        entityId: pendingDraftApproval.id,
      }),
    );
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.approved",
        entityType: "draft",
        entityId: currentWorkspaceDraftId,
      }),
    );
  });

  it("rejects a draft approval and logs approval.rejected plus draft.rejected in one transaction", async () => {
    const rejectedApproval: ApprovalOutput = {
      ...pendingDraftApproval,
      status: "rejected",
      rejectedBy: testUser.id,
      rejectedAt: "2026-05-01T16:30:00.000Z",
      rejectionReason: "Needs changes",
      updatedAt: "2026-05-01T16:30:00.000Z",
    };

    mockTx.state.selectResponses.push(
      [approvalRowFromOutput(pendingDraftApproval)],
      [draftRow("pending_approval")],
    );
    mockTx.state.updateResponses.push(
      draftRow("rejected"),
      approvalRowFromOutput(rejectedApproval),
    );

    const result = await approvalRepository.rejectApproval({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: pendingDraftApproval.id,
      reason: "Needs changes",
    });

    expect(result.result).toBe("ok");
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "approval.rejected",
        entityType: "approval",
        entityId: pendingDraftApproval.id,
      }),
    );
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "draft.rejected",
        entityType: "draft",
        entityId: currentWorkspaceDraftId,
      }),
    );
  });
});
