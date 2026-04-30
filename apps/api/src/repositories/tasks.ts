import { and, desc, eq, type SQL } from "drizzle-orm";

import { tasks } from "@syrantis/db";
import type { CreateTaskInput, TaskListQuery, UpdateTaskInput } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type TaskRow = typeof tasks.$inferSelect;

export type ListTasksRepositoryInput = {
  workspaceId: string;
  status?: TaskListQuery["status"];
  type?: TaskListQuery["type"];
  limit?: number;
};

export type FindTaskByIdRepositoryInput = {
  workspaceId: string;
  id: string;
};

export type CreateTaskRepositoryInput = {
  workspaceId: string;
  createdByUserId?: string;
  actorUserId?: string;
  data: CreateTaskInput;
};

export type UpdateTaskRepositoryInput = {
  workspaceId: string;
  id: string;
  actorUserId?: string;
  data: UpdateTaskInput;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function taskFilters(input: {
  workspaceId: string;
  id?: string | undefined;
  status?: string | undefined;
  type?: string | undefined;
}): SQL[] {
  const filters = [eq(tasks.workspaceId, input.workspaceId)];

  if (input.id) {
    filters.push(eq(tasks.id, input.id));
  }

  if (input.status) {
    filters.push(eq(tasks.status, input.status));
  }

  if (input.type) {
    filters.push(eq(tasks.type, input.type));
  }

  return filters;
}

function metadataWithAssignedTo(
  metadata: Record<string, unknown> | undefined,
  assignedTo: string | undefined
): Record<string, unknown> {
  if (!assignedTo) {
    return metadata ?? {};
  }

  return {
    ...(metadata ?? {}),
    assignedTo
  };
}

export async function listTasks(input: ListTasksRepositoryInput): Promise<TaskRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const filters = taskFilters(input);

    return tx
      .select()
      .from(tasks)
      .where(and(...filters))
      .orderBy(desc(tasks.createdAt))
      .limit(resolveLimit(input.limit));
  });
}

export async function findTaskById(input: FindTaskByIdRepositoryInput): Promise<TaskRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(...taskFilters(input)))
      .limit(1);

    return task ?? null;
  });
}

export async function createTask(input: CreateTaskRepositoryInput): Promise<TaskRow> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: typeof tasks.$inferInsert = {
      workspaceId: input.workspaceId,
      type: input.data.type,
      title: input.data.title,
      metadataJson: metadataWithAssignedTo(input.data.metadata, input.data.assignedTo),
      ...(input.data.description !== undefined ? { description: input.data.description } : {}),
      ...(input.data.dueDate !== undefined ? { dueAt: new Date(input.data.dueDate) } : {}),
      ...(input.data.opportunityId !== undefined ? { opportunityId: input.data.opportunityId } : {}),
      ...(input.data.leadId !== undefined ? { leadId: input.data.leadId } : {}),
      ...(input.data.contactId !== undefined ? { contactId: input.data.contactId } : {})
    };

    const [task] = await tx.insert(tasks).values(values).returning();

    if (!task) {
      throw new Error("Failed to create task.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? input.createdByUserId ?? null,
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      metadataJson: {
        taskType: task.type,
        status: task.status
      }
    });

    return task;
  });
}

export async function updateTask(input: UpdateTaskRepositoryInput): Promise<TaskRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: Partial<typeof tasks.$inferInsert> = {
      ...(input.data.title !== undefined ? { title: input.data.title } : {}),
      ...(input.data.description !== undefined ? { description: input.data.description } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.dueDate !== undefined ? { dueAt: input.data.dueDate === null ? null : new Date(input.data.dueDate) } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {})
    };

    const [task] = await tx
      .update(tasks)
      .set(values)
      .where(and(...taskFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!task) {
      return null;
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      action: "task.updated",
      entityType: "task",
      entityId: task.id,
      metadataJson: {
        status: task.status
      }
    });

    return task;
  });
}
