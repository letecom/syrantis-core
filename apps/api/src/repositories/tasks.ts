import { and, desc, eq, ne, type SQL } from "drizzle-orm";

import { contacts, leads, opportunities, organizations, tasks } from "@syrantis/db";
import type { CreateTaskInput, TaskListQuery, UpdateTaskInput } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type TaskRow = typeof tasks.$inferSelect;

export type TaskMutationResult =
  | { result: "ok"; task: TaskRow }
  | { result: "not_found" }
  | { result: "invalid_relation" };

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

function hasOwnField<T extends object>(value: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasRelationshipInput(data: UpdateTaskInput): boolean {
  return (
    hasOwnField(data, "organizationId") ||
    hasOwnField(data, "contactId") ||
    hasOwnField(data, "leadId") ||
    hasOwnField(data, "opportunityId")
  );
}

type TaskRelationshipState = {
  organizationId: string | null;
  contactId: string | null;
  leadId: string | null;
  opportunityId: string | null;
};

type RelatedRows = {
  contact?: { id: string; organizationId: string | null };
  lead?: { id: string; organizationId: string | null; contactId: string | null };
  opportunity?: { id: string; organizationId: string | null; contactId: string | null; leadId: string | null };
};

function relationshipsFromCreate(data: CreateTaskInput): TaskRelationshipState {
  return {
    organizationId: data.organizationId ?? null,
    contactId: data.contactId ?? null,
    leadId: data.leadId ?? null,
    opportunityId: data.opportunityId ?? null
  };
}

function relationshipsFromUpdate(existingTask: TaskRow, data: UpdateTaskInput): TaskRelationshipState {
  return {
    organizationId: hasOwnField(data, "organizationId") ? (data.organizationId ?? null) : existingTask.organizationId,
    contactId: hasOwnField(data, "contactId") ? (data.contactId ?? null) : existingTask.contactId,
    leadId: hasOwnField(data, "leadId") ? (data.leadId ?? null) : existingTask.leadId,
    opportunityId: hasOwnField(data, "opportunityId") ? (data.opportunityId ?? null) : existingTask.opportunityId
  };
}

async function validateTaskRelationships(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; relationships: TaskRelationshipState }
): Promise<Exclude<TaskMutationResult, { result: "ok" }> | { result: "ok"; relatedRows: RelatedRows }> {
  const { relationships } = input;
  const relatedRows: RelatedRows = {};

  if (relationships.organizationId) {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.id, relationships.organizationId),
          eq(organizations.workspaceId, input.workspaceId),
          ne(organizations.status, "archived")
        )
      )
      .limit(1);

    if (!organization) {
      return { result: "not_found" };
    }
  }

  if (relationships.contactId) {
    const [contact] = await tx
      .select({ id: contacts.id, organizationId: contacts.organizationId })
      .from(contacts)
      .where(and(eq(contacts.id, relationships.contactId), eq(contacts.workspaceId, input.workspaceId)))
      .limit(1);

    if (!contact) {
      return { result: "not_found" };
    }

    relatedRows.contact = contact;
  }

  if (relationships.leadId) {
    const [lead] = await tx
      .select({ id: leads.id, organizationId: leads.organizationId, contactId: leads.contactId })
      .from(leads)
      .where(and(eq(leads.id, relationships.leadId), eq(leads.workspaceId, input.workspaceId)))
      .limit(1);

    if (!lead) {
      return { result: "not_found" };
    }

    relatedRows.lead = lead;
  }

  if (relationships.opportunityId) {
    const [opportunity] = await tx
      .select({
        id: opportunities.id,
        organizationId: opportunities.organizationId,
        contactId: opportunities.contactId,
        leadId: opportunities.leadId
      })
      .from(opportunities)
      .where(and(eq(opportunities.id, relationships.opportunityId), eq(opportunities.workspaceId, input.workspaceId)))
      .limit(1);

    if (!opportunity) {
      return { result: "not_found" };
    }

    relatedRows.opportunity = opportunity;
  }

  if (
    relatedRows.contact?.organizationId &&
    relationships.organizationId &&
    relatedRows.contact.organizationId !== relationships.organizationId
  ) {
    return { result: "invalid_relation" };
  }

  if (
    relatedRows.lead?.organizationId &&
    relationships.organizationId &&
    relatedRows.lead.organizationId !== relationships.organizationId
  ) {
    return { result: "invalid_relation" };
  }

  if (relatedRows.lead?.contactId && relationships.contactId && relatedRows.lead.contactId !== relationships.contactId) {
    return { result: "invalid_relation" };
  }

  if (
    relatedRows.opportunity?.organizationId &&
    relationships.organizationId &&
    relatedRows.opportunity.organizationId !== relationships.organizationId
  ) {
    return { result: "invalid_relation" };
  }

  if (
    relatedRows.opportunity?.contactId &&
    relationships.contactId &&
    relatedRows.opportunity.contactId !== relationships.contactId
  ) {
    return { result: "invalid_relation" };
  }

  if (relatedRows.opportunity?.leadId && relationships.leadId && relatedRows.opportunity.leadId !== relationships.leadId) {
    return { result: "invalid_relation" };
  }

  return { result: "ok", relatedRows };
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

