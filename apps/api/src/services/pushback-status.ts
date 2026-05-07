import {
  PushbackStatusResponseSchema,
  type PushbackCanReplayReason,
  type PushbackEventType,
  type PushbackLatestSource,
  type PushbackStatus,
  type PushbackStatusResponse,
} from "@syrantis/shared";

import {
  findDraftPushbackStatusRecord,
  findEmailSendPushbackStatusRecord,
  type PushbackStatusActivityLogRow,
  type PushbackStatusEmailSendRow,
} from "../repositories/pushback-status.js";

export type PushbackStatusServiceResult =
  | { result: "ok"; status: PushbackStatusResponse }
  | { result: "not_found" };

export type PushbackStatusService = {
  getEmailSendPushbackStatus(
    workspaceId: string,
    emailSendId: string,
  ): Promise<PushbackStatusServiceResult>;
  getDraftPushbackStatus(
    workspaceId: string,
    draftId: string,
  ): Promise<PushbackStatusServiceResult>;
};

const deliveryStatuses = new Set(["delivered", "bounced", "complained"]);

const errorSummaries: Record<string, string> = {
  PUSHBACK_DISABLED: "Google Sheets push-back is disabled.",
  PUSHBACK_MISSING_CREDENTIALS: "Google Sheets push-back credentials are missing or invalid.",
  PUSHBACK_MISSING_SPREADSHEET_ID: "Google Sheets push-back spreadsheet ID is missing.",
  PUSHBACK_MISSING_RANGE: "Google Sheets push-back range is missing.",
  PUSHBACK_EMAIL_SEND_NOT_SENT: "Email send is not in a sent state.",
  PUSHBACK_DELIVERY_STATUS_MISSING: "Email send does not have a delivery status to replay.",
  PUSHBACK_AUTH_FAILED: "Google Sheets authentication or authorization failed.",
  PUSHBACK_SPREADSHEET_NOT_FOUND:
    "Google Sheets spreadsheet was not found or is not shared with the service account.",
  PUSHBACK_RANGE_INVALID: "Google Sheets push-back range is invalid.",
  PUSHBACK_APPEND_FAILED: "Google Sheets append failed.",
  PUSHBACK_TIMEOUT: "Google Sheets push-back timed out.",
  PUSHBACK_UNKNOWN_ERROR: "Google Sheets push-back failed for an unknown reason.",
};

function isDeliveryProofAvailable(status: string | null): boolean {
  return typeof status === "string" && deliveryStatuses.has(status);
}

