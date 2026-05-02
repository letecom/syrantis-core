import {
  ApprovalOutputSchema,
  type ApprovalOutput,
  DraftOutputSchema,
  type CreateDraftInput,
  type DraftListQuery,
  type DraftOutput,
  type RequestDraftApprovalInput,
  type UpdateDraftInput,
} from "@syrantis/shared";

import type {
  DraftApprovalRequestResult,
  DraftApprovalRow,
  DraftMutationResult,
  DraftRow,
} from "../repositories/drafts.js";
import {
  archiveDraft,
  createDraft,
  findDraftById,
  listDrafts,
  requestDraftApproval,
  updateDraft,
} from "../repositories/drafts.js";

export type DraftServiceMutationResult =
  | { result: "ok"; draft: DraftOutput }
  | { result: "not_found" }
  | { result: "invalid_relation" }
  | { result: "conflict" };

export type DraftApprovalRequestServiceResult =
  | { result: "ok"; draft: DraftOutput; approval: ApprovalOutput }
  | { result: "not_found" }
  | { result: "conflict" };

export type DraftService = {
  listDrafts(workspaceId: string, query: DraftListQuery): Promise<DraftOutput[]>;
  getDraft(workspaceId: string, id: string): Promise<DraftOutput | null>;
  createDraft(
    workspaceId: string,
    actorUserId: string,
    input: CreateDraftInput,
  ): Promise<DraftServiceMutationResult>;
  updateDraft(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: UpdateDraftInput,
  ): Promise<DraftServiceMutationResult>;
  archiveDraft(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<DraftServiceMutationResult>;
  requestApproval(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: RequestDraftApprovalInput,
  ): Promise<DraftApprovalRequestServiceResult>;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapDraftRow(row: DraftRow): DraftOutput {
  return DraftOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    leadId: row.leadId,
    opportunityId: row.opportunityId,
    contactId: row.contactId,
    status: row.status,
    channel: row.channel,
    subject: row.subject,
    textBody: row.textBody,
    htmlBody: row.htmlBody,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapApprovalRow(row: DraftApprovalRow): ApprovalOutput {
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

function mapMutationResult(result: DraftMutationResult): DraftServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    draft: mapDraftRow(result.draft),
  };
}

function mapApprovalRequestResult(
  result: DraftApprovalRequestResult,
): DraftApprovalRequestServiceResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    draft: mapDraftRow(result.draft),
    approval: mapApprovalRow(result.approval),
  };
}

export function createProductionDraftService(): DraftService {
  return {
    async listDrafts(workspaceId: string, query: DraftListQuery): Promise<DraftOutput[]> {
      const rows = await listDrafts({
        workspaceId,
        limit: query.limit,
        offset: query.offset,
      });

      return rows.map(mapDraftRow);
    },

    async getDraft(workspaceId: string, id: string): Promise<DraftOutput | null> {
      const row = await findDraftById({ workspaceId, id });
      return row ? mapDraftRow(row) : null;
    },

    async createDraft(
      workspaceId: string,
      actorUserId: string,
      input: CreateDraftInput,
    ): Promise<DraftServiceMutationResult> {
      return mapMutationResult(
        await createDraft({
          workspaceId,
          actorUserId,
          data: input,
        }),
      );
    },

    async updateDraft(
      workspaceId: string,
      actorUserId: string,
      id: string,
      input: UpdateDraftInput,
    ): Promise<DraftServiceMutationResult> {
      return mapMutationResult(
        await updateDraft({
          workspaceId,
          actorUserId,
          id,
          data: input,
        }),
      );
    },

    async archiveDraft(
      workspaceId: string,
      actorUserId: string,
      id: string,
    ): Promise<DraftServiceMutationResult> {
      return mapMutationResult(
        await archiveDraft({
          workspaceId,
          actorUserId,
          id,
        }),
      );
    },

    async requestApproval(
      workspaceId: string,
      actorUserId: string,
      id: string,
      input: RequestDraftApprovalInput,
    ): Promise<DraftApprovalRequestServiceResult> {
      return mapApprovalRequestResult(
        await requestDraftApproval({
          workspaceId,
          actorUserId,
          id,
          data: input,
        }),
      );
    },
  };
}
