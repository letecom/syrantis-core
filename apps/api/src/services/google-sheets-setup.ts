import { GoogleAuth } from "google-auth-library";

import {
  GoogleSheetsSetupStatusSchema,
  GoogleSheetsSetupTestResponseSchema,
  type GoogleSheetsSetupLastTest,
  type GoogleSheetsSetupStatus,
  type GoogleSheetsSetupTestResponse,
  type GoogleSheetsSetupTestResult,
} from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import {
  createGoogleSheetsSetupActivityLog,
  findLatestGoogleSheetsSetupActivityLog,
  type GoogleSheetsSetupActivityLogRow,
  type GoogleSheetsSetupActivityType,
} from "../repositories/google-sheets-setup.js";
import {
  classifyPushbackError,
  createDiagnosticTraceId,
  errorSummaryForCode,
  maskSpreadsheetId,
  type PushbackErrorCode,
} from "./pushback/diagnostics.js";
import { parseGoogleSheetsCredentials } from "./pushback/google-sheets.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SETUP_TEST_TIMEOUT_MS = 10_000;

export type GoogleSheetsSetupService = {
  getSetupStatus(workspaceId: string): Promise<GoogleSheetsSetupStatus>;
  runSetupTest(workspaceId: string, actorUserId: string): Promise<GoogleSheetsSetupTestResponse>;
};

export type AppendGoogleSheetsVerificationRow = (input: {
  credentialsInput: string;
  spreadsheetId: string;
  range: string;
  row: string[];
  timeoutMs: number;
}) => Promise<{ rowsAppended: number }>;

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readEffectiveConfig() {
  const spreadsheetId = readTrimmedEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const pushbackRange = readTrimmedEnv("GOOGLE_SHEETS_PUSHBACK_RANGE");
  const verificationRange = readTrimmedEnv("GOOGLE_SHEETS_VERIFICATION_RANGE");
  const credentialsInput = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  const credentials = credentialsInput ? parseGoogleSheetsCredentials(credentialsInput) : null;

  return {
    enabled: process.env.GOOGLE_SHEETS_PUSH_ENABLED === "true",
    credentialsInput: credentialsInput ?? null,
    credentialsConfigured: Boolean(credentials),
    spreadsheetId,
    spreadsheetConfigured: Boolean(spreadsheetId),
    pushbackRange,
    pushbackRangeConfigured: Boolean(pushbackRange),
    verificationRange,
    verificationRangeConfigured: Boolean(verificationRange),
  };
}

function setupResultFromAction(action: GoogleSheetsSetupActivityType): GoogleSheetsSetupTestResult {
  if (action === "google_sheets_setup.test_succeeded") {
    return "succeeded";
  }

  if (action === "google_sheets_setup.test_failed") {
    return "failed";
  }

  return "skipped";
}

