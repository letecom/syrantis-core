import { GoogleAuth } from "google-auth-library";
import {
  PushbackLeadScoreJobPayloadSchema,
  type PushbackLeadScoreJobPayload,
} from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import {
  findLeadForLeadScorePushback,
  findScoreForLeadScorePushback,
  hasSucceededLeadScorePushback,
  type LeadScorePushbackLeadRow,
  type LeadScorePushbackScoreRow,
} from "../repositories/lead-score-pushback.js";
import { maskSpreadsheetId } from "./pushback/diagnostics.js";
import { parseGoogleSheetsCredentials } from "./pushback/google-sheets.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCORE_LOG_RANGE = "Score_Log!A:P";
const APPEND_TIMEOUT_MS = 10_000;

export const LeadScorePushbackErrorCodes = [
  "CONFIG_MISSING",
  "PUSHBACK_DISABLED",
  "LEAD_NOT_FOUND",
  "SCORE_NOT_FOUND",
  "ROW_BUILD_FAILED",
  "GOOGLE_SHEETS_AUTH_FAILED",
  "GOOGLE_SHEETS_SPREADSHEET_NOT_FOUND",
  "GOOGLE_SHEETS_RANGE_INVALID",
  "GOOGLE_SHEETS_RATE_LIMITED",
  "GOOGLE_SHEETS_APPEND_FAILED",
  "GOOGLE_SHEETS_TIMEOUT",
  "GOOGLE_SHEETS_UNKNOWN_ERROR",
] as const;

export type LeadScorePushbackErrorCode = (typeof LeadScorePushbackErrorCodes)[number];
export type LeadScorePushbackSkippedReason =
  | "ALREADY_PUSHED"
  | "CONFIG_MISSING"
  | "SCORE_NOT_FOUND"
  | "LEAD_NOT_FOUND"
  | "PUSHBACK_DISABLED";

export type HandleLeadScorePushbackJobInput = {
  workspaceId: string;
  jobId: string;
  payload: PushbackLeadScoreJobPayload;
};

export type HandleLeadScorePushbackJobResult =
  | { result: "succeeded" }
  | { result: "skipped"; reason: LeadScorePushbackSkippedReason };

export class LeadScorePushbackJobError extends Error {
  code: LeadScorePushbackErrorCode;

  constructor(code: LeadScorePushbackErrorCode) {
    super(code);
    this.name = "LeadScorePushbackJobError";
    this.code = code;
  }
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function safeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function formulaSafe(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function sheetText(value: unknown, maxLength: number): string {
  return formulaSafe(truncate(safeString(value), maxLength));
}

function normalizedString(
  normalizedJson: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  return sheetText(normalizedJson[key], maxLength);
}

export function buildLeadScorePushbackRow(input: {
  lead: LeadScorePushbackLeadRow;
  score: LeadScorePushbackScoreRow;
  diagnosticTraceId: string | null;
  syncedAt: Date;
}): unknown[] {
  const normalizedJson = input.lead.normalizedJson ?? {};
  const source = normalizedJson.source ?? input.lead.source;

  return [
    "score_pushback",
    input.score.createdAt.toISOString(),
    input.lead.id,
    normalizedString(normalizedJson, "externalId", 255),
    sheetText(source, 200),
    normalizedString(normalizedJson, "fromEmail", 200),
    normalizedString(normalizedJson, "contactName", 200),
    normalizedString(normalizedJson, "subject", 500),
    input.score.score,
    sheetText(input.score.qualification, 100),
    normalizedString(normalizedJson, "intent", 200),
    normalizedString(normalizedJson, "urgency", 200),
    input.score.confidence,
    sheetText(input.score.recommendedAction, 500),
    sheetText(input.diagnosticTraceId, 80),
    input.syncedAt.toISOString(),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

  return null;
}

function classifyLeadScorePushbackError(error: unknown): LeadScorePushbackErrorCode {
  if (error instanceof LeadScorePushbackJobError) {
    return error.code;
  }

  const status = readStatus(error);
  const text = collectErrorText(error).toLowerCase();

  if (
    text.includes("aborterror") ||
    text.includes("etimedout") ||
    text.includes("econnaborted") ||
    text.includes("timeout")
  ) {
    return "GOOGLE_SHEETS_TIMEOUT";
  }

  if (
    status === 401 ||
    status === 403 ||
    text.includes("unauthorized") ||
    text.includes("forbidden")
  ) {
    return "GOOGLE_SHEETS_AUTH_FAILED";
  }

  if (status === 429) {
    return "GOOGLE_SHEETS_RATE_LIMITED";
  }

  const rangeSignal =
    text.includes("range") || text.includes("unable to parse") || text.includes("a1 notation");
  const spreadsheetSignal =
    text.includes("spreadsheet") ||
    text.includes("not found") ||
    text.includes("requested entity was not found");

  if (status === 400 || (status === 404 && rangeSignal)) {
    return "GOOGLE_SHEETS_RANGE_INVALID";
  }

  if (status === 404 && spreadsheetSignal) {
    return "GOOGLE_SHEETS_SPREADSHEET_NOT_FOUND";
  }

  if (isRecord(error) && error.phase === "row_build") {
    return "ROW_BUILD_FAILED";
  }

  if (isRecord(error) && error.phase === "google_sheets_append") {
    return "GOOGLE_SHEETS_APPEND_FAILED";
  }

  if (status !== null) {
    return "GOOGLE_SHEETS_APPEND_FAILED";
  }

  return "GOOGLE_SHEETS_UNKNOWN_ERROR";
}

async function logSkipped(input: {
  workspaceId: string;
  leadId: string;
  scoreId: string;
  diagnosticTraceId: string | null;
  reason: LeadScorePushbackSkippedReason;
}): Promise<void> {
  await withWorkspaceDb(input.workspaceId, async (tx) => {
    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "lead_score_pushback.skipped",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        leadId: input.leadId,
        scoreId: input.scoreId,
        diagnosticTraceId: input.diagnosticTraceId,
        reason: input.reason,
        source: "google_sheets",
      },
    });
  });
}

