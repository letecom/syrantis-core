import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { GoogleAuth } from "google-auth-library";
import type { JWTInput } from "google-auth-library";

const DEFAULT_RANGE = "Sheet1!A:E";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SERVICE_ACCOUNT_EMAIL_FIELD = ["client", "email"].join("_");
const SERVICE_ACCOUNT_KEY_FIELD = ["private", "key"].join("_");

type SheetsValuesResponse = {
  values?: string[][];
};

type FailureCode =
  | "SHEETS_SANDBOX_MISSING_ENV"
  | "SHEETS_SANDBOX_INVALID_CREDENTIALS"
  | "SHEETS_SANDBOX_APPEND_FAILED"
  | "SHEETS_SANDBOX_READBACK_FAILED"
  | "SHEETS_SANDBOX_VERIFY_NOT_FOUND"
  | "SHEETS_SANDBOX_UNKNOWN_ERROR";

class VerificationFailure extends Error {
  constructor(
    readonly code: FailureCode,
    message: string
  ) {
    super(message);
  }
}

function fail(code: FailureCode, message: string): never {
  throw new VerificationFailure(code, message);
}

function readStringField(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];

  return typeof value === "string" ? value : undefined;
}

function parseCredentials(input: string): JWTInput {
  try {
    const source = path.isAbsolute(input) && existsSync(input) ? readFileSync(input, "utf8") : input;
    const parsed: unknown = JSON.parse(source);

    if (!parsed || typeof parsed !== "object") {
      fail("SHEETS_SANDBOX_INVALID_CREDENTIALS", "Credentials must be a Google service-account JSON object.");
    }

    const credentialRecord = parsed as Record<string, unknown>;
    const serviceAccountEmail = readStringField(credentialRecord, SERVICE_ACCOUNT_EMAIL_FIELD);
    const serviceAccountKey = readStringField(credentialRecord, SERVICE_ACCOUNT_KEY_FIELD);

    if (!serviceAccountEmail || !serviceAccountKey) {
      fail("SHEETS_SANDBOX_INVALID_CREDENTIALS", "Credentials must be a Google service-account JSON object.");
    }

    return {
      ...credentialRecord,
      [SERVICE_ACCOUNT_EMAIL_FIELD]: serviceAccountEmail,
      [SERVICE_ACCOUNT_KEY_FIELD]: serviceAccountKey
    };
  } catch (error: unknown) {
    if (error instanceof VerificationFailure) {
      throw error;
    }

    fail("SHEETS_SANDBOX_INVALID_CREDENTIALS", "Credentials JSON could not be parsed.");
  }
}

function maskId(id: string): string {
  if (id.length <= 10) {
    return "***";
  }

  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

async function getAccessToken(credentials: JWTInput): Promise<string> {
  try {
    const auth = new GoogleAuth({
      credentials,
      scopes: [SHEETS_SCOPE]
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (!token.token) {
      fail("SHEETS_SANDBOX_INVALID_CREDENTIALS", "Google auth did not return an access token.");
    }

    return token.token;
  } catch (error: unknown) {
    if (error instanceof VerificationFailure) {
      throw error;
    }

    fail("SHEETS_SANDBOX_INVALID_CREDENTIALS", "Google service-account authentication failed.");
  }
}

async function appendVerificationRow(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  row: string[]
): Promise<void> {
  const appendUrl = new URL(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`
  );
  appendUrl.searchParams.set("valueInputOption", "RAW");
  appendUrl.searchParams.set("insertDataOption", "INSERT_ROWS");

  try {
    const response = await fetch(appendUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        values: [row]
      })
    });

    if (!response.ok) {
      fail("SHEETS_SANDBOX_APPEND_FAILED", `Append failed with HTTP ${response.status}.`);
    }
  } catch (error: unknown) {
    if (error instanceof VerificationFailure) {
      throw error;
    }

    fail("SHEETS_SANDBOX_APPEND_FAILED", "Append request failed.");
  }
}

async function readBackValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const readUrl = new URL(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  readUrl.searchParams.set("majorDimension", "ROWS");

  try {
    const response = await fetch(readUrl, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      fail("SHEETS_SANDBOX_READBACK_FAILED", `Readback failed with HTTP ${response.status}.`);
    }

    const body = (await response.json()) as SheetsValuesResponse;
    return Array.isArray(body.values) ? body.values : [];
  } catch (error: unknown) {
    if (error instanceof VerificationFailure) {
      throw error;
    }

    fail("SHEETS_SANDBOX_READBACK_FAILED", "Readback request failed.");
  }
}

async function main(): Promise<void> {
  const credentialsInput = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE?.trim() || DEFAULT_RANGE;

  if (!credentialsInput || !spreadsheetId) {
    const missing = [
      !credentialsInput ? "GOOGLE_SHEETS_CREDENTIALS_JSON" : undefined,
      !spreadsheetId ? "GOOGLE_SHEETS_SPREADSHEET_ID" : undefined
    ]
      .filter(Boolean)
      .join(", ");

    fail("SHEETS_SANDBOX_MISSING_ENV", `Missing required env var(s): ${missing}.`);
  }

  const credentials = parseCredentials(credentialsInput);
  const accessToken = await getAccessToken(credentials);
  const verificationId = `022B-${randomUUID()}`;
  const row = [
    "VERIFY",
    new Date().toISOString(),
    "Syrantis Google Sheets sandbox verification",
    "022B",
    verificationId
  ];

  await appendVerificationRow(accessToken, spreadsheetId, range, row);

  const values = await readBackValues(accessToken, spreadsheetId, range);
  const found = values.slice(-50).some((readRow) => readRow.includes(verificationId));

  if (!found) {
    fail("SHEETS_SANDBOX_VERIFY_NOT_FOUND", "Verification id was not found in recent readback rows.");
  }

  console.log("SHEETS_SANDBOX_VERIFY_OK");
  console.log(`spreadsheetId=${maskId(spreadsheetId)}`);
  console.log(`range=${range}`);
  console.log(`verificationId=${verificationId}`);
}

void main().catch((error: unknown) => {
  if (error instanceof VerificationFailure) {
    console.error(error.code);
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error("SHEETS_SANDBOX_UNKNOWN_ERROR");
  console.error("Unexpected verification failure.");
  process.exitCode = 1;
});
