import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createTaskRoutes } from "../routes/tasks.js";
import type { TaskService } from "../services/tasks.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import {
  createdTaskId,
  createFakeTaskService,
  currentWorkspaceTask,
  currentWorkspaceTaskId,
  otherWorkspaceTaskId
} from "./mocks/tasks.js";

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
        contactId: "00000000-0000-4000-8000-000000000401",
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
        opportunityId: null,
        leadId: null,
        contactId: "00000000-0000-4000-8000-000000000401",
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
