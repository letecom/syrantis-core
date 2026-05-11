import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobTypeSchema } from "@syrantis/shared";

import { createActivityLog } from "../repositories/activity-logs.js";
import {
  findLeadForLeadScorePushback,
  findScoreForLeadScorePushback,
  hasSucceededLeadScorePushback,
} from "../repositories/lead-score-pushback.js";
import {
  buildLeadScorePushbackRow,
  handleLeadScorePushbackJob,
} from "../services/lead-score-pushback-job-handler.js";
import { testUser } from "./mocks/auth.js";

const mockGoogleAuthState = vi.hoisted(() => ({
  getClient: vi.fn(async () => ({
    getAccessToken: vi.fn(async () => ({ token: "mock-token" })),
  })),
}));

vi.mock("google-auth-library", () => {
  class GoogleAuth {
    getClient = mockGoogleAuthState.getClient;
  }
  return { GoogleAuth };
});

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ tx: "lead-score-pushback" }),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => ({
    id: "00000000-0000-4000-8000-000000023899",
    ...input,
  })),
}));

vi.mock("../repositories/lead-score-pushback.js", () => ({
  findLeadForLeadScorePushback: vi.fn(),
  findScoreForLeadScorePushback: vi.fn(),
  hasSucceededLeadScorePushback: vi.fn(),
}));

const leadId = "00000000-0000-4000-8000-000000023101";
const scoreId = "00000000-0000-4000-8000-000000023201";
const jobId = "00000000-0000-4000-8000-000000023301";
const diagnosticTraceId = "00000000-0000-4000-8000-000000023401";
const spreadsheetId = "1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc";
const mockFetch = vi.fn();
global.fetch = mockFetch;

function credentialsJson() {
  return JSON.stringify({
    client_email: "test@example.invalid",
    private_key: "test-key",
  });
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: leadId,
    source: "email",
    createdAt: new Date("2026-05-04T09:55:00.000Z"),
    normalizedJson: {
      externalId: "=external-123",
      source: "+public_inbound_message",
      fromEmail: "-client@example.com",
      contactName: "@Alice Artisan",
      subject: "=Urgent chaudiere",
      intent: "quote_request",
      urgency: "high",
      bodyText: "forbidden stored body",
      bodySummary: "forbidden body summary",
      htmlBody: "<p>forbidden html</p>",
      rawPayload: { forbidden: true },
      prompt: "forbidden prompt",
      rawAiOutput: "forbidden raw output",
      providerPayload: "forbidden provider payload",
      token: "forbidden-token",
      Authorization: "Bearer forbidden",
    },
    ...overrides,
  };
}

function scoreRow(overrides: Record<string, unknown> = {}) {
  return {
    id: scoreId,
    leadId,
    score: 82,
    qualification: "hot",
    confidence: 88,
    recommendedAction: "=Call today and prepare a quote follow-up.",
    createdAt: new Date("2026-05-04T10:00:00.000Z"),
    ...overrides,
  };
}

