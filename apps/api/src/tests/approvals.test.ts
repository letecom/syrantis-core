import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type {
  ApprovalListQuery,
  ApprovalOutput,
  CreateApprovalInput,
  RejectApprovalInput
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createApprovalRoutes } from "../routes/approvals.js";
import type { ApprovalService, ApprovalServiceMutationResult } from "../services/approvals.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { currentWorkspaceTaskId, otherWorkspaceId, otherWorkspaceTaskId } from "./mocks/tasks.js";

const pendingApprovalId = "00000000-0000-4000-8000-000000000601";
const approvedApprovalId = "00000000-0000-4000-8000-000000000602";
const rejectedApprovalId = "00000000-0000-4000-8000-000000000603";
const otherWorkspaceApprovalId = "00000000-0000-4000-8000-000000000604";
const missingTaskId = "00000000-0000-4000-8000-000000000999";

const pendingApproval: ApprovalOutput = {
  id: pendingApprovalId,
  workspaceId: testUser.workspaceId,
  taskId: currentWorkspaceTaskId,
  status: "pending",
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  metadata: { source: "test" },
  createdAt: "2026-04-30T15:00:00.000Z",
  updatedAt: "2026-04-30T15:00:00.000Z"
};

const approvedApproval: ApprovalOutput = {
  ...pendingApproval,
  id: approvedApprovalId,
  status: "approved",
  approvedBy: testUser.id,
  approvedAt: "2026-04-30T16:00:00.000Z",
  updatedAt: "2026-04-30T16:00:00.000Z"
};

const rejectedApproval: ApprovalOutput = {
  ...pendingApproval,
  id: rejectedApprovalId,
  status: "rejected",
  rejectedBy: testUser.id,
  rejectedAt: "2026-04-30T16:30:00.000Z",
  rejectionReason: "Not ready",
  updatedAt: "2026-04-30T16:30:00.000Z"
};

const otherWorkspaceApproval: ApprovalOutput = {
  ...pendingApproval,
  id: otherWorkspaceApprovalId,
  workspaceId: otherWorkspaceId,
  taskId: otherWorkspaceTaskId,
  metadata: {}
};

function createFakeApprovalService(): ApprovalService {
  const approvals = new Map<string, ApprovalOutput>([
    [pendingApproval.id, pendingApproval],
    [approvedApproval.id, approvedApproval],
    [rejectedApproval.id, rejectedApproval],
    [otherWorkspaceApproval.id, otherWorkspaceApproval]
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

    createApproval: vi.fn(async (workspaceId: string, _actorUserId: string, input: CreateApprovalInput) => {
      if (input.taskId === missingTaskId) {
        return { result: "not_found" } satisfies ApprovalServiceMutationResult;
      }

      const approval: ApprovalOutput = {
        id: "00000000-0000-4000-8000-000000000605",
        workspaceId,
        taskId: input.taskId,
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        metadata: input.metadata ?? {},
        createdAt: "2026-04-30T17:00:00.000Z",
        updatedAt: "2026-04-30T17:00:00.000Z"
      };

      approvals.set(approval.id, approval);
      return mutationOk(approval);
    }),

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
        updatedAt: "2026-04-30T18:00:00.000Z"
      };

      approvals.set(id, approved);
      return mutationOk(approved);
    }),

    rejectApproval: vi.fn(async (workspaceId: string, actorUserId: string, id: string, input: RejectApprovalInput) => {
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
        updatedAt: "2026-04-30T18:30:00.000Z"
      };

      approvals.set(id, rejected);
      return mutationOk(rejected);
    })
  };
}

function createTestApp(approvalService: ApprovalService): Hono {
  const app = new Hono();

  app.route(
    "/api/approvals",
    createApprovalRoutes({
      authService: createFakeAuthService(),
      approvalService
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

describe("approval routes", () => {
  it("returns 401 for GET /api/approvals without session", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
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
        metadata: { requestedFor: "send_quote" }
      })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: "00000000-0000-4000-8000-000000000605",
        workspaceId: testUser.workspaceId,
        taskId: currentWorkspaceTaskId,
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        metadata: { requestedFor: "send_quote" },
        createdAt: "2026-04-30T17:00:00.000Z",
        updatedAt: "2026-04-30T17:00:00.000Z"
      }
    });
    expect(approvalService.createApproval).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ taskId: currentWorkspaceTaskId })
    );
  });

  it("rejects workspaceId in create body", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        taskId: currentWorkspaceTaskId
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("returns 404 when creating approval for missing task", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        taskId: missingTaskId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval not found.",
      code: "APPROVAL_NOT_FOUND"
    });
  });

  it("lists only current workspace approvals", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request("/api/approvals", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [pendingApproval, approvedApproval, rejectedApproval]
    });
  });

  it("filters approvals by taskId", async () => {
    const approvalService = createFakeApprovalService();
    const app = createTestApp(approvalService);

    const response = await app.request(`/api/approvals?taskId=${currentWorkspaceTaskId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [pendingApproval, approvedApproval, rejectedApproval]
    });
    expect(approvalService.listApprovals).toHaveBeenCalledWith(testUser.workspaceId, {
      taskId: currentWorkspaceTaskId,
      limit: 50,
      offset: 0
    });
  });

  it("returns approval detail", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${pendingApprovalId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: pendingApproval
    });
  });

  it("returns 404 for another workspace approval detail", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${otherWorkspaceApprovalId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval not found.",
      code: "APPROVAL_NOT_FOUND"
    });
  });

  it("approves a pending approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${pendingApprovalId}/approve`, {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...pendingApproval,
        status: "approved",
        approvedBy: testUser.id,
        approvedAt: "2026-04-30T18:00:00.000Z",
        updatedAt: "2026-04-30T18:00:00.000Z"
      }
    });
  });

  it("rejects a pending approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${pendingApprovalId}/reject`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        reason: "Needs a cleaner draft"
      })
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
        updatedAt: "2026-04-30T18:30:00.000Z"
      }
    });
  });

  it("returns 409 when approving an already approved approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${approvedApprovalId}/approve`, {
      method: "POST",
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval is not pending.",
      code: "APPROVAL_NOT_PENDING"
    });
  });

  it("returns 409 when rejecting an already approved approval", async () => {
    const app = createTestApp(createFakeApprovalService());

    const response = await app.request(`/api/approvals/${approvedApprovalId}/reject`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Approval is not pending.",
      code: "APPROVAL_NOT_PENDING"
    });
  });
});
