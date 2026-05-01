import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { ActivityLogOutput, ActivityLogQuery } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createActivityLogRoutes } from "../routes/activity-logs.js";
import type { ActivityLogService } from "../services/activity-logs.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { currentWorkspaceTaskId, otherWorkspaceId } from "./mocks/tasks.js";

const currentWorkspaceLog: ActivityLogOutput = {
  id: "00000000-0000-4000-8000-000000000501",
  workspaceId: testUser.workspaceId,
  actorUserId: testUser.id,
  action: "task.created",
  entityType: "task",
  entityId: currentWorkspaceTaskId,
  metadata: {
    taskType: "followup",
    status: "pending"
  },
  createdAt: "2026-04-30T13:00:00.000Z"
};

const otherWorkspaceLog: ActivityLogOutput = {
  id: "00000000-0000-4000-8000-000000000502",
  workspaceId: otherWorkspaceId,
  actorUserId: null,
  action: "task.updated",
  entityType: "task",
  entityId: "00000000-0000-4000-8000-000000000201",
  metadata: {
    status: "done"
  },
  createdAt: "2026-04-30T14:00:00.000Z"
};

function createFakeActivityLogService(): ActivityLogService {
  const activityLogs = [currentWorkspaceLog, otherWorkspaceLog];

  return {
    listActivityLogs: vi.fn(async (workspaceId: string, query: ActivityLogQuery) => {
      return activityLogs.filter((activityLog) => {
        if (activityLog.workspaceId !== workspaceId) {
          return false;
        }

        if (query.entityType && activityLog.entityType !== query.entityType) {
          return false;
        }

        if (query.entityId && activityLog.entityId !== query.entityId) {
          return false;
        }

        if (query.action && activityLog.action !== query.action) {
          return false;
        }

        return true;
      });
    })
  };
}

function createTestApp(activityLogService: ActivityLogService): Hono {
  const app = new Hono();

  app.route(
    "/api/activity-logs",
    createActivityLogRoutes({
      authService: createFakeAuthService(),
      activityLogService
    })
  );

  return app;
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`
  };
}

describe("activity log routes", () => {
  it("returns 401 for GET /api/activity-logs without session", async () => {
    const app = createTestApp(createFakeActivityLogService());

    const response = await app.request("/api/activity-logs");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("returns only current workspace logs with a valid session", async () => {
    const app = createTestApp(createFakeActivityLogService());

    const response = await app.request("/api/activity-logs", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceLog]
    });
  });

  it("accepts entityType, entityId, and action query filters", async () => {
    const activityLogService = createFakeActivityLogService();
    const app = createTestApp(activityLogService);

    const response = await app.request(
      `/api/activity-logs?entityType=task&entityId=${currentWorkspaceTaskId}&action=task.created&limit=25&offset=0`,
      {
        headers: validSessionHeaders()
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: [currentWorkspaceLog]
    });
    expect(activityLogService.listActivityLogs).toHaveBeenCalledWith(testUser.workspaceId, {
      entityType: "task",
      entityId: currentWorkspaceTaskId,
      action: "task.created",
      limit: 25,
      offset: 0
    });
  });

  it("returns 400 for invalid query", async () => {
    const app = createTestApp(createFakeActivityLogService());

    const response = await app.request("/api/activity-logs?limit=0", {
      headers: validSessionHeaders()
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request.",
      code: "INVALID_REQUEST"
    });
  });
});

describe("createActivityLog", () => {
  function createMockTx() {
    return {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [])
        }))
      }))
    };
  }

  it("rejects missing workspaceId at runtime before insert", async () => {
    const tx = createMockTx();

    await expect(
      createActivityLog(tx as never, {
        workspaceId: "",
        actorUserId: testUser.id,
        action: "task.created",
        entityType: "task",
        entityId: currentWorkspaceTaskId
      })
    ).rejects.toThrow("createActivityLog requires workspaceId.");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects null workspaceId at runtime before insert when the type is bypassed", async () => {
    const tx = createMockTx();

    await expect(
      createActivityLog(tx as never, {
        workspaceId: null,
        actorUserId: testUser.id,
        action: "task.created",
        entityType: "task",
        entityId: currentWorkspaceTaskId
      } as never)
    ).rejects.toThrow("createActivityLog requires workspaceId.");
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
