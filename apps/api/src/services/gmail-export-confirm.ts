import type {
  GmailExportConfirmResponse,
  GmailExportConflictErrorCode,
} from "@syrantis/shared";

import {
  confirmGmailExport as confirmGmailExportInRepository,
  type GmailExportConfirmResult,
} from "../repositories/drafts-gmail-export.js";

export type GmailExportConfirmServiceResult =
  | { result: "ok"; data: GmailExportConfirmResponse["data"] }
  | { result: "not_found" }
  | { result: "conflict"; code: GmailExportConflictErrorCode };

export type GmailExportConfirmService = {
  confirmGmailExport(
    workspaceId: string,
    draftId: string,
    leaseToken: string,
  ): Promise<GmailExportConfirmServiceResult>;
};

function conflictCode(
  result: Extract<GmailExportConfirmResult, { result: "conflict" }>,
): GmailExportConflictErrorCode {
  switch (result.reason) {
    case "lease_expired":
      return "GMAIL_EXPORT_LEASE_EXPIRED";
    case "lease_mismatch":
      return "GMAIL_EXPORT_LEASE_MISMATCH";
    case "missing_lease":
      return "GMAIL_EXPORT_LEASE_MISSING";
  }
}

export async function confirmGmailExport(
  workspaceId: string,
  draftId: string,
  leaseToken: string,
): Promise<GmailExportConfirmServiceResult> {
  const result = await confirmGmailExportInRepository({
    workspaceId,
    draftId,
    leaseToken,
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
      status: "exported",
      alreadyExported: result.alreadyExported,
      exportedAt: result.exportedAt.toISOString(),
    },
  };
}

export function createProductionGmailExportConfirmService(): GmailExportConfirmService {
  return {
    confirmGmailExport,
  };
}
