import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GoogleSheetsSetupStatusSchema,
  GoogleSheetsSetupTestResponseSchema,
  type AuthMe,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createIntegrationRoutes } from "../routes/integrations.js";
import type { AuthService } from "../services/auth.js";
import {
  type AppendGoogleSheetsVerificationRow,
  createTestGoogleSheetsSetupService,
  type GoogleSheetsSetupService,
} from "../services/google-sheets-setup.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const repositoryState = vi.hoisted(() => ({
  latestLog: null as null | {
    id: string;
    type:
      | "google_sheets_setup.test_succeeded"
      | "google_sheets_setup.test_failed"
      | "google_sheets_setup.test_skipped";
    metadataJson: Record<string, unknown>;
    createdAt: Date;
  },
  createdLogs: [] as Array<Record<string, unknown>>,
}));

const mockDb = vi.hoisted(() => ({
  tx: {} as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/google-sheets-setup.js", () => ({
  findLatestGoogleSheetsSetupActivityLog: vi.fn(async () => repositoryState.latestLog),
  createGoogleSheetsSetupActivityLog: vi.fn(
    async (_tx: unknown, input: Record<string, unknown>) => {
      repositoryState.createdLogs.push(input);
      return { id: "00000000-0000-4000-8000-000000023c99" };
    },
  ),
}));

const validCredentials = JSON.stringify({
  client_email: "service-account@example.test",
  private_key: "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----\\n",
});
const spreadsheetId = "1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc";

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function createSetupApp(
  googleSheetsSetupService: GoogleSheetsSetupService,
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/integrations",
    createIntegrationRoutes({
      authService: authServiceFor(user),
      googleSheetsSetupService,
    }),
  );
  return app;
}

function setupServiceResult(
  overrides: Partial<GoogleSheetsSetupService> = {},
): GoogleSheetsSetupService {
  return {
    getSetupStatus: vi.fn(async () => ({
      enabled: true,
      configured: true,
      credentialsConfigured: true,
      spreadsheetConfigured: true,
      spreadsheetIdMasked: "1tml...w7lc",
      pushbackRangeConfigured: true,
      verificationRangeConfigured: true,
      pushbackRangeLabel: "Pushback_Log!A:Q",
      verificationRangeLabel: "Verification!A:E",
      lastTest: null,
    })),
    runSetupTest: vi.fn(async () => ({
      result: "succeeded" as const,
      diagnosticTraceId: "00000000-0000-4000-8000-000000023c01",
      testedAt: "2026-05-07T10:00:00.000Z",
      errorCode: null,
      errorSummary: null,
      verification: {
        rangeTested: "Verification!A:E",
        rowsAppended: 1,
      },
    })),
    ...overrides,
  };
}

function setCompleteSheetsEnv() {
  process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
  process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = validCredentials;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheetId;
  process.env.GOOGLE_SHEETS_PUSHBACK_RANGE = "Pushback_Log!A:Q";
  process.env.GOOGLE_SHEETS_VERIFICATION_RANGE = "Verification!A:E";
}

function clearSheetsEnv() {
  delete process.env.GOOGLE_SHEETS_PUSH_ENABLED;
  delete process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  delete process.env.GOOGLE_SHEETS_PUSHBACK_RANGE;
  delete process.env.GOOGLE_SHEETS_VERIFICATION_RANGE;
}

function expectSafePayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    spreadsheetId,
    "service-account@example.test",
    "PRIVATE KEY",
    "private_key",
    "client_email",
    "GOOGLE_SHEETS_CREDENTIALS_JSON",
    "raw Google",
    "rawProvider",
    "provider_message_id",
    "providerMessageId",
    "Private subject",
    "htmlBody",
    "textBody",
    "contactEmail",
    "leadLabel",
    "workspaceId",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("Google Sheets setup routes", () => {
  it("GET setup-status returns 401 without session", async () => {
    const service = setupServiceResult();
    const response = await createSetupApp(service).request(
      "/api/integrations/google-sheets/setup-status",
    );

    expect(response.status).toBe(401);
    expect(service.getSetupStatus).not.toHaveBeenCalled();
  });

  it("GET setup-status is forbidden for non-admin users", async () => {
    const service = setupServiceResult();
    const response = await createSetupApp(service, { ...testUser, role: "operator" }).request(
      "/api/integrations/google-sheets/setup-status",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
    expect(service.getSetupStatus).not.toHaveBeenCalled();
  });

  it("GET setup-status returns admin 200 through the shared response schema", async () => {
    const service = setupServiceResult();
    const response = await createSetupApp(service).request(
      "/api/integrations/google-sheets/setup-status",
      { headers: validSessionHeaders() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(GoogleSheetsSetupStatusSchema.parse(body.data)).toEqual(body.data);
    expect(service.getSetupStatus).toHaveBeenCalledWith(testUser.workspaceId);
  });

  it("POST setup-test returns 401 without session", async () => {
    const service = setupServiceResult();
    const response = await createSetupApp(service).request(
      "/api/integrations/google-sheets/setup-test",
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    expect(service.runSetupTest).not.toHaveBeenCalled();
  });

  it("POST setup-test returns admin success through the shared response schema", async () => {
    const service = setupServiceResult();
    const response = await createSetupApp(service).request(
      "/api/integrations/google-sheets/setup-test",
      { method: "POST", headers: validSessionHeaders() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(GoogleSheetsSetupTestResponseSchema.parse(body.data)).toEqual(body.data);
    expect(service.runSetupTest).toHaveBeenCalledWith(testUser.workspaceId, testUser.id);
    expectSafePayload(body);
  });
});

describe("Google Sheets setup service", () => {
  beforeEach(() => {
    clearSheetsEnv();
    repositoryState.latestLog = null;
    repositoryState.createdLogs = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearSheetsEnv();
    vi.restoreAllMocks();
  });

  it("masks spreadsheet id and never returns credentials in setup status", async () => {
    setCompleteSheetsEnv();
    repositoryState.latestLog = {
      id: "00000000-0000-4000-8000-000000023c10",
      type: "google_sheets_setup.test_failed",
      metadataJson: {
        diagnosticTraceId: "00000000-0000-4000-8000-000000023c11",
        errorCode: "PUSHBACK_APPEND_FAILED",
        rawGoogle: "raw Google should not leak",
      },
      createdAt: new Date("2026-05-07T09:00:00.000Z"),
    };

    const status = await createTestGoogleSheetsSetupService(vi.fn()).getSetupStatus(
      testUser.workspaceId,
    );

    expect(status).toMatchObject({
      enabled: true,
      configured: true,
      credentialsConfigured: true,
      spreadsheetConfigured: true,
      spreadsheetIdMasked: "1tml...w7lc",
      pushbackRangeConfigured: true,
      verificationRangeConfigured: true,
      pushbackRangeLabel: "Pushback_Log!A:Q",
      verificationRangeLabel: "Verification!A:E",
      lastTest: {
        result: "failed",
        diagnosticTraceId: "00000000-0000-4000-8000-000000023c11",
        errorCode: "PUSHBACK_APPEND_FAILED",
        testedAt: "2026-05-07T09:00:00.000Z",
      },
    });
    expectSafePayload(status);
    expect(repositoryState.createdLogs).toEqual([]);
  });

  it("POST setup-test appends a safe verification row with a mocked Google helper", async () => {
    setCompleteSheetsEnv();
    const appendInputs: Array<Parameters<AppendGoogleSheetsVerificationRow>[0]> = [];
    const appendVerificationRow = vi.fn(
      async (input: Parameters<AppendGoogleSheetsVerificationRow>[0]) => {
        appendInputs.push(input);
        return { rowsAppended: 1 };
      },
    );

    const result = await createTestGoogleSheetsSetupService(appendVerificationRow).runSetupTest(
      testUser.workspaceId,
      testUser.id,
    );

    expect(result).toMatchObject({
      result: "succeeded",
      errorCode: null,
      errorSummary: null,
      verification: {
        rangeTested: "Verification!A:E",
        rowsAppended: 1,
      },
    });
    expect(appendVerificationRow).toHaveBeenCalledTimes(1);
    const appendInput = appendInputs[0];
    expect(appendInput).toBeDefined();
    expect(appendInput).toMatchObject({
      spreadsheetId,
      range: "Verification!A:E",
    });
    expect(appendInput?.row).toEqual([
      "SYRANTIS_SETUP_TEST",
      result.testedAt,
      result.diagnosticTraceId,
      "attempted",
    ]);
    expect(JSON.stringify(appendInput?.row)).not.toContain("Private subject");
    expect(repositoryState.createdLogs).toHaveLength(1);
    expect(repositoryState.createdLogs[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      action: "google_sheets_setup.test_succeeded",
      metadataJson: {
        source: "admin_ui",
        diagnosticTraceId: result.diagnosticTraceId,
        result: "succeeded",
        verificationRangeConfigured: true,
        pushbackRangeConfigured: true,
      },
    });
    expectSafePayload({ result, metadata: repositoryState.createdLogs[0]?.metadataJson });
  });

  it("disabled or missing config returns skipped safe codes and writes one safe activity log", async () => {
    const cases = [
      {
        name: "disabled",
        env: () => undefined,
        errorCode: "PUSHBACK_DISABLED",
        verificationRangeConfigured: false,
        pushbackRangeConfigured: false,
      },
      {
        name: "missing credentials",
        env: () => {
          process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
          process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheetId;
          process.env.GOOGLE_SHEETS_PUSHBACK_RANGE = "Pushback_Log!A:Q";
          process.env.GOOGLE_SHEETS_VERIFICATION_RANGE = "Verification!A:E";
        },
        errorCode: "PUSHBACK_MISSING_CREDENTIALS",
        verificationRangeConfigured: true,
        pushbackRangeConfigured: true,
      },
      {
        name: "missing spreadsheet id",
        env: () => {
          process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
          process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = validCredentials;
          process.env.GOOGLE_SHEETS_PUSHBACK_RANGE = "Pushback_Log!A:Q";
          process.env.GOOGLE_SHEETS_VERIFICATION_RANGE = "Verification!A:E";
        },
        errorCode: "PUSHBACK_MISSING_SPREADSHEET_ID",
        verificationRangeConfigured: true,
        pushbackRangeConfigured: true,
      },
      {
        name: "missing verification range",
        env: () => {
          process.env.GOOGLE_SHEETS_PUSH_ENABLED = "true";
          process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = validCredentials;
          process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheetId;
          process.env.GOOGLE_SHEETS_PUSHBACK_RANGE = "Pushback_Log!A:Q";
        },
        errorCode: "PUSHBACK_MISSING_RANGE",
        verificationRangeConfigured: false,
        pushbackRangeConfigured: true,
      },
    ] as const;

    for (const testCase of cases) {
      clearSheetsEnv();
      repositoryState.createdLogs = [];
      testCase.env();

      const appendVerificationRow = vi.fn(async () => ({ rowsAppended: 1 }));
      const result = await createTestGoogleSheetsSetupService(appendVerificationRow).runSetupTest(
        testUser.workspaceId,
        testUser.id,
      );

      expect(result, testCase.name).toMatchObject({
        result: "skipped",
        errorCode: testCase.errorCode,
        verification: null,
      });
      expect(appendVerificationRow, testCase.name).not.toHaveBeenCalled();
      expect(repositoryState.createdLogs, testCase.name).toHaveLength(1);
      expect(repositoryState.createdLogs[0], testCase.name).toMatchObject({
        action: "google_sheets_setup.test_skipped",
        metadataJson: {
          source: "admin_ui",
          result: "skipped",
          errorCode: testCase.errorCode,
          verificationRangeConfigured: testCase.verificationRangeConfigured,
          pushbackRangeConfigured: testCase.pushbackRangeConfigured,
        },
      });
      expectSafePayload({ result, metadata: repositoryState.createdLogs[0]?.metadataJson });
    }
  });

  it("Google append errors map to safe PUSHBACK codes", async () => {
    setCompleteSheetsEnv();
    const appendVerificationRow = vi.fn(async () => {
      throw {
        phase: "google_sheets_append",
        status: 404,
        statusText: "Requested entity was not found",
        rawGoogle: "raw Google body should not leak",
      };
    });

    const result = await createTestGoogleSheetsSetupService(appendVerificationRow).runSetupTest(
      testUser.workspaceId,
      testUser.id,
    );

    expect(result).toMatchObject({
      result: "failed",
      errorCode: "PUSHBACK_SPREADSHEET_NOT_FOUND",
      errorSummary:
        "Google Sheets spreadsheet was not found or is not shared with the service account.",
      verification: null,
    });
    expect(repositoryState.createdLogs).toHaveLength(1);
    expect(repositoryState.createdLogs[0]).toMatchObject({
      action: "google_sheets_setup.test_failed",
      metadataJson: {
        source: "admin_ui",
        result: "failed",
        errorCode: "PUSHBACK_SPREADSHEET_NOT_FOUND",
        verificationRangeConfigured: true,
        pushbackRangeConfigured: true,
      },
    });
    expectSafePayload({ result, metadata: repositoryState.createdLogs[0]?.metadataJson });
  });

  it("GET setup-status does not write activity logs or call Google", async () => {
    setCompleteSheetsEnv();
    const appendVerificationRow = vi.fn(async () => ({ rowsAppended: 1 }));
    const service = createTestGoogleSheetsSetupService(appendVerificationRow);

    await service.getSetupStatus(testUser.workspaceId);

    expect(repositoryState.createdLogs).toEqual([]);
    expect(appendVerificationRow).not.toHaveBeenCalled();

    const combined = [
      readFileSync(new URL("../services/google-sheets-setup.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../repositories/google-sheets-setup.ts", import.meta.url), "utf8"),
    ].join("\n");

    expect(combined).not.toMatch(/delete\(|update\(|backgroundJobs|enqueue|provider_message_id/);
  });
});
