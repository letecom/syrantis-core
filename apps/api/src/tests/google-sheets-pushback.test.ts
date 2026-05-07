import type { MockInstance } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { pushDeliveryProofToGoogleSheets } from "../services/pushback/google-sheets.js";
import { findPushbackData } from "../repositories/pushback.js";

vi.mock("google-auth-library", () => {
  class GoogleAuth {
    getClient() {
      return Promise.resolve({
        getAccessToken: () => Promise.resolve({ token: "mock-token" })
      });
    }
  }
  return { GoogleAuth };
});

vi.mock("../repositories/pushback.js", () => ({
  findPushbackData: vi.fn()
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Google Sheets Pushback MVP", () => {
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = JSON.stringify({ client_email: "test@test", private_key: "key" });
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet123";
    process.env.GOOGLE_SHEETS_PUSHBACK_RANGE = "Pushback_Log!A:Q";
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("no-ops when GOOGLE_SHEETS_PUSH_ENABLED is not exactly 'true'", async () => {
    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "false";
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();

    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "TRUE";
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no-ops when GOOGLE_SHEETS_CREDENTIALS_JSON is missing", async () => {
    delete process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("missing credentials"));
  });

  it("no-ops when GOOGLE_SHEETS_SPREADSHEET_ID is missing", async () => {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("missing credentials"));
  });

  it("no-ops when GOOGLE_SHEETS_PUSHBACK_RANGE is missing", async () => {
    delete process.env.GOOGLE_SHEETS_PUSHBACK_RANGE;
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("missing credentials"));
  });

  it("pushes back successfully when GOOGLE_SHEETS_CREDENTIALS_JSON is raw JSON", async () => {
    vi.mocked(findPushbackData).mockResolvedValue({
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
      safe_summary: "Subject"
    });
    mockFetch.mockResolvedValue({ ok: true });
    
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = JSON.stringify({ client_email: "raw@test", private_key: "raw_key" });
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("pushes back successfully when GOOGLE_SHEETS_CREDENTIALS_JSON is a path to a temp JSON file", async () => {
    const tempFile = path.join(os.tmpdir(), `syrantis-test-creds-${Date.now()}.json`);
    writeFileSync(tempFile, JSON.stringify({ client_email: "file@test", private_key: "file_key" }));
    
    vi.mocked(findPushbackData).mockResolvedValue({
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
      safe_summary: "Subject"
    });
    mockFetch.mockResolvedValue({ ok: true });
    
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = tempFile;
    
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    unlinkSync(tempFile);
  });

  it("no-ops safely when the path does not exist", async () => {
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = "/path/that/does/not/exist/123.json";
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse GOOGLE_SHEETS_CREDENTIALS_JSON."));
  });

  it("no-ops safely when the file contains invalid JSON", async () => {
    const tempFile = path.join(os.tmpdir(), `syrantis-test-invalid-${Date.now()}.json`);
    writeFileSync(tempFile, "this is not valid json");
    
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = tempFile;
    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1", emailSendId: "send1", eventType: "email.delivered", occurredAt: new Date()
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse GOOGLE_SHEETS_CREDENTIALS_JSON."));
    unlinkSync(tempFile);
  });

  it("pushes back formatted row to Google Sheets exactly as required", async () => {
    const occurredAt = new Date("2026-05-04T10:00:02.000Z");
    vi.mocked(findPushbackData).mockResolvedValue({
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
      safe_summary: "Subject"
    });

    mockFetch.mockResolvedValue({ ok: true });

    vi.setSystemTime(new Date("2026-05-04T10:00:03.000Z"));

    await pushDeliveryProofToGoogleSheets({
      workspaceId: "w1",
      emailSendId: "send1",
      eventType: "email.delivered",
      occurredAt
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const calls = mockFetch.mock.calls;
    if (!calls || calls.length === 0) throw new Error("mockFetch not called");
    
    const [url, requestInit] = calls[0] as [URL, RequestInit];
    expect(url.href).toContain("https://sheets.googleapis.com/v4/spreadsheets/sheet123/values/Pushback_Log!A%3AQ:append");
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
      "Subject",
      "2026-05-04T10:00:03.000Z"
    ]);

    const rawPayload = JSON.stringify(body);
    expect(rawPayload).not.toContain("provider_message_id");
    expect(rawPayload).not.toContain("providerMessageId");
    expect(rawPayload).not.toContain("raw payload");
    expect(rawPayload).not.toContain("raw provider error");
    expect(rawPayload).not.toContain("htmlBody");
    expect(rawPayload).not.toContain("textBody");
  });

  it("does not crash on fetch failure and returns non-throwing failure result without stacktrace", async () => {
    vi.mocked(findPushbackData).mockResolvedValue({
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
      safe_summary: "Subject"
    });

    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(pushDeliveryProofToGoogleSheets({
      workspaceId: "w1",
      emailSendId: "send1",
      eventType: "email.delivered",
      occurredAt: new Date("2026-05-04T10:00:02.000Z")
    })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    const calls = errorSpy.mock.calls;
    if (!calls || calls.length === 0) throw new Error("errorSpy not called");
    expect(calls[0]![0]).toContain("Error pushing to Google Sheets:");
  });
});