function readString(
  metadata: Record<string, unknown>,
  key: string,
  maxLength = 160,
): string | null {
  const value = metadata[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function readErrorCode(metadata: Record<string, unknown>): PushbackErrorCode | null {
  const value = readString(metadata, "errorCode", 120);
  return value && /^PUSHBACK_[A-Z0-9_]+$/.test(value) ? (value as PushbackErrorCode) : null;
}

function lastTestFromLog(
  log: GoogleSheetsSetupActivityLogRow | null,
): GoogleSheetsSetupLastTest | null {
  if (!log) {
    return null;
  }

  const diagnosticTraceId = readString(log.metadataJson, "diagnosticTraceId", 80);

  if (!diagnosticTraceId) {
    return null;
  }

  return {
    result: setupResultFromAction(log.type),
    diagnosticTraceId,
    errorCode: readErrorCode(log.metadataJson),
    testedAt: log.createdAt.toISOString(),
  };
}

function buildStatus(lastLog: GoogleSheetsSetupActivityLogRow | null): GoogleSheetsSetupStatus {
  const config = readEffectiveConfig();

  return GoogleSheetsSetupStatusSchema.parse({
    enabled: config.enabled,
    configured:
      config.enabled &&
      config.credentialsConfigured &&
      config.spreadsheetConfigured &&
      config.pushbackRangeConfigured &&
      config.verificationRangeConfigured,
    credentialsConfigured: config.credentialsConfigured,
    spreadsheetConfigured: config.spreadsheetConfigured,
    spreadsheetIdMasked: config.spreadsheetId ? maskSpreadsheetId(config.spreadsheetId) : null,
    pushbackRangeConfigured: config.pushbackRangeConfigured,
    verificationRangeConfigured: config.verificationRangeConfigured,
    pushbackRangeLabel: config.pushbackRange,
    verificationRangeLabel: config.verificationRange,
    lastTest: lastTestFromLog(lastLog),
  });
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function actionForResult(result: GoogleSheetsSetupTestResult): GoogleSheetsSetupActivityType {
  if (result === "succeeded") {
    return "google_sheets_setup.test_succeeded";
  }

  if (result === "failed") {
    return "google_sheets_setup.test_failed";
  }

  return "google_sheets_setup.test_skipped";
}

async function appendGoogleSheetsVerificationRow(input: {
  credentialsInput: string;
  spreadsheetId: string;
  range: string;
  row: string[];
  timeoutMs: number;
}): Promise<{ rowsAppended: number }> {
  const credentials = parseGoogleSheetsCredentials(input.credentialsInput);

  if (!credentials) {
    const error = new Error("Google Sheets credentials are missing or invalid.");
    error.name = "PUSHBACK_MISSING_CREDENTIALS";
    throw error;
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: [SHEETS_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw { status: 401, message: "Google Sheets auth failed." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const appendUrl = new URL(
      `${SHEETS_API_BASE}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append`,
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

    return { rowsAppended: 1 };
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error("Google Sheets setup test timeout.");
      error.name = "AbortError";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function skipped(
  errorCode: PushbackErrorCode,
  diagnosticTraceId: string,
  testedAt: string,
): GoogleSheetsSetupTestResponse {
  return GoogleSheetsSetupTestResponseSchema.parse({
    result: "skipped",
    diagnosticTraceId,
    testedAt,
    errorCode,
    errorSummary: errorSummaryForCode(errorCode),
    verification: null,
  });
}

function failed(
  errorCode: PushbackErrorCode,
  diagnosticTraceId: string,
  testedAt: string,
): GoogleSheetsSetupTestResponse {
  return GoogleSheetsSetupTestResponseSchema.parse({
    result: "failed",
    diagnosticTraceId,
    testedAt,
    errorCode,
    errorSummary: errorSummaryForCode(errorCode),
    verification: null,
  });
}

function succeeded(input: {
  diagnosticTraceId: string;
  testedAt: string;
  range: string;
  rowsAppended: number;
}): GoogleSheetsSetupTestResponse {
  return GoogleSheetsSetupTestResponseSchema.parse({
    result: "succeeded",
    diagnosticTraceId: input.diagnosticTraceId,
    testedAt: input.testedAt,
    errorCode: null,
    errorSummary: null,
    verification: {
      rangeTested: input.range,
      rowsAppended: input.rowsAppended,
    },
  });
}

function buildLogMetadata(input: {
  response: GoogleSheetsSetupTestResponse;
  durationMs: number;
  verificationRangeConfigured: boolean;
  pushbackRangeConfigured: boolean;
}): Record<string, unknown> {
  return {
    source: "admin_ui",
    diagnosticTraceId: input.response.diagnosticTraceId,
    result: input.response.result,
    ...(input.response.errorCode ? { errorCode: input.response.errorCode } : {}),
    durationMs: input.durationMs,
    verificationRangeConfigured: input.verificationRangeConfigured,
    pushbackRangeConfigured: input.pushbackRangeConfigured,
  };
}

function createProductionGoogleSheetsSetupServiceWithAppender(
  appendVerificationRow: AppendGoogleSheetsVerificationRow,
): GoogleSheetsSetupService {
  return {
    async getSetupStatus(workspaceId: string): Promise<GoogleSheetsSetupStatus> {
      const lastLog = await findLatestGoogleSheetsSetupActivityLog(workspaceId);
      return buildStatus(lastLog);
    },

    async runSetupTest(
      workspaceId: string,
      actorUserId: string,
    ): Promise<GoogleSheetsSetupTestResponse> {
      const startedAtMs = Date.now();
      const diagnosticTraceId = createDiagnosticTraceId();
      const testedAt = new Date().toISOString();
      const config = readEffectiveConfig();

      let response: GoogleSheetsSetupTestResponse;

      if (!config.enabled) {
        response = skipped("PUSHBACK_DISABLED", diagnosticTraceId, testedAt);
      } else if (!config.credentialsInput || !config.credentialsConfigured) {
        response = skipped("PUSHBACK_MISSING_CREDENTIALS", diagnosticTraceId, testedAt);
      } else if (!config.spreadsheetId) {
        response = skipped("PUSHBACK_MISSING_SPREADSHEET_ID", diagnosticTraceId, testedAt);
      } else if (!config.verificationRange) {
        response = skipped("PUSHBACK_MISSING_RANGE", diagnosticTraceId, testedAt);
      } else {
        try {
          const row = ["SYRANTIS_SETUP_TEST", testedAt, diagnosticTraceId, "attempted"];
          const appendResult = await withTimeout(
            appendVerificationRow({
              credentialsInput: config.credentialsInput,
              spreadsheetId: config.spreadsheetId,
              range: config.verificationRange,
              row,
              timeoutMs: SETUP_TEST_TIMEOUT_MS,
            }),
            SETUP_TEST_TIMEOUT_MS,
          );
          response = succeeded({
            diagnosticTraceId,
            testedAt,
            range: config.verificationRange,
            rowsAppended: appendResult.rowsAppended,
          });
        } catch (error) {
          const classified = classifyPushbackError(error);
          response = failed(classified.errorCode, diagnosticTraceId, testedAt);
          console.warn(`Google Sheets setup test failed: ${classified.errorCode}.`);
        }
      }

      await withWorkspaceDb(workspaceId, async (tx) => {
        await createGoogleSheetsSetupActivityLog(tx, {
          workspaceId,
          actorUserId,
          action: actionForResult(response.result),
          metadataJson: buildLogMetadata({
            response,
            durationMs: elapsedMs(startedAtMs),
            verificationRangeConfigured: config.verificationRangeConfigured,
            pushbackRangeConfigured: config.pushbackRangeConfigured,
          }),
        });
      });

      return response;
    },
  };
}

export function createProductionGoogleSheetsSetupService(): GoogleSheetsSetupService {
  return createProductionGoogleSheetsSetupServiceWithAppender(appendGoogleSheetsVerificationRow);
}

export function createTestGoogleSheetsSetupService(
  appendVerificationRow: AppendGoogleSheetsVerificationRow,
): GoogleSheetsSetupService {
  return createProductionGoogleSheetsSetupServiceWithAppender(appendVerificationRow);
}