function readString(
  metadata: Record<string, unknown>,
  key: string,
  maxLength = 240,
): string | null {
  const value = metadata[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function readNonNegativeInteger(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readDiagnosticTraceId(metadata: Record<string, unknown>): string | null {
  const value = readString(metadata, "diagnosticTraceId", 80);
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function readErrorCode(metadata: Record<string, unknown>): string | null {
  const value = readString(metadata, "errorCode", 120);
  return value && /^PUSHBACK_[A-Z0-9_]+$/.test(value) ? value : null;
}

function readErrorSummary(errorCode: string | null): string | null {
  return errorCode ? (errorSummaries[errorCode] ?? null) : null;
}

function readSource(metadata: Record<string, unknown>): PushbackLatestSource {
  const source = readString(metadata, "source", 80);

  if (source === "manual_replay") {
    return "manual_replay";
  }

  if (source === "delivery_webhook" || source === "webhook") {
    return "delivery_webhook";
  }

  if (source === "system") {
    return "system";
  }

  return "unknown";
}

function pushbackStatusForEvent(
  eventType: PushbackEventType,
): Extract<PushbackStatus, "succeeded" | "failed" | "skipped"> {
  if (eventType === "crm_pushback.succeeded") {
    return "succeeded";
  }

  if (eventType === "crm_pushback.failed") {
    return "failed";
  }

  return "skipped";
}

function canReplayReasonForSend(
  emailSend: PushbackStatusEmailSendRow,
): PushbackCanReplayReason | null {
  if (emailSend.status === "pending" || emailSend.status === "queued") {
    return "send_not_terminal";
  }

  if (emailSend.status === "failed") {
    return "send_failed";
  }

  if (emailSend.status === "cancelled") {
    return "send_cancelled";
  }

  if (emailSend.status === "sent" && !isDeliveryProofAvailable(emailSend.deliveryStatus)) {
    return "missing_delivery_proof";
  }

  return null;
}

function stateStatusForSend(emailSend: PushbackStatusEmailSendRow): PushbackStatus | null {
  if (emailSend.status === "pending" || emailSend.status === "queued") {
    return "send_not_terminal";
  }

  if (emailSend.status === "failed") {
    return "send_failed";
  }

  if (emailSend.status === "cancelled") {
    return "send_cancelled";
  }

  if (emailSend.status === "sent" && !isDeliveryProofAvailable(emailSend.deliveryStatus)) {
    return "no_delivery_proof";
  }

  return null;
}

function replayEndpoint(emailSendId: string, canReplay: boolean): string | null {
  return canReplay ? `/api/email-sends/${emailSendId}/pushback-replay` : null;
}

function buildDiagnostic(
  log: PushbackStatusActivityLogRow | null,
): PushbackStatusResponse["pushback"]["diagnostic"] {
  if (!log) {
    return null;
  }

  const errorCode = readErrorCode(log.metadataJson);

  return {
    diagnosticTraceId: readDiagnosticTraceId(log.metadataJson),
    errorCode,
    errorSummary: readErrorSummary(errorCode),
    durationMs: readNonNegativeInteger(log.metadataJson, "durationMs"),
    maskedSpreadsheetId: readString(log.metadataJson, "maskedSpreadsheetId", 80),
    range: readString(log.metadataJson, "range", 160),
  };
}

function historyEntry(
  log: PushbackStatusActivityLogRow,
): PushbackStatusResponse["pushback"]["recentHistory"][number] {
  return {
    eventType: log.type,
    source: readSource(log.metadataJson),
    occurredAt: log.createdAt.toISOString(),
    diagnosticTraceId: readDiagnosticTraceId(log.metadataJson),
    errorCode: readErrorCode(log.metadataJson),
  };
}

function buildNoSendResponse(draftId: string): PushbackStatusResponse {
  return PushbackStatusResponseSchema.parse({
    target: {
      type: "draft",
      draftId,
      emailSendId: null,
      resolvedFromDraft: true,
    },
    send: {
      exists: false,
      status: null,
      deliveryStatus: null,
      deliveryProofAvailable: false,
      requestedAt: null,
      sentAt: null,
      updatedAt: null,
    },
    pushback: {
      status: "no_send",
      latestEventType: null,
      latestSource: null,
      latestAt: null,
      canReplay: false,
      canReplayReason: "no_email_send",
      replay: {
        emailSendId: null,
        endpoint: null,
      },
      diagnostic: null,
      counts: {
        totalPushbackEvents: 0,
        manualReplayEvents: 0,
      },
      recentHistory: [],
    },
  });
}

function buildEmailSendResponse(input: {
  targetType: "draft" | "email_send";
  resolvedFromDraft: boolean;
  draftId: string;
  emailSend: PushbackStatusEmailSendRow;
  pushbackLogs: PushbackStatusActivityLogRow[];
}): PushbackStatusResponse {
  const latestLog = input.pushbackLogs[0] ?? null;
  const stateStatus = stateStatusForSend(input.emailSend);
  const canReplay =
    input.emailSend.status === "sent" && isDeliveryProofAvailable(input.emailSend.deliveryStatus);
  const latestEventStatus = latestLog ? pushbackStatusForEvent(latestLog.type) : null;
  const status: PushbackStatus =
    stateStatus ?? latestEventStatus ?? (canReplay ? "not_pushed" : "unknown");
  const canReplayReason = canReplay ? null : canReplayReasonForSend(input.emailSend);

  return PushbackStatusResponseSchema.parse({
    target: {
      type: input.targetType,
      draftId: input.draftId,
      emailSendId: input.emailSend.id,
      resolvedFromDraft: input.resolvedFromDraft,
    },
    send: {
      exists: true,
      status: input.emailSend.status,
      deliveryStatus: input.emailSend.deliveryStatus,
      deliveryProofAvailable: isDeliveryProofAvailable(input.emailSend.deliveryStatus),
      requestedAt: input.emailSend.createdAt.toISOString(),
      sentAt: input.emailSend.sentAt?.toISOString() ?? null,
      updatedAt: input.emailSend.updatedAt.toISOString(),
    },
    pushback: {
      status,
      latestEventType: latestLog?.type ?? null,
      latestSource: latestLog ? readSource(latestLog.metadataJson) : null,
      latestAt: latestLog?.createdAt.toISOString() ?? null,
      canReplay,
      canReplayReason,
      replay: {
        emailSendId: canReplay ? input.emailSend.id : null,
        endpoint: replayEndpoint(input.emailSend.id, canReplay),
      },
      diagnostic: buildDiagnostic(latestLog),
      counts: {
        totalPushbackEvents: input.pushbackLogs.length,
        manualReplayEvents: input.pushbackLogs.filter(
          (log) => readSource(log.metadataJson) === "manual_replay",
        ).length,
      },
      recentHistory: input.pushbackLogs.slice(0, 5).map(historyEntry),
    },
  });
}

export async function getEmailSendPushbackStatus(
  workspaceId: string,
  emailSendId: string,
): Promise<PushbackStatusServiceResult> {
  const record = await findEmailSendPushbackStatusRecord({ workspaceId, emailSendId });

  if (!record) {
    return { result: "not_found" };
  }

  return {
    result: "ok",
    status: buildEmailSendResponse({
      targetType: "email_send",
      resolvedFromDraft: false,
      draftId: record.emailSend.draftId,
      emailSend: record.emailSend,
      pushbackLogs: record.pushbackLogs,
    }),
  };
}

export async function getDraftPushbackStatus(
  workspaceId: string,
  draftId: string,
): Promise<PushbackStatusServiceResult> {
  const record = await findDraftPushbackStatusRecord({ workspaceId, draftId });

  if (!record) {
    return { result: "not_found" };
  }

  if (!record.latestEmailSend) {
    return { result: "ok", status: buildNoSendResponse(record.draft.id) };
  }

  return {
    result: "ok",
    status: buildEmailSendResponse({
      targetType: "draft",
      resolvedFromDraft: true,
      draftId: record.draft.id,
      emailSend: record.latestEmailSend,
      pushbackLogs: record.pushbackLogs,
    }),
  };
}

export function createProductionPushbackStatusService(): PushbackStatusService {
  return {
    getEmailSendPushbackStatus,
    getDraftPushbackStatus,
  };
}
