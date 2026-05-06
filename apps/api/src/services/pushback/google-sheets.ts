import { GoogleAuth } from "google-auth-library";
import type { JWTInput } from "google-auth-library";

import { findPushbackData } from "../../repositories/pushback.js";
import type { ResendDeliveryEventType } from "../../repositories/resend-webhook.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SERVICE_ACCOUNT_EMAIL_FIELD = ["client", "email"].join("_");
const SERVICE_ACCOUNT_KEY_FIELD = ["private", "key"].join("_");

function parseCredentials(input: string): JWTInput | null {
  try {
    const parsed: unknown = JSON.parse(input);

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

export async function pushDeliveryProofToGoogleSheets(input: {
  workspaceId: string;
  emailSendId: string;
  eventType: ResendDeliveryEventType;
  occurredAt: Date;
}): Promise<void> {
  if (process.env.GOOGLE_SHEETS_PUSH_ENABLED !== "true") {
    return;
  }

  try {
    const credentialsInput = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const range = process.env.GOOGLE_SHEETS_PUSHBACK_RANGE?.trim();

    if (!credentialsInput || !spreadsheetId || !range) {
      console.warn("GOOGLE_SHEETS_PUSH_ENABLED is true but missing credentials, spreadsheet ID, or range.");
      return;
    }

    const credentials = parseCredentials(credentialsInput);
    if (!credentials) {
      console.warn("Failed to parse GOOGLE_SHEETS_CREDENTIALS_JSON.");
      return;
    }

    const pushbackData = await findPushbackData(input.workspaceId, input.emailSendId);
    if (!pushbackData) {
      console.warn(`Pushback data not found for emailSendId ${input.emailSendId}`);
      return;
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: [SHEETS_SCOPE]
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (!token.token) {
      console.warn("Failed to get Google Sheets access token.");
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
      console.warn(`Google Sheets append failed with HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("Error pushing to Google Sheets:", error);
  }
}