async function logSucceeded(input: {
  workspaceId: string;
  leadId: string;
  scoreId: string;
  diagnosticTraceId: string | null;
  spreadsheetId: string;
  durationMs: number;
}): Promise<void> {
  await withWorkspaceDb(input.workspaceId, async (tx) => {
    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "lead_score_pushback.succeeded",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        leadId: input.leadId,
        scoreId: input.scoreId,
        diagnosticTraceId: input.diagnosticTraceId,
        maskedSpreadsheetId: maskSpreadsheetId(input.spreadsheetId),
        range: SCORE_LOG_RANGE,
        columnsAppended: 16,
        durationMs: input.durationMs,
        source: "google_sheets",
      },
    });
  });
}

async function logFailed(input: {
  workspaceId: string;
  leadId: string;
  scoreId: string;
  diagnosticTraceId: string | null;
  spreadsheetId: string;
  errorCode: LeadScorePushbackErrorCode;
  durationMs: number;
}): Promise<void> {
  await withWorkspaceDb(input.workspaceId, async (tx) => {
    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "lead_score_pushback.failed",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        leadId: input.leadId,
        scoreId: input.scoreId,
        diagnosticTraceId: input.diagnosticTraceId,
        maskedSpreadsheetId: maskSpreadsheetId(input.spreadsheetId),
        errorCode: input.errorCode,
        durationMs: input.durationMs,
        source: "google_sheets",
      },
    });
  });
}

async function loadPushbackRows(input: {
  workspaceId: string;
  leadId: string;
  scoreId: string;
  diagnosticTraceId: string | null;
}): Promise<
  | { result: "ok"; lead: LeadScorePushbackLeadRow; score: LeadScorePushbackScoreRow }
  | { result: "skipped"; reason: LeadScorePushbackSkippedReason }
> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const alreadySucceeded = await hasSucceededLeadScorePushback(tx, {
      workspaceId: input.workspaceId,
      scoreId: input.scoreId,
    });

    if (alreadySucceeded) {
      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: "lead_score_pushback.skipped",
        entityType: "lead",
        entityId: input.leadId,
        metadataJson: {
          leadId: input.leadId,
          scoreId: input.scoreId,
          diagnosticTraceId: input.diagnosticTraceId,
          reason: "ALREADY_PUSHED",
          source: "google_sheets",
        },
      });

      return { result: "skipped", reason: "ALREADY_PUSHED" };
    }

    const lead = await findLeadForLeadScorePushback(tx, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    });

    if (!lead) {
      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: "lead_score_pushback.skipped",
        entityType: "lead",
        entityId: input.leadId,
        metadataJson: {
          leadId: input.leadId,
          scoreId: input.scoreId,
          diagnosticTraceId: input.diagnosticTraceId,
          reason: "LEAD_NOT_FOUND",
          source: "google_sheets",
        },
      });

      return { result: "skipped", reason: "LEAD_NOT_FOUND" };
    }

    const score = await findScoreForLeadScorePushback(tx, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      scoreId: input.scoreId,
    });

    if (!score) {
      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: "lead_score_pushback.skipped",
        entityType: "lead",
        entityId: input.leadId,
        metadataJson: {
          leadId: input.leadId,
          scoreId: input.scoreId,
          diagnosticTraceId: input.diagnosticTraceId,
          reason: "SCORE_NOT_FOUND",
          source: "google_sheets",
        },
      });

      return { result: "skipped", reason: "SCORE_NOT_FOUND" };
    }

    return { result: "ok", lead, score };
  });
}

