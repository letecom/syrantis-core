import {
  ApprovalOutputSchema,
  type ApprovalListQuery,
  type ApprovalOutput,
  type CreateApprovalInput,
  type RejectApprovalInput,
} from "@syrantis/shared";

import type { ApprovalMutationResult, ApprovalRow } from "../repositories/approvals.js";
import {
  approveApproval,
  createApproval,
  findApprovalById,
  listApprovals,
  rejectApproval,
} from "../repositories/approvals.js";

export type ApprovalServiceMutationResult =
  | { result: "ok"; approval: ApprovalOutput }
  | { result: "not_found" }
  | { result: "conflict" };

export type ApprovalService = {
  listApprovals(workspaceId: string, query: ApprovalListQuery): Promise<ApprovalOutput[]>;
  getApproval(workspaceId: string, id: string): Promise<ApprovalOutput | null>;
  createApproval(
    workspaceId: string,
    actorUserId: string,
    input: CreateApprovalInput,
  ): Promise<ApprovalServiceMutationResult>;
  approveApproval(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<ApprovalServiceMutationResult>;
  rejectApproval(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: RejectApprovalInput,
  ): Promise<ApprovalServiceMutationResult>;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapApprovalRow(row: ApprovalRow): ApprovalOutput {
  return ApprovalOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    draftId: row.draftId,
    taskId: row.taskId,
    status: row.status,
    approvedBy: row.approvedBy,
    approvedAt: toIsoDate(row.approvedAt),
    rejectedBy: row.rejectedBy,
    rejectedAt: toIsoDate(row.rejectedAt),
    rejectionReason: row.rejectionReason,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapMutationResult(result: ApprovalMutationResult): ApprovalServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    approval: mapApprovalRow(result.approval),
  };
}

export function createProductionApprovalService(): ApprovalService {
  return {
    async listApprovals(workspaceId: string, query: ApprovalListQuery): Promise<ApprovalOutput[]> {
      const rows = await listApprovals({
        workspaceId,
        ...(query.taskId !== undefined ? { taskId: query.taskId } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        limit: query.limit,
        offset: query.offset,
      });

      return rows.map(mapApprovalRow);
    },

    async getApproval(workspaceId: string, id: string): Promise<ApprovalOutput | null> {
      const row = await findApprovalById({ workspaceId, id });
      return row ? mapApprovalRow(row) : null;
    },

    async createApproval(
      workspaceId: string,
      actorUserId: string,
      input: CreateApprovalInput,
    ): Promise<ApprovalServiceMutationResult> {
      return mapMutationResult(
        await createApproval({
          workspaceId,
          actorUserId,
          taskId: input.taskId,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        }),
      );
    },

    async approveApproval(
      workspaceId: string,
      actorUserId: string,
      id: string,
    ): Promise<ApprovalServiceMutationResult> {
      return mapMutationResult(await approveApproval({ workspaceId, actorUserId, id }));
    },

    async rejectApproval(
      workspaceId: string,
      actorUserId: string,
      id: string,
      input: RejectApprovalInput,
    ): Promise<ApprovalServiceMutationResult> {
      return mapMutationResult(
        await rejectApproval({
          workspaceId,
          actorUserId,
          id,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        }),
      );
    },
  };
}
