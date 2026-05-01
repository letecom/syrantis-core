import {
  TaskOutputSchema,
  type CreateTaskInput,
  type TaskListQuery,
  type TaskOutput,
  type UpdateTaskInput
} from "@syrantis/shared";

import type { TaskRow } from "../repositories/tasks.js";
import type { TaskMutationResult } from "../repositories/tasks.js";
import {
  createTask,
  findTaskById,
  listTasks,
  updateTask
} from "../repositories/tasks.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TaskService = {
  listTasks(workspaceId: string, query: TaskListQuery): Promise<TaskOutput[]>;
  createTask(workspaceId: string, userId: string, input: CreateTaskInput): Promise<TaskServiceMutationResult>;
  getTask(workspaceId: string, id: string): Promise<TaskOutput | null>;
  updateTask(workspaceId: string, userId: string, id: string, input: UpdateTaskInput): Promise<TaskServiceMutationResult>;
};

export type TaskServiceMutationResult =
  | { result: "ok"; task: TaskOutput }
  | { result: "not_found" }
  | { result: "invalid_relation" };

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function readAssignedTo(metadata: Record<string, unknown>): string | null {
  return typeof metadata.assignedTo === "string" && uuidPattern.test(metadata.assignedTo) ? metadata.assignedTo : null;
}

function mapTaskRow(row: TaskRow): TaskOutput {
  return TaskOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    status: row.status,
    title: row.title,
    description: row.description,
    dueDate: toIsoDate(row.dueAt),
    assignedTo: readAssignedTo(row.metadataJson),
    organizationId: row.organizationId,
    opportunityId: row.opportunityId,
    leadId: row.leadId,
    contactId: row.contactId,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapMutationResult(result: TaskMutationResult): TaskServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    task: mapTaskRow(result.task)
  };
}

export function createProductionTaskService(): TaskService {
  return {
    async listTasks(workspaceId: string, query: TaskListQuery): Promise<TaskOutput[]> {
      const rows = await listTasks({
        workspaceId,
        status: query.status,
        type: query.type,
        limit: query.limit
      });

      return rows.map(mapTaskRow);
    },

    async createTask(workspaceId: string, userId: string, input: CreateTaskInput): Promise<TaskServiceMutationResult> {
      return mapMutationResult(
        await createTask({
          workspaceId,
          createdByUserId: userId,
          actorUserId: userId,
          data: input
        })
      );
    },

    async getTask(workspaceId: string, id: string): Promise<TaskOutput | null> {
      const row = await findTaskById({ workspaceId, id });
      return row ? mapTaskRow(row) : null;
    },

    async updateTask(
      workspaceId: string,
      userId: string,
      id: string,
      input: UpdateTaskInput
    ): Promise<TaskServiceMutationResult> {
      return mapMutationResult(await updateTask({ workspaceId, id, actorUserId: userId, data: input }));
    }
  };
}
