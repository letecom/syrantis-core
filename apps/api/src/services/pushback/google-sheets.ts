import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import type { JWTInput } from "google-auth-library";

import { findPushbackData } from "../../repositories/pushback.js";
import type { PushbackDataRow } from "../../repositories/pushback.js";
import type { ResendDeliveryEventType } from "../../repositories/resend-webhook.js";
import {
  buildPushbackFailedMetadata,
  buildPushbackSkippedMetadata,
  buildPushbackSucceededMetadata,
  classifyPushbackError,
  createDiagnosticTraceId,
  logPushbackDiagnosticActivity,
  type PushbackErrorCode
} from "./diagnostics.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SERVICE_ACCOUNT_EMAIL_FIELD = ["client", "email"].join("_");
const SERVICE_ACCOUNT_KEY_FIELD = ["private", "key"].join("_");

function parseCredentials(input: string): JWTInput | null {
  try {
    const source = path.isAbsolute(input) && existsSync(input) ? readFileSync(input, "utf8") : input;
    const parsed: unknown = JSON.parse(source);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const credentialRecord = parsed as Record<string, unknown>;
    const serviceAccountEmail = typeof credentialRecord[SERVICE_ACCOUNT_EMAIL_FIELD] === "string" ? credentialRecord[SERVICE_ACCOUNT_EMAIL_FIELD] : undefined;
    const serviceAccountKey = typeof credentialRecord[SERVICE_ACCOUNT_KEY_FIELD] === "string" ? credentialRecord[SERVICE_ACCOUNT_KEY_FIELD] : undefined;

    if (!serviceAccountEmail || !serviceAccountKey) {
      return null;
    }

    return {
      ...credentialRecord,
      [SERVICE_ACCOUNT_EMAIL_FIELD]: serviceAccountEmail,
      [SERVICE_ACCOUNT_KEY_FIELD]: serviceAccountKey
    };
  } catch {
    return null;
  }
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function pushbackIds(pushbackData: PushbackDataRow | null): { draftId?: string | null; leadId?: string | null } {
  return {
    draftId: pushbackData?.syrantis_draft_id ?? null,
    leadId: pushbackData?.syrantis_lead_id ?? null
  };
}

export async function pushDeliveryProofToGoogleSheets(input: {
  workspaceId: string;
  emailSendId: string;
  eventType: ResendDeliveryEventType;
  occurredAt: Date;
}): Promise<void> {
  const startedAtMs = Date.now();
  const diagnosticTraceId = createDiagnosticTraceId();
  let pushbackData: PushbackDataRow | null = null;

  const logSkipped = async (errorCode: PushbackErrorCode): Promise<void> => {
    await logPushbackDiagnosticActivity({
      workspaceId: input.workspaceId,
      emailSendId: input.emailSendId,
      action: "crm_pushback.skipped",
      metadataJson: buildPushbackSkippedMetadata({
        diagnosticTraceId,
        emailSendId: input.emailSendId,
        ...pushbackIds(pushbackData),
        errorCode,
        durationMs: elapsedMs(startedAtMs)
      })
    });
  };

  const logFailed = async (params: {
    spreadsheetId?: string | null | undefined;
    range?: string | null | undefined;
    errorCode: PushbackErrorCode;
  }): Promise<void> => {
    await logPushbackDiagnosticActivity({
      workspaceId: input.workspaceId,
      emailSendId: input.emailSendId,
      action: "crm_pushback.failed",
      metadataJson: buildPushbackFailedMetadata({
        diagnosticTraceId,
        emailSendId: input.emailSendId,
        ...pushbackIds(pushbackData),
        spreadsheetId: params.spreadsheetId,
        range: params.range,
        errorCode: params.errorCode,
        durationMs: elapsedMs(startedAtMs)
      })
    });
  };

  if (process.env.GOOGLE_SHEETS_PUSH_ENABLED !== "true") {
    await logSkipped("PUSHBACK_DISABLED");
    return;
  }

  try {
    const credentialsInput = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const range = process.env.GOOGLE_SHEETS_PUSHBACK_RANGE?.trim();

    if (!credentialsInput) {
      await logSkipped("PUSHBACK_MISSING_CREDENTIALS");
      return;
    }

    if (!spreadsheetId) {
      await logSkipped("PUSHBACK_MISSING_SPREADSHEET_ID");
      return;
    }

    if (!range) {
      await logSkipped("PUSHBACK_MISSING_RANGE");
      return;
    }

    const credentials = parseCredentials(credentialsInput);
    if (!credentials) {
      await logSkipped("PUSHBACK_MISSING_CREDENTIALS");
      return;
    }

    pushbackData = await findPushbackData(input.workspaceId, input.emailSendId);
    if (!pushbackData) {
      await logFailed({
        spreadsheetId,
        range,
        errorCode: "PUSHBACK_UNKNOWN_ERROR"
      });
      return;
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: [SHEETS_SCOPE]
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (!token.token) {
      await logFailed({
        spreadsheetId,
        range,
        errorCode: "PUSHBACK_AUTH_FAILED"
      });
      return;
    }

    const row = [
      input.eventType,
      input.occurredAt.toISOString(),
      pushbackData.syrantis_lead_id || "",
      pushbackData.syrantis_draft_id || "",
      pushbackData.syrantis_email_send_id || "",
      pushbackData.lead_label || "",
      pushbackData.contact_email || "",
      pushbackData.send_status || "",
      pushbackData.delivery_status || "",
      pushbackData.requested_at || "",
      pushbackData.sent_at || "",
      pushbackData.delivered_at || "",
      pushbackData.bounced_at || "",
      pushbackData.complained_at || "",
      pushbackData.delivery_error_code || "",
      pushbackData.safe_summary || "",
      new Date().toISOString()
    ];

    const appendUrl = new URL(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`
    );
    appendUrl.searchParams.set("valueInputOption", "RAW");
    appendUrl.searchParams.set("insertDataOption", "INSERT_ROWS");

    const response = await fetch(appendUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        values: [row]
      })
    });

    if (!response.ok) {
      const classified = classifyPushbackError({
        phase: "google_sheets_append",
        status: response.status,
        statusText: response.statusText
      });
      await logFailed({
        spreadsheetId,
        range,
        errorCode: classified.errorCode
      });
      console.warn(`Google Sheets push-back failed: ${classified.errorCode}.`);
      return;
    }

    await logPushbackDiagnosticActivity({
      workspaceId: input.workspaceId,
      emailSendId: input.emailSendId,
      action: "crm_pushback.succeeded",
      metadataJson: buildPushbackSucceededMetadata({
        diagnosticTraceId,
        emailSendId: input.emailSendId,
        ...pushbackIds(pushbackData),
        spreadsheetId,
        range,
        columnsAppended: row.length,
        durationMs: elapsedMs(startedAtMs)
      })
    });
  } catch (error) {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const range = process.env.GOOGLE_SHEETS_PUSHBACK_RANGE?.trim();
    const classified = classifyPushbackError(error);
    await logFailed({
      spreadsheetId,
      range,
      errorCode: classified.errorCode
    });
    console.warn(`Google Sheets push-back failed: ${classified.errorCode}.`);
  }
}
