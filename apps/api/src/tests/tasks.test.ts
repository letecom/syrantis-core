import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as taskRepository from "../repositories/tasks.js";
import { createTaskRoutes } from "../routes/tasks.js";
import type { TaskService } from "../services/tasks.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import {
  createdTaskId,
  createFakeTaskService,
  currentWorkspaceContactId,
  currentWorkspaceOrganizationId,
  currentWorkspaceTask,
  currentWorkspaceTaskId,
  currentWorkspaceOtherContactId,
  currentWorkspaceOtherLeadId,
  currentWorkspaceOtherOrganizationId,
  otherWorkspaceContactId,
  otherWorkspaceLeadId,
  otherWorkspaceOpportunityId,
  otherWorkspaceOrganizationId,
  otherWorkspaceTaskId
} from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockDb.tx))
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000799" }))
}));

function createTestApp(taskService: TaskService): Hono {
  const app = new Hono();

  app.route(
    "/api/tasks",
    createTaskRoutes({
      authService: createFakeAuthService(),
      taskService
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

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
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

function taskRowFromOutput(task = currentWorkspaceTask) {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    type: task.type,
    status: task.status,
    title: task.title,
    description: task.description,
    dueAt: task.dueDate ? new Date(task.dueDate) : null,
    metadataJson: task.metadata,
    organizationId: task.organizationId,
    opportunityId: task.opportunityId,
    leadId: task.leadId,
    contactId: task.contactId,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt)
  };
}

describe("task routes", () => {
  it("returns 401 for GET /api/tasks without session", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("creates a task for the current workspace", async () => {
    const taskService = createFakeTaskService();
    const app = createTestApp(taskService);

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Relancer le devis",
        description: "Client asked for a callback.",
        dueDate: "2026-05-02T09:00:00.000Z",
        contactId: currentWorkspaceContactId,
        metadata: { source: "test" }
      })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: createdTaskId,
        workspaceId: testUser.workspaceId,
        type: "followup",
        status: "pending",
        title: "Relancer le devis",
        description: "Client asked for a callback.",
        dueDate: "2026-05-02T09:00:00.000Z",
        assignedTo: null,
        organizationId: null,
        opportunityId: null,
        leadId: null,
        contactId: currentWorkspaceContactId,
        metadata: { source: "test" },
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
    expect(taskService.createTask).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({ title: "Relancer le devis" })
    );
  });

  it("rejects workspaceId in POST body", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        workspaceId: testUser.workspaceId,
        type: "followup",
        title: "Forbidden workspace input"
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("returns 404 when creating a task with another workspace organizationId", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Cross workspace organization",
        organizationId: otherWorkspaceOrganizationId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Task not found.",
      code: "TASK_NOT_FOUND"
    });
  });

  it("returns 404 when creating a task with another workspace contactId", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Cross workspace contact",
        contactId: otherWorkspaceContactId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Task not found.",
      code: "TASK_NOT_FOUND"
    });
  });

  it("returns 404 when creating a task with another workspace leadId", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Cross workspace lead",
        leadId: otherWorkspaceLeadId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Task not found.",
      code: "TASK_NOT_FOUND"
    });
  });

  it("returns 404 when creating a task with another workspace opportunityId", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Cross workspace opportunity",
        opportunityId: otherWorkspaceOpportunityId
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Task not found.",
      code: "TASK_NOT_FOUND"
    });
  });

  it("returns 400 when task contactId and organizationId are inconsistent", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Mismatched contact organization",
        organizationId: currentWorkspaceOrganizationId,
        contactId: currentWorkspaceOtherContactId
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("returns 400 when task leadId and organizationId are inconsistent", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Mismatched lead organization",
        organizationId: currentWorkspaceOrganizationId,
        leadId: currentWorkspaceOtherLeadId
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("returns 400 when task leadId and contactId are inconsistent", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "followup",
        title: "Mismatched lead contact",
        contactId: currentWorkspaceContactId,
        leadId: currentWorkspaceOtherLeadId
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("lists only current workspace tasks", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request("/api/tasks", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceTask]
    });
  });

  it("returns a current workspace task by id", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${currentWorkspaceTaskId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: currentWorkspaceTask
    });
  });

  it("returns 404 for another workspace task by id", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${otherWorkspaceTaskId}`, {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Task not found.",
      code: "TASK_NOT_FOUND"
    });
  });

  it("updates a current workspace task", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${currentWorkspaceTaskId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "Updated task",
        status: "in_progress"
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceTask,
        title: "Updated task",
        status: "in_progress",
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
  });

  it("returns 400 when patching organizationId would make the existing contact inconsistent", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${currentWorkspaceTaskId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        organizationId: currentWorkspaceOtherOrganizationId
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("removes a task relation when patching the field to null", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${currentWorkspaceTaskId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        contactId: null
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceTask,
        contactId: null,
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
  });

  it("returns 404 when updating another workspace task", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${otherWorkspaceTaskId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: "Should not update"
      })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Task not found.",
      code: "TASK_NOT_FOUND"
    });
  });

  it("returns 400 for PATCH with empty body", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${currentWorkspaceTaskId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });

  it("supports cancelling a task through PATCH status", async () => {
    const app = createTestApp(createFakeTaskService());

    const response = await app.request(`/api/tasks/${currentWorkspaceTaskId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({
        status: "cancelled"
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        ...currentWorkspaceTask,
        status: "cancelled",
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
  });
});

describe("task repository relationship validation", () => {
  let mockTx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("does not write task.created activity log when create relation validation fails", async () => {
    mockTx.state.selectResponses.push([]);

    const result = await taskRepository.createTask({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: {
        type: "followup",
        title: "Invalid relation",
        organizationId: otherWorkspaceOrganizationId
      }
    });

    expect(result).toEqual({ result: "not_found" });
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  it("does not write task.updated activity log when update relation validation fails", async () => {
    mockTx.state.selectResponses.push(
      [taskRowFromOutput()],
      [{ id: currentWorkspaceOtherOrganizationId }],
      [{ id: currentWorkspaceContactId, organizationId: currentWorkspaceOrganizationId }]
    );

    const result = await taskRepository.updateTask({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      id: currentWorkspaceTaskId,
      data: {
        organizationId: currentWorkspaceOtherOrganizationId
      }
    });

    expect(result).toEqual({ result: "invalid_relation" });
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(mockTx.update).not.toHaveBeenCalled();
  });
});
