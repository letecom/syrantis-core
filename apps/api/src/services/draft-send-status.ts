import type { DraftSendStatusOutput } from "@syrantis/shared";

import {
  findDraftSendStatusRecord,
  type DraftSendStatusLatestSendRow,
} from "../repositories/draft-send-status.js";

export type DraftSendStatusServiceResult =
  | { result: "ok"; status: DraftSendStatusOutput }
  | { result: "not_found" };

export type DraftSendStatusService = {
  getDraftSendStatus(workspaceId: string, draftId: string): Promise<DraftSendStatusServiceResult>;
};

function mapLatestSend(row: DraftSendStatusLatestSendRow): DraftSendStatusOutput["latestSend"] {
  return {
    status: row.status,
    requestedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    errorCode: row.lastErrorCode,
    deliveryStatus: row.deliveryStatus ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    bouncedAt: row.bouncedAt?.toISOString() ?? null,
    complainedAt: row.complainedAt?.toISOString() ?? null,
    deliveryErrorCode: row.deliveryErrorCode ?? null,
  };
}

export async function getDraftSendStatus(
  workspaceId: string,
  draftId: string,
): Promise<DraftSendStatusServiceResult> {
  const record = await findDraftSendStatusRecord({ workspaceId, draftId });

  if (!record) {
    return { result: "not_found" };
  }

  return {
    result: "ok",
    status: {
      draftId: record.draft.id,
      hasSend: Boolean(record.latestSend),
      latestSend: record.latestSend ? mapLatestSend(record.latestSend) : null,
    },
  };
}

export function createProductionDraftSendStatusService(): DraftSendStatusService {
  return {
    getDraftSendStatus,
  };
}
