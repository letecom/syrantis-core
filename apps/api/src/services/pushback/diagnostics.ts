import { randomUUID } from "node:crypto";

import { createActivityLog } from "../../repositories/activity-logs.js";
import { withWorkspaceDb } from "../../lib/db.js";

export type PushbackErrorCode =
  | "PUSHBACK_DISABLED"
  | "PUSHBACK_MISSING_CREDENTIALS"
  | "PUSHBACK_MISSING_SPREADSHEET_ID"
  | "PUSHBACK_MISSING_RANGE"
  | "PUSHBACK_EMAIL_SEND_NOT_SENT"
  | "PUSHBACK_DELIVERY_STATUS_MISSING"
  | "PUSHBACK_AUTH_FAILED"
  | "PUSHBACK_SPREADSHEET_NOT_FOUND"
  | "PUSHBACK_RANGE_INVALID"
  | "PUSHBACK_APPEND_FAILED"
  | "PUSHBACK_TIMEOUT"
  | "PUSHBACK_UNKNOWN_ERROR";

export type PushbackActivityLogType =
  | "crm_pushback.skipped"
  | "crm_pushback.succeeded"
  | "crm_pushback.failed";

const errorSummaries: Record<PushbackErrorCode, string> = {
  PUSHBACK_DISABLED: "Google Sheets push-back is disabled.",
  PUSHBACK_MISSING_CREDENTIALS: "Google Sheets push-back credentials are missing or invalid.",
  PUSHBACK_MISSING_SPREADSHEET_ID: "Google Sheets push-back spreadsheet ID is missing.",
  PUSHBACK_MISSING_RANGE: "Google Sheets push-back range is missing.",
  PUSHBACK_EMAIL_SEND_NOT_SENT: "Email send is not in a sent state.",
  PUSHBACK_DELIVERY_STATUS_MISSING: "Email send does not have a delivery status to replay.",
  PUSHBACK_AUTH_FAILED: "Google Sheets authentication or authorization failed.",
  PUSHBACK_SPREADSHEET_NOT_FOUND: "Google Sheets spreadsheet was not found or is not shared with the service account.",
  PUSHBACK_RANGE_INVALID: "Google Sheets push-back range is invalid.",
  PUSHBACK_APPEND_FAILED: "Google Sheets append failed.",
  PUSHBACK_TIMEOUT: "Google Sheets push-back timed out.",
  PUSHBACK_UNKNOWN_ERROR: "Google Sheets push-back failed for an unknown reason."
};

type ErrorRecord = Record<string, unknown>;

export function createDiagnosticTraceId(): string {
  return randomUUID();
}

export function errorSummaryForCode(errorCode: PushbackErrorCode): string {
  return errorSummaries[errorCode];
}

export function maskSpreadsheetId(id: string): string {
  if (id.length <= 8) {
    return "***";
  }

  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

function isRecord(value: unknown): value is ErrorRecord {
  return Boolean(value) && typeof value === "object";
}

function collectErrorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (!isRecord(error)) {
    return "";
  }

  const parts: string[] = [];
  for (const key of ["name", "code", "message", "statusText"] as const) {
    const value = error[key];
    if (typeof value === "string") {
      parts.push(value);
    }
  }

  const response = error.response;
  if (isRecord(response)) {
    const responseData = response.data;
    if (typeof responseData === "string") {
      parts.push(responseData);
    } else if (isRecord(responseData)) {
      for (const key of ["error", "message", "status"] as const) {
        const value = responseData[key];
        if (typeof value === "string") {
          parts.push(value);
        }
      }
    }
  }

  const cause = error.cause;
  if (cause && cause !== error) {
    parts.push(collectErrorText(cause));
  }

  return parts.join(" ");
}

function readStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  for (const value of [error.status, error.statusCode, error.code]) {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && /^\d{3}$/.test(value)) {
      return Number(value);
    }
  }

  const response = error.response;
  if (isRecord(response)) {
    for (const value of [response.status, response.statusCode]) {
      if (typeof value === "number") {
        return value;
      }

      if (typeof value === "string" && /^\d{3}$/.test(value)) {
        return Number(value);
      }
    }
  }

  return null;
}

