import type {
  GmailExportBlockingReason,
  GmailExportLeaseStatus,
  GmailExportRecipientStatus,
  GmailExportRequestStatus,
  GmailExportStatus,
  GmailExportStatusOutput,
} from "@syrantis/shared";

import {
  findDraftGmailExportStatusRow,
  type DraftGmailExportStatusRow,
} from "../repositories/drafts-gmail-export-status.js";

export type GmailExportStatusServiceResult =
  | { result: "ok"; status: GmailExportStatusOutput }
  | { result: "not_found" };

export type GmailExportStatusService = {
  getGmailExportStatus(
    workspaceId: string,
    draftId: string,
  ): Promise<GmailExportStatusServiceResult>;
};

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function gmailExportMetadata(metadataJson: Record<string, unknown>): Record<string, unknown> {
  return metadataRecord(metadataJson.gmailExport);
}

function parseMetadataDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isEmailValidEnough(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed ?? "");
}

function recipientStatus(row: DraftGmailExportStatusRow): GmailExportRecipientStatus {
  if (!row.draft.leadId || !row.lead) {
    return "missing_lead";
  }

  if (!row.lead.contactId || !row.contact) {
    return "missing_contact";
  }

  if (!hasText(row.contact.email)) {
    return "missing_email";
  }

  if (!isEmailValidEnough(row.contact.email)) {
    return "invalid_email";
  }

  return "present";
}

function leaseStatus(input: {
  leaseToken: unknown;
  leaseExpiresAt: Date | null;
  now: Date;
}): GmailExportLeaseStatus {
  if (typeof input.leaseToken !== "string" || !input.leaseToken || !input.leaseExpiresAt) {
    return "none";
  }

  return input.leaseExpiresAt > input.now ? "active" : "expired";
}

function exportStatus(input: {
  status: unknown;
  exportedAt: Date | null;
  leaseStatus: GmailExportLeaseStatus;
}): GmailExportStatus {
  if (input.status === "exported" || input.exportedAt) {
    return "exported";
  }

  if (input.leaseStatus === "active") {
    return "leased";
  }

  if (input.leaseStatus === "expired") {
    return "lease_expired";
  }

  return "not_exported";
}

function requestStatus(input: {
  status: unknown;
  requestedAt: Date | null;
  requestExpiresAt: Date | null;
  cancelledAt: Date | null;
  exportedAt: Date | null;
  leaseStatus: GmailExportLeaseStatus;
  now: Date;
}): GmailExportRequestStatus {
  if (input.status === "exported" || input.exportedAt) {
    return "exported";
  }

  if (input.leaseStatus === "active") {
    return "leased";
  }

  if (input.status === "cancelled" || input.cancelledAt) {
    return "cancelled";
  }

  if (!input.requestedAt) {
    return "not_requested";
  }

  if (!input.requestExpiresAt || input.requestExpiresAt <= input.now) {
    return "request_expired";
  }

  return "requested";
}

function blockingReasons(input: {
  draftStatus: string;
  hasSubject: boolean;
  hasBodyText: boolean;
  recipientStatus: GmailExportRecipientStatus;
  requestStatus: GmailExportRequestStatus;
  leaseStatus: GmailExportLeaseStatus;
  exportStatus: GmailExportStatus;
  emailSendsCount: number;
}): GmailExportBlockingReason[] {
  const reasons: GmailExportBlockingReason[] = [];

  if (input.draftStatus !== "draft") {
    reasons.push("draft_not_ready");
  }

  if (!input.hasSubject) {
    reasons.push("missing_subject");
  }

  if (!input.hasBodyText) {
    reasons.push("missing_body");
  }

  if (input.recipientStatus === "missing_lead") {
    reasons.push("missing_lead");
  }

  if (input.recipientStatus === "missing_contact") {
    reasons.push("missing_contact");
  }

  if (input.recipientStatus === "missing_email") {
    reasons.push("missing_email");
  }

  if (input.recipientStatus === "invalid_email") {
    reasons.push("invalid_email");
  }

  if (input.requestStatus === "not_requested") {
    reasons.push("export_not_requested");
  }

  if (input.requestStatus === "request_expired") {
    reasons.push("export_request_expired");
  }

  if (input.requestStatus === "cancelled") {
    reasons.push("export_cancelled");
  }

  if (input.leaseStatus === "active" || input.requestStatus === "leased") {
    reasons.push("export_in_progress");
  }

  if (input.exportStatus === "exported") {
    reasons.push("already_exported");
  }

  if (input.emailSendsCount > 0) {
    reasons.push("has_email_sends");
  }

  return reasons;
}