function input() {
  return {
    workspaceId: testUser.workspaceId,
    jobId,
    payload: {
      leadId,
      scoreId,
      diagnosticTraceId,
      source: "score_lead" as const,
    },
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
  return (lastActivityLogInput().metadataJson ?? {}) as Record<string, unknown>;
}

function expectSafeMetadata(metadata: Record<string, unknown>) {
  const serialized = JSON.stringify(metadata);

  for (const forbidden of [
    "client@example.com",
    "Alice",
    "Urgent chaudiere",
    "bodyText",
    "bodySummary",
    "htmlBody",
    "rawPayload",
    "prompt",
    "rawAiOutput",
    "providerPayload",
    "Authorization",
    "token",
    "workspaceId",
    spreadsheetId,
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("lead score Google Sheets pushback", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mockGoogleAuthState.getClient.mockResolvedValue({
      getAccessToken: vi.fn(async () => ({ token: "mock-token" })),
    });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });

    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = credentialsJson();
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheetId;

    vi.mocked(hasSucceededLeadScorePushback).mockResolvedValue(false);
    vi.mocked(findLeadForLeadScorePushback).mockResolvedValue(leadRow());
    vi.mocked(findScoreForLeadScorePushback).mockResolvedValue(scoreRow());
  });

  it("shared JobTypeSchema accepts pushback_lead_score", () => {
    expect(JobTypeSchema.parse("pushback_lead_score")).toBe("pushback_lead_score");
  });

  it("builds the exact Score_Log row with formula-safe text fields", () => {
    vi.setSystemTime(new Date("2026-05-04T10:00:03.000Z"));

    const row = buildLeadScorePushbackRow({
      lead: leadRow(),
      score: scoreRow(),
      diagnosticTraceId,
      syncedAt: new Date(),
    });

    expect(row).toEqual([
      "score_pushback",
      "2026-05-04T10:00:00.000Z",
      leadId,
      "'=external-123",
      "'+public_inbound_message",
      "'-client@example.com",
      "'@Alice Artisan",
      "'=Urgent chaudiere",
      82,
      "hot",
      "quote_request",
      "high",
      88,
      "'=Call today and prepare a quote follow-up.",
      diagnosticTraceId,
      "2026-05-04T10:00:03.000Z",
    ]);
  });

  it("appends the Score_Log row and never includes forbidden lead or AI payload fields", async () => {
    vi.setSystemTime(new Date("2026-05-04T10:00:03.000Z"));

    await handleLeadScorePushbackJob(input());

    const [url, requestInit] = mockFetch.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain("/values/Score_Log!A%3AP:append");
    expect(requestInit.method).toBe("POST");

    const body = JSON.parse(requestInit.body as string);
    const row = body.values[0];
    expect(row).toHaveLength(16);
    expect(row[5]).toBe("'-client@example.com");
    expect(row[6]).toBe("'@Alice Artisan");
    expect(row[7]).toBe("'=Urgent chaudiere");

    const serializedRow = JSON.stringify(row);
    expect(serializedRow).not.toContain("forbidden stored body");
    expect(serializedRow).not.toContain("forbidden body summary");
    expect(serializedRow).not.toContain("forbidden html");
    expect(serializedRow).not.toContain("forbidden prompt");
    expect(serializedRow).not.toContain("forbidden raw output");
    expect(serializedRow).not.toContain("forbidden provider payload");
    expect(serializedRow).not.toContain("forbidden-token");
  });

  it("writes succeeded metadata with no PII and a masked spreadsheet ID", async () => {
    await handleLeadScorePushbackJob(input());

    expect(lastActivityLogInput()).toMatchObject({
      workspaceId: testUser.workspaceId,
      action: "lead_score_pushback.succeeded",
      entityType: "lead",
      entityId: leadId,
    });
    expect(activityMetadata()).toEqual({
      leadId,
      scoreId,
      diagnosticTraceId,
      maskedSpreadsheetId: "1tml...w7lc",
      range: "Score_Log!A:P",
      columnsAppended: 16,
      durationMs: expect.any(Number),
      source: "google_sheets",
    });
    expectSafeMetadata(activityMetadata());
  });

  it("skips without append when a succeeded activity log already exists for the scoreId", async () => {
    vi.mocked(hasSucceededLeadScorePushback).mockResolvedValue(true);

    await expect(handleLeadScorePushbackJob(input())).resolves.toEqual({
      result: "skipped",
      reason: "ALREADY_PUSHED",
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(findLeadForLeadScorePushback).not.toHaveBeenCalled();
    expect(lastActivityLogInput().action).toBe("lead_score_pushback.skipped");
    expect(activityMetadata()).toEqual({
      leadId,
      scoreId,
      diagnosticTraceId,
      reason: "ALREADY_PUSHED",
      source: "google_sheets",
    });
    expectSafeMetadata(activityMetadata());
  });

  it("skips with safe metadata when Google Sheets pushback is disabled", async () => {
    process.env.GOOGLE_SHEETS_PUSH_ENABLED = "false";

    await handleLeadScorePushbackJob(input());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(lastActivityLogInput().action).toBe("lead_score_pushback.skipped");
    expect(activityMetadata()).toEqual({
      leadId,
      scoreId,
      diagnosticTraceId,
      reason: "PUSHBACK_DISABLED",
      source: "google_sheets",
    });
    expectSafeMetadata(activityMetadata());
  });

  it("skips missing lead or score with safe reasons", async () => {
    vi.mocked(findLeadForLeadScorePushback).mockResolvedValueOnce(null);

    await expect(handleLeadScorePushbackJob(input())).resolves.toEqual({
      result: "skipped",
      reason: "LEAD_NOT_FOUND",
    });
    expect(activityMetadata()).toMatchObject({ reason: "LEAD_NOT_FOUND" });

    vi.clearAllMocks();
    vi.mocked(hasSucceededLeadScorePushback).mockResolvedValue(false);
    vi.mocked(findLeadForLeadScorePushback).mockResolvedValue(leadRow());
    vi.mocked(findScoreForLeadScorePushback).mockResolvedValue(null);

    await expect(handleLeadScorePushbackJob(input())).resolves.toEqual({
      result: "skipped",
      reason: "SCORE_NOT_FOUND",
    });
    expect(activityMetadata()).toMatchObject({ reason: "SCORE_NOT_FOUND" });
    expectSafeMetadata(activityMetadata());
  });

  it("logs failed metadata with a closed safe error code and no raw Google error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden raw Google response with client@example.com",
    });

    await expect(handleLeadScorePushbackJob(input())).rejects.toThrow("GOOGLE_SHEETS_AUTH_FAILED");

    expect(lastActivityLogInput().action).toBe("lead_score_pushback.failed");
    expect(activityMetadata()).toEqual({
      leadId,
      scoreId,
      diagnosticTraceId,
      maskedSpreadsheetId: "1tml...w7lc",
      errorCode: "GOOGLE_SHEETS_AUTH_FAILED",
      durationMs: expect.any(Number),
      source: "google_sheets",
    });
    expect(JSON.stringify(activityMetadata())).not.toContain("Forbidden raw Google response");
    expectSafeMetadata(activityMetadata());
    warnSpy.mockRestore();
  });
});