function classifyCode(error: unknown): PushbackErrorCode {
  const status = readStatus(error);
  const text = collectErrorText(error).toLowerCase();

  if (text.includes("aborterror") || text.includes("etimedout") || text.includes("econnaborted") || text.includes("timeout")) {
    return "PUSHBACK_TIMEOUT";
  }

  if (status === 401 || status === 403 || text.includes("unauthorized") || text.includes("forbidden")) {
    return "PUSHBACK_AUTH_FAILED";
  }

  const rangeSignal = text.includes("range") || text.includes("unable to parse") || text.includes("a1 notation");
  const spreadsheetSignal = text.includes("spreadsheet") || text.includes("not found") || text.includes("requested entity was not found");

  if (status === 400 || (status === 404 && rangeSignal)) {
    return "PUSHBACK_RANGE_INVALID";
  }

  if (status === 404 && spreadsheetSignal) {
    return "PUSHBACK_SPREADSHEET_NOT_FOUND";
  }

  if (isRecord(error) && error.phase === "google_sheets_append") {
    return "PUSHBACK_APPEND_FAILED";
  }

  if (status !== null) {
    return "PUSHBACK_APPEND_FAILED";
  }

  return "PUSHBACK_UNKNOWN_ERROR";
}

export function classifyPushbackError(error: unknown): { errorCode: PushbackErrorCode; errorSummary: string } {
  const errorCode = classifyCode(error);
  return {
    errorCode,
    errorSummary: errorSummaryForCode(errorCode)
  };
}

type PushbackMetadataBase = {
  diagnosticTraceId: string;
  emailSendId: string;
  draftId?: string | null;
  leadId?: string | null;
  source?: "manual_replay" | undefined;
  deliveryStatus?: string | null | undefined;
  sendStatus?: string | null | undefined;
};

function compactBaseMetadata(input: PushbackMetadataBase): Record<string, unknown> {
  return {
    ...(input.source ? { source: input.source } : {}),
    diagnosticTraceId: input.diagnosticTraceId,
    emailSendId: input.emailSendId,
    ...(input.draftId ? { draftId: input.draftId } : {}),
    ...(input.leadId ? { leadId: input.leadId } : {}),
    ...(input.deliveryStatus ? { deliveryStatus: input.deliveryStatus } : {}),
    ...(input.sendStatus ? { sendStatus: input.sendStatus } : {})
  };
}

export function buildPushbackSkippedMetadata(input: PushbackMetadataBase & {
  errorCode: PushbackErrorCode;
  durationMs: number;
}): Record<string, unknown> {
  return {
    ...compactBaseMetadata(input),
    errorCode: input.errorCode,
    errorSummary: errorSummaryForCode(input.errorCode),
    durationMs: input.durationMs
  };
}

export function buildPushbackSucceededMetadata(input: PushbackMetadataBase & {
  spreadsheetId: string;
  range: string;
  columnsAppended: number;
  durationMs: number;
}): Record<string, unknown> {
  return {
    ...compactBaseMetadata(input),
    maskedSpreadsheetId: maskSpreadsheetId(input.spreadsheetId),
    range: input.range,
    columnsAppended: input.columnsAppended,
    durationMs: input.durationMs
  };
}

export function buildPushbackFailedMetadata(input: PushbackMetadataBase & {
  spreadsheetId?: string | null | undefined;
  range?: string | null | undefined;
  errorCode: PushbackErrorCode;
  durationMs: number;
}): Record<string, unknown> {
  return {
    ...compactBaseMetadata(input),
    ...(input.spreadsheetId ? { maskedSpreadsheetId: maskSpreadsheetId(input.spreadsheetId) } : {}),
    ...(input.range ? { range: input.range } : {}),
    errorCode: input.errorCode,
    errorSummary: errorSummaryForCode(input.errorCode),
    durationMs: input.durationMs
  };
}

export async function logPushbackDiagnosticActivity(input: {
  workspaceId: string;
  emailSendId: string;
  action: PushbackActivityLogType;
  metadataJson: Record<string, unknown>;
}): Promise<void> {
  try {
    await withWorkspaceDb(input.workspaceId, async (tx) => {
      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        action: input.action,
        entityType: "email_send",
        entityId: input.emailSendId,
        metadataJson: input.metadataJson
      });
    });
  } catch {
    console.warn(`Google Sheets push-back diagnostic log failed for ${input.action}.`);
  }
}
