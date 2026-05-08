import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminOpsHealthResponseSchema,
  adminOpsRecentChecksResponseSchema,
  adminOpsRunCheckResponseSchema,
  type AdminOpsCheckId,
  type AuthMe,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createAdminOpsRoutes } from "../routes/admin-ops.js";
import {
  allowedAdminOpsCheckIds,
  createProductionAdminOpsService,
  type CreateAdminOpsServiceDependencies,
} from "../services/admin-ops.js";
import type { AuthService } from "../services/auth.js";
import type { GoogleSheetsSetupService } from "../services/google-sheets-setup.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const repositoryState = vi.hoisted(() => ({
  dbHealth: { latencyMs: 7 },
  workerSummary: {
    pending: 2,
    running: 1,
    failed: 0,
    oldestPendingMinutes: 12,
  },
  recentSince: [] as Array<{
    type: "admin_ops.check_succeeded" | "admin_ops.check_failed" | "admin_ops.check_skipped";
    metadataJson: Record<string, unknown>;
    createdAt: Date;
  }>,
  recentLogs: [] as Array<{
    type: "admin_ops.check_succeeded" | "admin_ops.check_failed" | "admin_ops.check_skipped";
    metadataJson: Record<string, unknown>;
    createdAt: Date;
  }>,
  createdLogs: [] as Array<{
    workspaceId: string;
    actorUserId: string;
    action: string;
    metadataJson: Record<string, unknown>;
  }>,
  failDbHealth: false,
  failWorkerSummary: false,
}));

const validDiagnosticTraceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondDiagnosticTraceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const forbiddenSpreadsheetId = "1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc";

function repository(): NonNullable<CreateAdminOpsServiceDependencies["repository"]> {
  return {
    checkDbHealth: vi.fn(async () => {
      if (repositoryState.failDbHealth) {
        throw new Error("database raw failure");
      }

      return repositoryState.dbHealth;
    }),
    getWorkerQueueSummary: vi.fn(async () => {
      if (repositoryState.failWorkerSummary) {
        throw new Error("worker raw failure");
      }

      return repositoryState.workerSummary;
    }),
    writeCheckActivityLog: vi.fn(async (input) => {
      repositoryState.createdLogs.push(input);
      return { id: "00000000-0000-4000-8000-000000023e99" };
    }),
    findRecentCheckLogs: vi.fn(async () => repositoryState.recentLogs),
    findRecentCheckLogsSince: vi.fn(async () => repositoryState.recentSince),
  };
}

function googleSheetsSetupService(
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
      lastTest: {
        result: "succeeded",
        diagnosticTraceId: validDiagnosticTraceId,
        errorCode: null,
        testedAt: "2026-05-08T10:00:00.000Z",
      },
      spreadsheetId: forbiddenSpreadsheetId,
      client_email: "forbidden-client-email",
      private_key: "forbidden-private-key",
      rawGoogle: "forbidden-raw-google",
    })),
    runSetupTest: vi.fn(async () => ({
      result: "succeeded",
      diagnosticTraceId: secondDiagnosticTraceId,
      testedAt: "2026-05-08T10:01:00.000Z",
      errorCode: null,
      errorSummary: null,
      verification: {
        rangeTested: "Verification!A:E",
        rowsAppended: 1,
      },
      rawGoogle: "forbidden-test-raw-google",
      workspaceId: "forbidden-test-workspace",
    })),
    ...overrides,
  } as GoogleSheetsSetupService;
}

function service(overrides: Partial<GoogleSheetsSetupService> = {}) {
  return createProductionAdminOpsService({
    repository: repository(),
    googleSheetsSetupService: googleSheetsSetupService(overrides),
  });
}

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

function createOpsApp(user: AuthMe | null = testUser, adminOpsService = service()) {
  const app = new Hono();
  app.route(
    "/api/admin/ops",
    createAdminOpsRoutes({
      authService: authServiceFor(user),
      adminOpsService,
    }),
  );
  return app;
}

function expectSafePayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    forbiddenSpreadsheetId,
    "forbidden-client-email",
    "forbidden-private-key",
    "forbidden-raw-google",
    "forbidden-test-raw-google",
    "forbidden-test-workspace",
    "PRIVATE KEY",
    "private_key",
    "client_email",
    "GOOGLE_SHEETS_CREDENTIALS_JSON",
    "provider_message_id",
    "providerMessageId",
    "metadata_json",
    "payload_json",
    "rawPayload",
    "rawProvider",
    "subject",
    "htmlBody",
    "textBody",
    "contactEmail",
    "leadLabel",
    "workspaceId",
    "workspace_id",
    "database raw failure",
    "worker raw failure",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