function deriveGmailExportStatus(
  row: DraftGmailExportStatusRow,
  now: Date,
): GmailExportStatusOutput {
  const metadataJson = metadataRecord(row.draft.metadataJson);
  const gmailExport = gmailExportMetadata(metadataJson);
  const exportedAtDate = parseMetadataDate(gmailExport.exportedAt);
  const leaseExpiresAtDate = parseMetadataDate(gmailExport.leaseExpiresAt);
  const requestedAtDate = parseMetadataDate(gmailExport.requestedAt);
  const requestExpiresAtDate = parseMetadataDate(gmailExport.requestExpiresAt);
  const cancelledAtDate = parseMetadataDate(gmailExport.cancelledAt);
  const resolvedLeaseStatus = leaseStatus({
    leaseToken: gmailExport.leaseToken,
    leaseExpiresAt: leaseExpiresAtDate,
    now,
  });
  const resolvedExportStatus = exportStatus({
    status: gmailExport.status,
    exportedAt: exportedAtDate,
    leaseStatus: resolvedLeaseStatus,
  });
  const resolvedRequestStatus = requestStatus({
    status: gmailExport.status,
    requestedAt: requestedAtDate,
    requestExpiresAt: requestExpiresAtDate,
    cancelledAt: cancelledAtDate,
    exportedAt: exportedAtDate,
    leaseStatus: resolvedLeaseStatus,
    now,
  });
  const resolvedRecipientStatus = recipientStatus(row);
  const hasSubject = hasText(row.draft.subject);
  const hasBodyText = hasText(row.draft.textBody);
  const reasons = blockingReasons({
    draftStatus: row.draft.status,
    hasSubject,
    hasBodyText,
    recipientStatus: resolvedRecipientStatus,
    requestStatus: resolvedRequestStatus,
    leaseStatus: resolvedLeaseStatus,
    exportStatus: resolvedExportStatus,
    emailSendsCount: row.emailSendsCount,
  });

  return {
    draftId: row.draft.id,
    leadId: row.draft.leadId,
    draftStatus: row.draft.status,
    hasSubject,
    hasBodyText,
    recipientStatus: resolvedRecipientStatus,
    requestStatus: resolvedRequestStatus,
    requestedAt: requestedAtDate?.toISOString() ?? null,
    requestExpiresAt: requestExpiresAtDate?.toISOString() ?? null,
    requestSource: gmailExport.requestSource === "admin_api" ? "admin_api" : null,
    exportStatus: resolvedExportStatus,
    exportSource: gmailExport.source === "apps_script" ? "apps_script" : null,
    exportedAt: exportedAtDate?.toISOString() ?? null,
    leaseStatus: resolvedLeaseStatus,
    leaseExpiresAt: leaseExpiresAtDate?.toISOString() ?? null,
    canExport:
      row.draft.status === "draft" &&
      hasSubject &&
      hasBodyText &&
      resolvedRecipientStatus === "present" &&
      resolvedRequestStatus === "requested" &&
      (resolvedExportStatus === "not_exported" || resolvedExportStatus === "lease_expired") &&
      resolvedLeaseStatus !== "active" &&
      row.emailSendsCount === 0,
    blockingReasons: reasons,
    sideEffects: {
      emailSendsCount: row.emailSendsCount,
      approvalsCount: row.approvalsCount,
    },
  };
}

export async function getGmailExportStatus(
  workspaceId: string,
  draftId: string,
): Promise<GmailExportStatusServiceResult> {
  const row = await findDraftGmailExportStatusRow({ workspaceId, draftId });

  if (!row) {
    return { result: "not_found" };
  }

  return {
    result: "ok",
    status: deriveGmailExportStatus(row, new Date()),
  };
}

export function createProductionGmailExportStatusService(): GmailExportStatusService {
  return {
    getGmailExportStatus,
  };
}