export async function createTask(input: CreateTaskRepositoryInput): Promise<TaskMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const relationshipValidation = await validateTaskRelationships(tx, {
      workspaceId: input.workspaceId,
      relationships: relationshipsFromCreate(input.data)
    });

    if (relationshipValidation.result !== "ok") {
      return relationshipValidation;
    }

    const values: typeof tasks.$inferInsert = {
      workspaceId: input.workspaceId,
      type: input.data.type,
      title: input.data.title,
      metadataJson: metadataWithAssignedTo(input.data.metadata, input.data.assignedTo),
      ...(input.data.description !== undefined ? { description: input.data.description } : {}),
      ...(input.data.dueDate !== undefined ? { dueAt: new Date(input.data.dueDate) } : {}),
      ...(input.data.organizationId !== undefined ? { organizationId: input.data.organizationId } : {}),
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

    return { result: "ok", task };
  });
}

export async function updateTask(input: UpdateTaskRepositoryInput): Promise<TaskMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingTask] = await tx
      .select()
      .from(tasks)
      .where(and(...taskFilters({ workspaceId: input.workspaceId, id: input.id })))
      .limit(1);

    if (!existingTask) {
      return { result: "not_found" };
    }

    if (hasRelationshipInput(input.data)) {
      const relationshipValidation = await validateTaskRelationships(tx, {
        workspaceId: input.workspaceId,
        relationships: relationshipsFromUpdate(existingTask, input.data)
      });

      if (relationshipValidation.result !== "ok") {
        return relationshipValidation;
      }
    }

    const values: Partial<typeof tasks.$inferInsert> = {
      ...(input.data.title !== undefined ? { title: input.data.title } : {}),
      ...(input.data.description !== undefined ? { description: input.data.description } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.dueDate !== undefined ? { dueAt: input.data.dueDate === null ? null : new Date(input.data.dueDate) } : {}),
      ...(input.data.organizationId !== undefined ? { organizationId: input.data.organizationId } : {}),
      ...(input.data.opportunityId !== undefined ? { opportunityId: input.data.opportunityId } : {}),
      ...(input.data.leadId !== undefined ? { leadId: input.data.leadId } : {}),
      ...(input.data.contactId !== undefined ? { contactId: input.data.contactId } : {}),
      ...(input.data.assignedTo !== undefined
        ? { metadataJson: mergeAssignedTo(input.data.metadata ?? existingTask.metadataJson, input.data.assignedTo) }
        : {}),
      ...(input.data.assignedTo === undefined && input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {})
    };

    const [task] = await tx
      .update(tasks)
      .set(values)
      .where(and(...taskFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!task) {
      return { result: "not_found" };
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

    return { result: "ok", task };
  });
}
