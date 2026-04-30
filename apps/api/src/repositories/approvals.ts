import { and, desc, eq, type SQL } from "drizzle-orm";

import { approvals, tasks } from "@syrantis/db";
import type { ApprovalListQuery } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type ApprovalRow = typeof approvals.$inferSelect;

export type ApprovalMutationResult =
  | { result: "ok"; approval: ApprovalRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type ListApprovalsInput = {
  workspaceId: string;
  taskId?: string;
  status?: ApprovalListQuery["status"];
  limit?: number;
  offset?: number;
};

export type FindApprovalByIdInput = {
  workspaceId: string;
  id: string;
};

export type CreateApprovalInput = {
  workspaceId: string;
  actorUserId: string;
  taskId: string;
  metadata?: Record<string, unknown>;
};

export type ApproveApprovalInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
};

export type RejectApprovalInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  reason?: string;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function approvalFilters(input: {
  workspaceId: string;
  id?: string | undefined;
  taskId?: string | undefined;
  status?: string | undefined;
}): SQL[] {
  const filters = [eq(approvals.workspaceId, input.workspaceId)];

  if (input.id) {
    filters.push(eq(approvals.id, input.id));
  }

  if (input.taskId) {
    filters.push(eq(approvals.taskId, input.taskId));
  }

  if (input.status) {
    filters.push(eq(approvals.status, input.status));
  }

  return filters;
}

export async function listApprovals(input: ListApprovalsInput): Promise<ApprovalRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(approvals)
      .where(and(...approvalFilters(input)))
      .orderBy(desc(approvals.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}

export async function findApprovalById(input: FindApprovalByIdInput): Promise<ApprovalRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(and(...approvalFilters(input)))
      .limit(1);

    return approval ?? null;
  });
}

export async function createApproval(input: CreateApprovalInput): Promise<ApprovalMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.workspaceId, input.workspaceId)))
      .limit(1);

    if (!task) {
      return { result: "not_found" };
    }

    const [approval] = await tx
      .insert(approvals)
      .values({
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        entityType: "task",
        entityId: input.taskId,
        approvalType: "manual",
        status: "pending",
        requestedBy: input.actorUserId,
        metadataJson: input.metadata ?? {}
      })
      .returning();

    if (!approval) {
      throw new Error("Failed to create approval.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      metadataJson: {
        taskId: input.taskId,
        status: approval.status
      }
    });

    return { result: "ok", approval };
  });
}

export async function approveApproval(input: ApproveApprovalInput): Promise<ApprovalMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingApproval] = await tx
      .select()
      .from(approvals)
      .where(and(...approvalFilters({ workspaceId: input.workspaceId, id: input.id })))
      .limit(1);

    if (!existingApproval) {
      return { result: "not_found" };
    }

    if (existingApproval.status !== "pending") {
      return { result: "conflict" };
    }

    const [approval] = await tx
      .update(approvals)
      .set({
        status: "approved",
        approvedBy: input.actorUserId,
        approvedAt: new Date()
      })
      .where(and(...approvalFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!approval) {
      throw new Error("Failed to approve approval.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "approval.approved",
      entityType: "approval",
      entityId: approval.id,
      metadataJson: {
        taskId: approval.taskId,
        status: approval.status
      }
    });

    return { result: "ok", approval };
  });
}

export async function rejectApproval(input: RejectApprovalInput): Promise<ApprovalMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingApproval] = await tx
      .select()
      .from(approvals)
      .where(and(...approvalFilters({ workspaceId: input.workspaceId, id: input.id })))
      .limit(1);

    if (!existingApproval) {
      return { result: "not_found" };
    }

    if (existingApproval.status !== "pending") {
      return { result: "conflict" };
    }

    const [approval] = await tx
      .update(approvals)
      .set({
        status: "rejected",
        rejectedBy: input.actorUserId,
        rejectedAt: new Date(),
        ...(input.reason !== undefined ? { rejectionReason: input.reason } : {})
      })
      .where(and(...approvalFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!approval) {
      throw new Error("Failed to reject approval.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "approval.rejected",
      entityType: "approval",
      entityId: approval.id,
      metadataJson: {
        taskId: approval.taskId,
        status: approval.status
      }
    });

    return { result: "ok", approval };
  });
}