beforeEach(() => {
  repositoryState.dbHealth = { latencyMs: 7 };
  repositoryState.workerSummary = {
    pending: 2,
    running: 1,
    failed: 0,
    oldestPendingMinutes: 12,
  };
  repositoryState.recentSince = [];
  repositoryState.recentLogs = [];
  repositoryState.createdLogs = [];
  repositoryState.failDbHealth = false;
  repositoryState.failWorkerSummary = false;
  vi.clearAllMocks();
});

describe("admin ops routes", () => {
  it("GET health returns 401 without session", async () => {
    const adminOpsService = service();
    const response = await createOpsApp(testUser, adminOpsService).request("/api/admin/ops/health");

    expect(response.status).toBe(401);
  });

  it("GET health returns 403 for non-admin users", async () => {
    const response = await createOpsApp({ ...testUser, role: "operator" }).request(
      "/api/admin/ops/health",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
  });

  it("GET health returns 200 for admin with a safe DTO", async () => {
    const response = await createOpsApp().request("/api/admin/ops/health", {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminOpsHealthResponseSchema.parse(body)).toEqual(body);
    expect(body.data).toMatchObject({
      api: { status: "ok" },
      db: { status: "ok", latencyMs: 7 },
      googleSheets: { status: "ok", configured: true },
      workerQueue: { status: "ok", pending: 2, running: 1, failed: 0 },
    });
    expect(repositoryState.createdLogs).toEqual([]);
    expectSafePayload(body);
  });

  it.each(allowedAdminOpsCheckIds)("POST %s returns 200 for admin", async (checkId) => {
    const response = await createOpsApp().request(`/api/admin/ops/checks/${checkId}`, {
      method: "POST",
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminOpsRunCheckResponseSchema.parse(body)).toEqual(body);
    expect(body.data.checkId).toBe(checkId);
    expect(repositoryState.createdLogs).toHaveLength(1);
    expect(repositoryState.createdLogs[0]?.action).toBe(`admin_ops.check_${body.data.result}`);
    expectSafePayload(body);
    expectSafePayload(repositoryState.createdLogs[0]?.metadataJson);

    repositoryState.createdLogs = [];
  });

  it("POST unknown check returns 400", async () => {
    const response = await createOpsApp().request("/api/admin/ops/checks/api-restart", {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unknown check.",
      code: "UNKNOWN_CHECK",
    });
    expect(repositoryState.createdLogs).toEqual([]);
  });

  it("POST returns 401 without session", async () => {
    const response = await createOpsApp().request("/api/admin/ops/checks/api-health", {
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  it("POST returns 403 for non-admin users", async () => {
    const response = await createOpsApp({ ...testUser, role: "operator" }).request(
      "/api/admin/ops/checks/api-health",
      { method: "POST", headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(repositoryState.createdLogs).toEqual([]);
  });

  it("rejects client-provided workspace material in query body or headers", async () => {
    const queryResponse = await createOpsApp().request(
      "/api/admin/ops/health?workspaceId=00000000-0000-4000-8000-000000000001",
      { headers: validSessionHeaders() },
    );
    const bodyResponse = await createOpsApp().request("/api/admin/ops/checks/api-health", {
      method: "POST",
      headers: {
        ...validSessionHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspace_id: "00000000-0000-4000-8000-000000000001" }),
    });
    const headerResponse = await createOpsApp().request("/api/admin/ops/checks/api-health", {
      method: "POST",
      headers: {
        ...validSessionHeaders(),
        "x-workspace-id": "00000000-0000-4000-8000-000000000001",
      },
    });

    expect(queryResponse.status).toBe(400);
    expect(bodyResponse.status).toBe(400);
    expect(headerResponse.status).toBe(400);
  });

  it("google-sheets-test cooldown returns skipped and writes one admin ops log", async () => {
    repositoryState.recentSince = [
      {
        type: "admin_ops.check_succeeded",
        metadataJson: {
          source: "admin_ui",
          checkId: "google-sheets-test",
          result: "succeeded",
          diagnosticTraceId: validDiagnosticTraceId,
          durationMs: 12,
        },
        createdAt: new Date("2026-05-08T10:00:00.000Z"),
      },
    ];
    const setupService = googleSheetsSetupService();
    const adminOpsService = createProductionAdminOpsService({
      repository: repository(),
      googleSheetsSetupService: setupService,
    });

    const response = await createOpsApp(testUser, adminOpsService).request(
      "/api/admin/ops/checks/google-sheets-test",
      { method: "POST", headers: validSessionHeaders() },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      checkId: "google-sheets-test",
      result: "skipped",
      errorCode: "OPS_CHECK_COOLDOWN",
    });
    expect(setupService.runSetupTest).not.toHaveBeenCalled();
    expect(repositoryState.createdLogs).toHaveLength(1);
    expect(repositoryState.createdLogs[0]).toMatchObject({
      action: "admin_ops.check_skipped",
      metadataJson: {
        source: "admin_ui",
        checkId: "google-sheets-test",
        result: "skipped",
        errorCode: "OPS_CHECK_COOLDOWN",
      },
    });
  });

  it("writes exactly one admin ops activity log with safe metadata", async () => {
    const response = await createOpsApp().request("/api/admin/ops/checks/worker-queue-summary", {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(repositoryState.createdLogs).toHaveLength(1);
    expect(repositoryState.createdLogs[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      action: "admin_ops.check_succeeded",
      metadataJson: {
        source: "admin_ui",
        checkId: "worker-queue-summary",
        result: "succeeded",
        pending: 2,
        running: 1,
        failed: 0,
        oldestPendingMinutes: 12,
      },
    });
    expectSafePayload(repositoryState.createdLogs[0]?.metadataJson);
  });

  it("recent checks returns mapped DTO and not raw metadata", async () => {
    repositoryState.recentLogs = [
      {
        type: "admin_ops.check_failed",
        metadataJson: {
          source: "admin_ui",
          checkId: "db-health",
          result: "failed",
          diagnosticTraceId: validDiagnosticTraceId,
          durationMs: 5000,
          errorCode: "OPS_CHECK_TIMEOUT",
          errorSummary: "Check timed out.",
          rawProvider: "forbidden-provider",
          payload_json: { hidden: true },
          workspaceId: "forbidden-workspace",
        },
        createdAt: new Date("2026-05-08T10:02:00.000Z"),
      },
    ];

    const response = await createOpsApp().request("/api/admin/ops/checks/recent?limit=20", {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminOpsRecentChecksResponseSchema.parse(body)).toEqual(body);
    expect(body.data.checks).toEqual([
      {
        checkId: "db-health",
        result: "failed",
        diagnosticTraceId: validDiagnosticTraceId,
        runAt: "2026-05-08T10:02:00.000Z",
        durationMs: 5000,
        errorCode: "OPS_CHECK_TIMEOUT",
        errorSummary: "Check timed out.",
      },
    ]);
    expectSafePayload(body);
  });

  it("recent checks caps limit at 50 and validates checkId", async () => {
    const cappedResponse = await createOpsApp().request("/api/admin/ops/checks/recent?limit=500", {
      headers: validSessionHeaders(),
    });
    const invalidCheckResponse = await createOpsApp().request(
      "/api/admin/ops/checks/recent?checkId=api-restart",
      { headers: validSessionHeaders() },
    );

    expect(cappedResponse.status).toBe(200);
    expect((await cappedResponse.json()).data.limit).toBe(50);
    expect(invalidCheckResponse.status).toBe(400);
  });
});

describe("admin ops service safety", () => {
  it("GET health downgrades raw failures to safe status", async () => {
    repositoryState.failDbHealth = true;
    const health = await service().getHealth(testUser.workspaceId);

    expect(health.status).toBe("unhealthy");
    expect(health.db).toEqual({ status: "error", latencyMs: null });
    expectSafePayload(health);
  });

  it("worker queue summary source does not select payload_json", () => {
    const source = readFileSync(new URL("../repositories/admin-ops.ts", import.meta.url), "utf8");

    expect(source).not.toContain("payloadJson");
    expect(source).not.toContain("payload_json");
  });

  it("ops backend files do not include forbidden command patterns", () => {
    const combined = [
      "../routes/admin-ops.ts",
      "../services/admin-ops.ts",
      "../repositories/admin-ops.ts",
    ]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");

    expect(combined).not.toMatch(/child_process|spawn|process\.exit|restart|reload/);
    expect(combined).not.toMatch(/\bexec\b/);
    expect(combined).not.toContain("api-restart");
    expect(combined).not.toContain("worker-restart");
    expect(combined).not.toContain("arbitrary-shell");
    expect(combined).not.toContain("arbitrary-sql");
  });

  it.each([
    "api-health",
    "db-health",
    "google-sheets-status",
    "google-sheets-test",
    "worker-queue-summary",
  ] as AdminOpsCheckId[])("implements allowed check %s", async (checkId) => {
    const run = await service().runCheck({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      checkId,
    });

    expect(run.checkId).toBe(checkId);
    expect(["succeeded", "failed", "skipped"]).toContain(run.result);
    expect(repositoryState.createdLogs).toHaveLength(1);
    repositoryState.createdLogs = [];
  });
});
