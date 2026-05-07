import type { MockInstance } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { pushDeliveryProofToGoogleSheets } from "../services/pushback/google-sheets.js";
import { maskSpreadsheetId } from "../services/pushback/diagnostics.js";
import { findPushbackData } from "../repositories/pushback.js";
import { createActivityLog } from "../repositories/activity-logs.js";

const mockGoogleAuthState = vi.hoisted(() => ({
  getClient: vi.fn(async () => ({
    getAccessToken: vi.fn(async () => ({ token: "mock-token" }))
  }))
}));

const dbMocks = vi.hoisted(() => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ tx: "pushback-diagnostic" }),
  )
}));

vi.mock("google-auth-library", () => {
  class GoogleAuth {
    getClient = mockGoogleAuthState.getClient;
  }
  return { GoogleAuth };
});

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: dbMocks.withWorkspaceDb
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000022099" }))
}));

vi.mock("../repositories/pushback.js", () => ({
  findPushbackData: vi.fn()
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const serviceAccountEmailField = ["client", "email"].join("_");
const serviceAccountKeyField = ["private", "key"].join("_");
const credentialsEnvName = ["GOOGLE", "SHEETS", "CREDENTIALS", "JSON"].join("_");
const resendApiKeyEnvName = ["RESEND", "API", "KEY"].join("_");
const resendWebhookSecretEnvName = ["RESEND", "WEBHOOK", "SECRET"].join("_");
const providerMessageSnake = ["provider", "message", "id"].join("_");
const providerMessageCamel = ["provider", "Message", "Id"].join("");
const emailTitleForbiddenKey = ["sub", "ject"].join("");
const htmlForbiddenKey = ["html", "Body"].join("");
const textForbiddenKey = ["text", "Body"].join("");
const webhookRawForbiddenKey = ["raw", "Payload"].join("");
const googleRawForbiddenKey = ["raw", "Google"].join("");
const contactEmailSnake = ["contact", "email"].join("_");
const workspaceIdKey = ["workspace", "Id"].join("");
const spreadsheetId = "1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc";
const range = "Pushback_Log!A:Q";

function credentialsJson() {
  return JSON.stringify({
    [serviceAccountEmailField]: "test@example.invalid",
    [serviceAccountKeyField]: "test-key"
  });
}

function pushbackData(overrides: Partial<Awaited<ReturnType<typeof findPushbackData>>> = {}) {
  return {
    syrantis_lead_id: "lead1",
    syrantis_draft_id: "draft1",
    syrantis_email_send_id: "send1",
    lead_label: "Lead 123",
    contact_email: "test@test.com",
    send_status: "sent",
    delivery_status: "delivered",
    requested_at: "2026-05-04T10:00:00.000Z",
    sent_at: "2026-05-04T10:00:01.000Z",
    delivered_at: "2026-05-04T10:00:02.000Z",
    bounced_at: null,
    complained_at: null,
    delivery_error_code: null,
    safe_summary: "Draft summary",
    ...overrides
  };
}

function pushbackInput() {
  return {
    workspaceId: "w1",
    emailSendId: "send1",
    eventType: "email.delivered" as const,
    occurredAt: new Date("2026-05-04T10:00:02.000Z")
  };
}

function lastActivityLogInput() {
  const calls = vi.mocked(createActivityLog).mock.calls;
  if (!calls.length) {
    throw new Error("createActivityLog was not called");
  }

  return calls.at(-1)![1];
}

function activityMetadata() {
  return lastActivityLogInput().metadataJson ?? {};
}

function expectSafeMetadata(metadata: Record<string, unknown>) {
  const serialized = JSON.stringify(metadata);

  for (const forbidden of [
    serviceAccountKeyField,
    serviceAccountEmailField,
    credentialsEnvName,
    resendApiKeyEnvName,
    resendWebhookSecretEnvName,
    providerMessageSnake,
    providerMessageCamel,
    emailTitleForbiddenKey,
    htmlForbiddenKey,
    textForbiddenKey,
    webhookRawForbiddenKey,
    googleRawForbiddenKey,
    contactEmailSnake,
    workspaceIdKey
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("Google Sheets Pushback MVP", () => {
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mockFetch.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = credentialsJson();
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheetId;
    process.env.GOOGLE_SHEETS_PUSHBACK_RANGE = range;
    vi.mocked(findPushbackData).mockResolvedValue(pushbackData());
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("masks spreadsheet IDs deterministically", () => {
    expect(maskSpreadsheetId("12345678")).toBe("***");
    expect(maskSpreadsheetId(spreadsheetId)).toBe("1tml...w7lc");
  });

  it("disabled pushback logs crm_pushback.skipped with PUSHBACK_DISABLED and does not call Google append", async () => {
    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "false";

    const result = await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(findPushbackData).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      result: "skipped",
      errorCode: "PUSHBACK_DISABLED"
    });
    expect(lastActivityLogInput()).toMatchObject({
      workspaceId: "w1",
      action: "crm_pushback.skipped",
      entityType: "email_send",
      entityId: "send1"
    });
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      errorCode: "PUSHBACK_DISABLED",
      errorSummary: "Google Sheets push-back is disabled."
    });
    expectSafeMetadata(activityMetadata());
  });

  it("missing credentials logs crm_pushback.skipped with PUSHBACK_MISSING_CREDENTIALS", async () => {
    delete process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      errorCode: "PUSHBACK_MISSING_CREDENTIALS"
    });
    expect(lastActivityLogInput().action).toBe("crm_pushback.skipped");
    expectSafeMetadata(activityMetadata());
  });

  it("missing spreadsheet ID logs crm_pushback.skipped with PUSHBACK_MISSING_SPREADSHEET_ID", async () => {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      errorCode: "PUSHBACK_MISSING_SPREADSHEET_ID"
    });
    expect(lastActivityLogInput().action).toBe("crm_pushback.skipped");
    expectSafeMetadata(activityMetadata());
  });

  it("missing pushback range logs crm_pushback.skipped with PUSHBACK_MISSING_RANGE", async () => {
    delete process.env.GOOGLE_SHEETS_PUSHBACK_RANGE;

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      errorCode: "PUSHBACK_MISSING_RANGE"
    });
    expect(lastActivityLogInput().action).toBe("crm_pushback.skipped");
    expectSafeMetadata(activityMetadata());
  });

  it("logs missing credentials when the path does not exist", async () => {
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = "/path/that/does/not/exist/123.json";

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      errorCode: "PUSHBACK_MISSING_CREDENTIALS"
    });
    expectSafeMetadata(activityMetadata());
  });

  it("logs missing credentials when the file contains invalid JSON", async () => {
    const tempFile = path.join(os.tmpdir(), `syrantis-test-invalid-${Date.now()}.json`);
    writeFileSync(tempFile, "this is not valid json");
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = tempFile;

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      errorCode: "PUSHBACK_MISSING_CREDENTIALS"
    });
    expectSafeMetadata(activityMetadata());
    unlinkSync(tempFile);
  });

  it("pushes back successfully when GOOGLE_SHEETS_CREDENTIALS_JSON is a path to a temp JSON file", async () => {
    const tempFile = path.join(os.tmpdir(), `syrantis-test-creds-${Date.now()}.json`);
    writeFileSync(tempFile, credentialsJson());
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = tempFile;

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(lastActivityLogInput().action).toBe("crm_pushback.succeeded");
    expectSafeMetadata(activityMetadata());
    unlinkSync(tempFile);
  });

  it("successful append logs crm_pushback.succeeded with compact safe metadata", async () => {
    vi.setSystemTime(new Date("2026-05-04T10:00:03.000Z"));

    const result = await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ result: "succeeded" });
    expect(lastActivityLogInput()).toMatchObject({
      workspaceId: "w1",
      action: "crm_pushback.succeeded",
      entityType: "email_send",
      entityId: "send1"
    });
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      draftId: "draft1",
      leadId: "lead1",
      maskedSpreadsheetId: "1tml...w7lc",
      range,
      columnsAppended: 17
    });
    expect(activityMetadata().diagnosticTraceId).toEqual(expect.any(String));
    expect(activityMetadata().durationMs).toEqual(expect.any(Number));
    expectSafeMetadata(activityMetadata());
  });

  it("pushes back formatted row to Google Sheets exactly as required", async () => {
    vi.setSystemTime(new Date("2026-05-04T10:00:03.000Z"));

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    const [url, requestInit] = mockFetch.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain("https://sheets.googleapis.com/v4/spreadsheets/1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc/values/Pushback_Log!A%3AQ:append");
    expect(requestInit.method).toBe("POST");

    const body = JSON.parse(requestInit.body as string);
    expect(body.values).toHaveLength(1);

    const row = body.values[0];
    expect(row).toHaveLength(17);
    expect(row).toEqual([
      "email.delivered",
      "2026-05-04T10:00:02.000Z",
      "lead1",
      "draft1",
      "send1",
      "Lead 123",
      "test@test.com",
      "sent",
      "delivered",
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T10:00:01.000Z",
      "2026-05-04T10:00:02.000Z",
      "",
      "",
      "",
      "Draft summary",
      "2026-05-04T10:00:03.000Z"
    ]);
  });

  it("403-like Google error logs crm_pushback.failed with PUSHBACK_AUTH_FAILED and no raw error body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden raw provider body should not appear"
    });

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(lastActivityLogInput().action).toBe("crm_pushback.failed");
    expect(activityMetadata()).toMatchObject({
      emailSendId: "send1",
      maskedSpreadsheetId: "1tml...w7lc",
      range,
      errorCode: "PUSHBACK_AUTH_FAILED",
      errorSummary: "Google Sheets authentication or authorization failed."
    });
    expect(JSON.stringify(activityMetadata())).not.toContain("Forbidden raw provider body should not appear");
    expectSafeMetadata(activityMetadata());
  });

  it("404 spreadsheet-like error logs PUSHBACK_SPREADSHEET_NOT_FOUND", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Requested spreadsheet was not found"
    });

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(activityMetadata()).toMatchObject({
      errorCode: "PUSHBACK_SPREADSHEET_NOT_FOUND"
    });
    expectSafeMetadata(activityMetadata());
  });

  it("400 range-like error logs PUSHBACK_RANGE_INVALID", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Unable to parse range"
    });

    await pushDeliveryProofToGoogleSheets(pushbackInput());

    expect(activityMetadata()).toMatchObject({
      errorCode: "PUSHBACK_RANGE_INVALID"
    });
    expectSafeMetadata(activityMetadata());
  });

  it("timeout-like error logs PUSHBACK_TIMEOUT", async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error("request timeout"), { code: "ETIMEDOUT" }));

    await expect(pushDeliveryProofToGoogleSheets(pushbackInput())).resolves.toMatchObject({
      result: "failed",
      errorCode: "PUSHBACK_TIMEOUT"
    });

    expect(activityMetadata()).toMatchObject({
      errorCode: "PUSHBACK_TIMEOUT"
    });
    expectSafeMetadata(activityMetadata());
  });

  it("unknown thrown error logs PUSHBACK_UNKNOWN_ERROR", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(pushDeliveryProofToGoogleSheets(pushbackInput())).resolves.toMatchObject({
      result: "failed",
      errorCode: "PUSHBACK_UNKNOWN_ERROR"
    });

    expect(activityMetadata()).toMatchObject({
      errorCode: "PUSHBACK_UNKNOWN_ERROR"
    });
    expectSafeMetadata(activityMetadata());
  });

  it("pushback still resolves when append and diagnostic logging both fail", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    vi.mocked(createActivityLog).mockRejectedValueOnce(new Error("activity log write failed"));

    await expect(pushDeliveryProofToGoogleSheets(pushbackInput())).resolves.toMatchObject({
      result: "failed",
      errorCode: "PUSHBACK_UNKNOWN_ERROR"
    });

    expect(warnSpy).toHaveBeenCalledWith("Google Sheets push-back diagnostic log failed for crm_pushback.failed.");
    expect(warnSpy).toHaveBeenCalledWith("Google Sheets push-back failed: PUSHBACK_UNKNOWN_ERROR.");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("manual replay metadata includes source and safe status fields", async () => {
    await pushDeliveryProofToGoogleSheets({
      ...pushbackInput(),
      source: "manual_replay",
      draftId: "draft1",
      leadId: "lead1",
      deliveryStatus: "delivered",
      sendStatus: "sent",
      safeSummaryOverride: "Replay manuel du statut livre"
    });

    expect(activityMetadata()).toMatchObject({
      source: "manual_replay",
      draftId: "draft1",
      leadId: "lead1",
      deliveryStatus: "delivered",
      sendStatus: "sent"
    });

    const [, requestInit] = mockFetch.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.values[0][15]).toBe("Replay manuel du statut livre");
    expectSafeMetadata(activityMetadata());
  });
});
