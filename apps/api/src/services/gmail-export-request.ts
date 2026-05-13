import type {
  GmailExportCancelResponse,
  GmailExportRequestConflictErrorCode,
  GmailExportRequestResponse,
} from "@syrantis/shared";

import {
  cancelGmailExport as cancelGmailExportInRepository,
  requestGmailExport as requestGmailExportInRepository,
  type GmailExportCancelResult,
  type GmailExportRequestResult,
} from "../repositories/drafts-gmail-export.js";

export type GmailExportRequestServiceResult =
  | { result: "ok"; data: GmailExportRequestResponse["data"] }
  | { result: "not_found" }
  | { result: "conflict"; code: GmailExportRequestConflictErrorCode };

export type GmailExportCancelServiceResult =
  | { result: "ok"; data: GmailExportCancelResponse["data"] }
  | { result: "not_found" }
  | { result: "conflict"; code: GmailExportRequestConflictErrorCode };

export type GmailExportRequestService = {
  requestGmailExport(
    workspaceId: string,
    actorUserId: string,
    draftId: string,
  ): Promise<GmailExportRequestServiceResult>;
  cancelGmailExport(
    workspaceId: string,
    actorUserId: string,
    draftId: string,
  ): Promise<GmailExportCancelServiceResult>;
};

function conflictCode(
  result: Extract<GmailExportRequestResult | GmailExportCancelResult, { result: "conflict" }>,
): GmailExportRequestConflictErrorCode {
  switch (result.reason) {
    case "active_lease":
      return "GMAIL_EXPORT_ACTIVE_LEASE";
    case "already_exported":
      return "GMAIL_EXPORT_ALREADY_EXPORTED";
    case "has_email_sends":
      return "GMAIL_EXPORT_HAS_EMAIL_SENDS";
    case "missing_content":
      return "GMAIL_EXPORT_MISSING_CONTENT";
    case "missing_recipient":
      return "GMAIL_EXPORT_MISSING_RECIPIENT";
    case "no_active_request":
      return "GMAIL_EXPORT_NO_ACTIVE_REQUEST";
    case "non_draft_status":
      return "GMAIL_EXPORT_DRAFT_NOT_READY";
  }
}

export async function requestGmailExport(
  workspaceId: string,
  actorUserId: string,
  draftId: string,
): Promise<GmailExportRequestServiceResult> {
  const result = await requestGmailExportInRepository({
    workspaceId,
    actorUserId,
    draftId,
  });

  if (result.result === "not_found") {
    return { result: "not_found" };
  }

  if (result.result === "conflict") {
    return { result: "conflict", code: conflictCode(result) };
  }

  return {
    result: "ok",
    data: {
      draftId: result.draftId,
      leadId: result.leadId,
      requestStatus: result.alreadyRequested ? "already_requested" : "requested",
      requestedAt: result.requestedAt.toISOString(),
      requestExpiresAt: result.requestExpiresAt.toISOString(),
      canExport: true,
    },
  };
}

export async function cancelGmailExport(
  workspaceId: string,
  actorUserId: string,
  draftId: string,
): Promise<GmailExportCancelServiceResult> {
  const result = await cancelGmailExportInRepository({
    workspaceId,
    actorUserId,
    draftId,
  });

  if (result.result === "not_found") {
    return { result: "not_found" };
  }

  if (result.result === "conflict") {
    return { result: "conflict", code: conflictCode(result) };
  }

  return {
    result: "ok",
    data: {
      draftId: result.draftId,
      leadId: result.leadId,
      requestStatus: "cancelled",
      cancelledAt: result.cancelledAt.toISOString(),
    },
  };
}

export function createProductionGmailExportRequestService(): GmailExportRequestService {
  return {
    requestGmailExport,
    cancelGmailExport,
  };
}
