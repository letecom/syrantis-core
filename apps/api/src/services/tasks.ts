import {
  TaskOutputSchema,
  type CreateTaskInput,
  type TaskListQuery,
  type TaskOutput,
  type UpdateTaskInput
} from "@syrantis/shared";

import type { TaskRow } from "../repositories/tasks.js";
import {
  createTask,
  findTaskById,
  listTasks,
  updateTask
} from "../repositories/tasks.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TaskService = {
  listTasks(workspaceId: string, query: TaskListQuery): Promise<TaskOutput[]>;
  createTask(workspaceId: string, userId: string, input: CreateTaskInput): Promise<TaskOutput>;
  getTask(workspaceId: string, id: string): Promise<TaskOutput | null>;
  updateTask(workspaceId: string, userId: string, id: string, input: UpdateTaskInput): Promise<TaskOutput | null>;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function readAssignedTo(metadata: Record<string, unknown>): string | null {
  return typeof metadata.assignedTo === "string" && uuidPattern.test(metadata.assignedTo) ? metadata.assignedTo : null;
}

function mergeAssignedTo(
  metadata: Record<string, unknown>,
  assignedTo: string | null | undefined
): Record<string, unknown> {
  if (assignedTo === undefined) {
    return metadata;
  }

  const nextMetadata = { ...metadata };

  if (assignedTo === null) {
    delete nextMetadata.assignedTo;
  } else {
    nextMetadata.assignedTo = assignedTo;
  }

  return nextMetadata;
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
    opportunityId: row.opportunityId,
    leadId: row.leadId,
    contactId: row.contactId,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
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

    async createTask(workspaceId: string, userId: string, input: CreateTaskInput): Promise<TaskOutput> {
      const row = await createTask({
        workspaceId,
        createdByUserId: userId,
        actorUserId: userId,
        data: input
      });

      return mapTaskRow(row);
    },

    async getTask(workspaceId: string, id: string): Promise<TaskOutput | null> {
      const row = await findTaskById({ workspaceId, id });
      return row ? mapTaskRow(row) : null;
    },

    async updateTask(workspaceId: string, userId: string, id: string, input: UpdateTaskInput): Promise<TaskOutput | null> {
      const data = { ...input };

      if (input.assignedTo !== undefined) {
        const existingTask = await findTaskById({ workspaceId, id });

        if (!existingTask) {
          return null;
        }

        data.metadata = mergeAssignedTo(input.metadata ?? existingTask.metadataJson, input.assignedTo);
      }

      const row = await updateTask({ workspaceId, id, actorUserId: userId, data });
      return row ? mapTaskRow(row) : null;
    }
  };
}
