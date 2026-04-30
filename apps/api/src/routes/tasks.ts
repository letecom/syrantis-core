import { Hono, type Context } from "hono";

import {
  ApiErrorSchema,
  CreateTaskInputSchema,
  TaskListQuerySchema,
  TaskListSuccessSchema,
  TaskSuccessSchema,
  UpdateTaskInputSchema
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionTaskService,
  type TaskService
} from "../services/tasks.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST"
});

const taskNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Task not found.",
  code: "TASK_NOT_FOUND"
});

export type TaskRoutesDependencies = {
  authService?: AuthService;
  taskService?: TaskService;
};

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function parseTaskId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

export function createTaskRoutes(dependencies: TaskRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService ? createTenantGuard(dependencies.authService) : tenantGuard;
  const taskService = dependencies.taskService ?? createProductionTaskService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    if (hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = TaskListQuerySchema.safeParse(c.req.query());

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const tasks = await taskService.listTasks(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      TaskListSuccessSchema.parse({
        success: true,
        data: tasks
      })
    );
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = CreateTaskInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const task = await taskService.createTask(getWorkspaceId(c), c.get("userId"), parsedBody.data);

    return c.json(
      TaskSuccessSchema.parse({
        success: true,
        data: task
      }),
      201
    );
  });

  routes.get("/:id", async (c) => {
    const taskId = parseTaskId(c.req.param("id"));

    if (!taskId) {
      return c.json(invalidRequestResponse, 400);
    }

    const task = await taskService.getTask(getWorkspaceId(c), taskId);

    if (!task) {
      return c.json(taskNotFoundResponse, 404);
    }

    return c.json(
      TaskSuccessSchema.parse({
        success: true,
        data: task
      })
    );
  });

  routes.patch("/:id", async (c) => {
    const taskId = parseTaskId(c.req.param("id"));

    if (!taskId) {
      return c.json(invalidRequestResponse, 400);
    }

    const body = await readJsonBody(c);

    if (hasClientWorkspaceId(body)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedBody = UpdateTaskInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const task = await taskService.updateTask(getWorkspaceId(c), taskId, parsedBody.data);

    if (!task) {
      return c.json(taskNotFoundResponse, 404);
    }

    return c.json(
      TaskSuccessSchema.parse({
        success: true,
        data: task
      })
    );
  });

  return routes;
}

export const taskRoutes = createTaskRoutes();
