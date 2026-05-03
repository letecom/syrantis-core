import type { DraftSendAttemptsOutput, DraftSendAttemptsQuery } from "@syrantis/shared";

import {
  findDraftSendHistoryRecord,
  type DraftSendHistoryRow,
} from "../repositories/draft-send-history.js";

export type DraftSendHistoryServiceResult =
  | { result: "ok"; history: DraftSendAttemptsOutput }
  | { result: "not_found" };

export type DraftSendHistoryService = {
  getDraftSendHistory(
    workspaceId: string,
    draftId: string,
    query: DraftSendAttemptsQuery,
  ): Promise<DraftSendHistoryServiceResult>;
};

function mapAttempt(
  row: DraftSendHistoryRow,
  attemptNumber: number,
): DraftSendAttemptsOutput["attempts"][number] {
  return {
    attemptNumber,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    errorCode: row.lastErrorCode,
  };
}

export async function getDraftSendHistory(
  workspaceId: string,
  draftId: string,
  query: DraftSendAttemptsQuery,
): Promise<DraftSendHistoryServiceResult> {
  const offset = (query.page - 1) * query.pageSize;
  const record = await findDraftSendHistoryRecord({
    workspaceId,
    draftId,
    limit: query.pageSize,
    offset,
  });

  if (!record) {
    return { result: "not_found" };
  }

  const totalPages =
    record.totalItems === 0 ? 0 : Math.ceil(record.totalItems / query.pageSize);

  return {
    result: "ok",
    history: {
      draftId: record.draft.id,
      attempts: record.attempts.map((attempt, index) =>
        mapAttempt(attempt, offset + index + 1),
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: record.totalItems,
        totalPages,
        hasMore: offset + record.attempts.length < record.totalItems,
      },
    },
  };
}

export function createProductionDraftSendHistoryService(): DraftSendHistoryService {
  return {
    getDraftSendHistory,
  };
}
