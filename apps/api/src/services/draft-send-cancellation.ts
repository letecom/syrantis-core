import type { DraftSendCancellationOutput, EmailSendStatus } from "@syrantis/shared";

import {
  cancelLatestDraftSend,
  type DraftSendCancellationResult,
} from "../repositories/draft-send-cancellation.js";

export type DraftSendCancellationServiceResult =
  | { result: "ok"; cancellation: DraftSendCancellationOutput }
  | { result: "not_found" }
  | {
      result: "not_allowed";
      reason: "NO_SEND_TO_CANCEL" | "SEND_NOT_PENDING" | "SEND_JOB_NOT_PENDING";
      currentStatus: EmailSendStatus | null;
    };

export type DraftSendCancellationService = {
  cancelLatestDraftSend(
    workspaceId: string,
    actorUserId: string,
    draftId: string,
  ): Promise<DraftSendCancellationServiceResult>;
};

function mapCancellation(
  result: Extract<DraftSendCancellationResult, { result: "ok" }>["cancellation"],
): DraftSendCancellationOutput {
  return {
    draftId: result.draftId,
    emailSendId: result.emailSendId,
    previousStatus: result.previousStatus,
    currentStatus: result.currentStatus,
    cancelled: result.cancelled,
    cancelledAt: result.cancelledAt?.toISOString() ?? null,
  };
}

export async function cancelDraftSend(
  workspaceId: string,
  actorUserId: string,
  draftId: string,
): Promise<DraftSendCancellationServiceResult> {
  const result = await cancelLatestDraftSend({ workspaceId, actorUserId, draftId });

  if (result.result === "ok") {
    return {
      result: "ok",
      cancellation: mapCancellation(result.cancellation),
    };
  }

  return result;
}

export function createProductionDraftSendCancellationService(): DraftSendCancellationService {
  return {
    cancelLatestDraftSend: cancelDraftSend,
  };
}