async function appendLeadScorePushbackRow(input: {
  credentialsInput: string;
  spreadsheetId: string;
  row: unknown[];
}): Promise<void> {
  const credentials = parseGoogleSheetsCredentials(input.credentialsInput);

  if (!credentials) {
    throw new LeadScorePushbackJobError("CONFIG_MISSING");
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: [SHEETS_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw new LeadScorePushbackJobError("GOOGLE_SHEETS_AUTH_FAILED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPEND_TIMEOUT_MS);

  try {
    const appendUrl = new URL(
      `${SHEETS_API_BASE}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(SCORE_LOG_RANGE)}:append`,
    );
    appendUrl.searchParams.set("valueInputOption", "RAW");
    appendUrl.searchParams.set("insertDataOption", "INSERT_ROWS");

    const response = await fetch(appendUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        values: [input.row],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw {
        phase: "google_sheets_append",
        status: response.status,
        statusText: response.statusText,
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleLeadScorePushbackJob(
  input: HandleLeadScorePushbackJobInput,
): Promise<HandleLeadScorePushbackJobResult> {
  const startedAtMs = Date.now();
  const payload = PushbackLeadScoreJobPayloadSchema.parse(input.payload);
  const diagnosticTraceId = payload.diagnosticTraceId ?? null;

  const loaded = await loadPushbackRows({
    workspaceId: input.workspaceId,
    leadId: payload.leadId,
    scoreId: payload.scoreId,
    diagnosticTraceId,
  });

  if (loaded.result === "skipped") {
    return loaded;
  }

  if (process.env.GOOGLE_SHEETS_PUSH_ENABLED !== "true") {
    await logSkipped({
      workspaceId: input.workspaceId,
      leadId: payload.leadId,
      scoreId: payload.scoreId,
      diagnosticTraceId,
      reason: "PUSHBACK_DISABLED",
    });

    return { result: "skipped", reason: "PUSHBACK_DISABLED" };
  }

  const credentialsInput = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();

  if (!credentialsInput || !spreadsheetId || !parseGoogleSheetsCredentials(credentialsInput)) {
    await logSkipped({
      workspaceId: input.workspaceId,
      leadId: payload.leadId,
      scoreId: payload.scoreId,
      diagnosticTraceId,
      reason: "CONFIG_MISSING",
    });

    return { result: "skipped", reason: "CONFIG_MISSING" };
  }

  try {
    const row = buildLeadScorePushbackRow({
      lead: loaded.lead,
      score: loaded.score,
      diagnosticTraceId,
      syncedAt: new Date(),
    });

    await appendLeadScorePushbackRow({
      credentialsInput,
      spreadsheetId,
      row,
    });

    await logSucceeded({
      workspaceId: input.workspaceId,
      leadId: payload.leadId,
      scoreId: payload.scoreId,
      diagnosticTraceId,
      spreadsheetId,
      durationMs: elapsedMs(startedAtMs),
    });

    return { result: "succeeded" };
  } catch (error) {
    const errorCode = classifyLeadScorePushbackError(error);

    if (errorCode === "CONFIG_MISSING") {
      await logSkipped({
        workspaceId: input.workspaceId,
        leadId: payload.leadId,
        scoreId: payload.scoreId,
        diagnosticTraceId,
        reason: "CONFIG_MISSING",
      });

      return { result: "skipped", reason: "CONFIG_MISSING" };
    }

    await logFailed({
      workspaceId: input.workspaceId,
      leadId: payload.leadId,
      scoreId: payload.scoreId,
      diagnosticTraceId,
      spreadsheetId,
      errorCode,
      durationMs: elapsedMs(startedAtMs),
    });
    console.warn(`Google Sheets lead-score pushback failed: ${errorCode}.`);
    throw new LeadScorePushbackJobError(errorCode);
  }
}
