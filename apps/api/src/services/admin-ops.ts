import { randomUUID } from "node:crypto";

import {
  adminOpsCheckIdSchema,
  adminOpsHealthResponseSchema,
  adminOpsRecentChecksResponseSchema,
  adminOpsRunCheckResponseSchema,
  adminOpsWorkerFailedSummaryDataSchema,
  type AdminOpsCheckId,
  type AdminOpsHealthResponse,
  type AdminOpsRecentChecksResponse,
  type AdminOpsResult,
  type AdminOpsRunCheckResponse,
  type AdminOpsWorkerFailedSummaryData,
  type GoogleSheetsSetupStatus,
} from "@syrantis/shared";

import {
  checkAdminOpsDbHealth,
  findRecentAdminOpsCheckLogs,
  findRecentAdminOpsCheckLogsSince,
  getAdminOpsWorkerFailedSummaryGroups,
  getAdminOpsWorkerQueueSummary,
  writeAdminOpsCheckActivityLog,
  type AdminOpsActivityType,
  type AdminOpsCheckLogRow,
  type AdminOpsWorkerFailedSummaryGroup,
  type AdminOpsWorkerQueueSummary,
} from "../repositories/admin-ops.js";
import {
  createProductionGoogleSheetsSetupService,
  type GoogleSheetsSetupService,
} from "./google-sheets-setup.js";

const API_HEALTH_TIMEOUT_MS = 1_000;
const DB_HEALTH_TIMEOUT_MS = 5_000;
const WORKER_FAILED_TIMEOUT_MS = 5_000;
const WORKER_QUEUE_TIMEOUT_MS = 5_000;
const GOOGLE_SHEETS_TEST_COOLDOWN_MS = 5 * 60_000;
const RECENT_CHECK_SCAN_LIMIT = 200;
const FRESH_FAILURE_MS = 24 * 60 * 60 * 1_000;
const RECENT_FAILURE_MS = 7 * 24 * 60 * 60 * 1_000;

export const allowedAdminOpsCheckIds = adminOpsCheckIdSchema.options;

type SafeData = Record<string, unknown>;

export type AdminOpsCheckRun = AdminOpsRunCheckResponse["data"];
export type AdminOpsHealth = AdminOpsHealthResponse["data"];
export type AdminOpsRecentChecks = AdminOpsRecentChecksResponse["data"];

export type AdminOpsService = {
  getHealth(workspaceId: string): Promise<AdminOpsHealth>;
  runCheck(input: {
    workspaceId: string;
    actorUserId: string;
    checkId: AdminOpsCheckId;
  }): Promise<AdminOpsCheckRun>;
  getRecentChecks(input: {
    workspaceId: string;
    limit?: number;
    checkId?: AdminOpsCheckId;
  }): Promise<AdminOpsRecentChecks>;
};

type AdminOpsRepository = {
  checkDbHealth(workspaceId: string): Promise<{ latencyMs: number }>;
  getWorkerQueueSummary(workspaceId: string): Promise<AdminOpsWorkerQueueSummary>;
  getWorkerFailedSummaryGroups(workspaceId: string): Promise<AdminOpsWorkerFailedSummaryGroup[]>;
  writeCheckActivityLog(input: {
    workspaceId: string;
    actorUserId: string;
    action: AdminOpsActivityType;
    metadataJson: Record<string, unknown>;
  }): Promise<unknown>;
  findRecentCheckLogs(input: {
    workspaceId: string;
    limit: number;
  }): Promise<AdminOpsCheckLogRow[]>;
  findRecentCheckLogsSince(input: {
    workspaceId: string;
    since: Date;
    limit: number;
  }): Promise<AdminOpsCheckLogRow[]>;
};

export type CreateAdminOpsServiceDependencies = {
  googleSheetsSetupService?: GoogleSheetsSetupService;
  repository?: AdminOpsRepository;
};

const productionRepository: AdminOpsRepository = {
  checkDbHealth: checkAdminOpsDbHealth,
  getWorkerQueueSummary: getAdminOpsWorkerQueueSummary,
  getWorkerFailedSummaryGroups: getAdminOpsWorkerFailedSummaryGroups,
  writeCheckActivityLog: writeAdminOpsCheckActivityLog,
  findRecentCheckLogs: findRecentAdminOpsCheckLogs,
  findRecentCheckLogsSince: findRecentAdminOpsCheckLogsSince,
};

function durationMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function limitRecentChecks(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("OPS_CHECK_TIMEOUT")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function googleSheetsHealthStatus(status: GoogleSheetsSetupStatus): AdminOpsHealth["googleSheets"] {
  if (!status.enabled) {
    return {
      status: "disabled",
      configured: status.configured,
      lastTestResult: status.lastTest?.result ?? null,
      lastTestedAt: status.lastTest?.testedAt ?? null,
    };
  }

  if (!status.configured) {
    return {
      status: "unconfigured",
      configured: status.configured,
      lastTestResult: status.lastTest?.result ?? null,
      lastTestedAt: status.lastTest?.testedAt ?? null,
    };
  }

  return {
    status: status.lastTest?.result === "failed" ? "error" : "ok",
    configured: status.configured,
    lastTestResult: status.lastTest?.result ?? null,
    lastTestedAt: status.lastTest?.testedAt ?? null,
  };
}

function workerQueueStatus(summary: AdminOpsWorkerQueueSummary): AdminOpsHealth["workerQueue"] {
  return {
    status: summary.failed > 0 ? "degraded" : "ok",
    pending: summary.pending,
    running: summary.running,
    failed: summary.failed,
    oldestPendingMinutes: summary.oldestPendingMinutes,
  };
}

function overallStatus(input: {
  db: AdminOpsHealth["db"];
  googleSheets: AdminOpsHealth["googleSheets"];
  workerQueue: AdminOpsHealth["workerQueue"];
}): AdminOpsHealth["status"] {
  if (input.db.status === "error") {
    return "unhealthy";
  }

  if (input.googleSheets.status !== "ok" || input.workerQueue.status !== "ok") {
    return "degraded";
  }

  return "healthy";
}

function actionForResult(result: AdminOpsResult): AdminOpsActivityType {
  if (result === "succeeded") {
    return "admin_ops.check_succeeded";
  }

  if (result === "failed") {
    return "admin_ops.check_failed";
  }

  return "admin_ops.check_skipped";
}

function failedRun(input: {
  checkId: AdminOpsCheckId;
  diagnosticTraceId: string;
  runAt: string;
  durationMs: number;
  errorCode?: string;
  errorSummary?: string;
}): AdminOpsCheckRun {
  return adminOpsRunCheckResponseSchema.parse({
    success: true,
    data: {
      checkId: input.checkId,
      result: "failed",
      diagnosticTraceId: input.diagnosticTraceId,
      runAt: input.runAt,
      durationMs: input.durationMs,
      errorCode: input.errorCode ?? "OPS_CHECK_FAILED",
      errorSummary: input.errorSummary ?? "Check failed.",
      data: {},
    },
  }).data;
}

function cooldownRun(input: {
  checkId: AdminOpsCheckId;
  diagnosticTraceId: string;
  runAt: string;
  durationMs: number;
}): AdminOpsCheckRun {
  return adminOpsRunCheckResponseSchema.parse({
    success: true,
    data: {
      checkId: input.checkId,
      result: "skipped",
      diagnosticTraceId: input.diagnosticTraceId,
      runAt: input.runAt,
      durationMs: input.durationMs,
      errorCode: "OPS_CHECK_COOLDOWN",
      errorSummary: "Google Sheets test was skipped because it ran recently.",
      data: {
        cooldownMinutes: 5,
      },
    },
  }).data;
}

function safeGoogleSheetsStatusData(status: GoogleSheetsSetupStatus): SafeData {
  return {
    enabled: status.enabled,
    configured: status.configured,
    credentialsConfigured: status.credentialsConfigured,
    spreadsheetConfigured: status.spreadsheetConfigured,
    spreadsheetIdMasked: status.spreadsheetIdMasked,
    pushbackRangeConfigured: status.pushbackRangeConfigured,
    verificationRangeConfigured: status.verificationRangeConfigured,
    lastTest: status.lastTest
      ? {
          result: status.lastTest.result,
          diagnosticTraceId: status.lastTest.diagnosticTraceId,
          testedAt: status.lastTest.testedAt,
        }
      : null,
  };
}

function safeGoogleSheetsTestData(result: Awaited<ReturnType<GoogleSheetsSetupService["runSetupTest"]>>): SafeData {
  return {
    testedAt: result.testedAt,
    rowsAppended: result.verification?.rowsAppended ?? null,
  };
}

function ageBucket(updatedAt: Date | null, nowMs: number): AdminOpsWorkerFailedSummaryData["groups"][number]["ageBucket"] {
  if (!updatedAt) {
    return "unknown";
  }

  const ageMs = Math.max(0, nowMs - updatedAt.getTime());

  if (ageMs <= FRESH_FAILURE_MS) {
    return "fresh";
  }

  if (ageMs <= RECENT_FAILURE_MS) {
    return "recent";
  }

  return "historical";
}

function safeWorkerFailedSummaryData(
  groups: AdminOpsWorkerFailedSummaryGroup[],
): AdminOpsWorkerFailedSummaryData {
  const nowMs = Date.now();
  const safeGroups = groups.map((group) => ({
    type: group.type,
    count: group.count,
    minAttempts: group.minAttempts,
    maxAttempts: group.maxAttempts,
    oldestCreatedAt: group.oldestCreatedAt?.toISOString() ?? null,
    latestUpdatedAt: group.latestUpdatedAt?.toISOString() ?? null,
    ageBucket: ageBucket(group.latestUpdatedAt, nowMs),
  }));
  const totalFailed = safeGroups.reduce((sum, group) => sum + group.count, 0);
  const hasFreshFailures = safeGroups.some((group) => group.ageBucket === "fresh" || group.ageBucket === "recent");
  const hasOnlyHistoricalFailures =
    totalFailed > 0 && safeGroups.length > 0 && safeGroups.every((group) => group.ageBucket === "historical");

  if (totalFailed === 0) {
    return adminOpsWorkerFailedSummaryDataSchema.parse({
      totalFailed,
      status: "ok",
      groups: safeGroups,
      interpretation: {
        summary: "No failed worker jobs detected.",
        hasOnlyHistoricalFailures: false,
        hasFreshFailures: false,
        recommendedNextAction: "none",
      },
    });
  }

  return adminOpsWorkerFailedSummaryDataSchema.parse({
    totalFailed,
    status: "degraded",
    groups: safeGroups,
    interpretation: {
      summary: hasFreshFailures
        ? "Recent failed worker jobs detected."
        : hasOnlyHistoricalFailures
          ? "Only historical failed worker jobs detected."
          : "Failed worker jobs detected without recent updates.",
      hasOnlyHistoricalFailures,
      hasFreshFailures,
      recommendedNextAction: hasFreshFailures
        ? "investigate_recent_failures"
        : "review_historical_failures",
    },
  });
}

function safeCountsForMetadata(checkId: AdminOpsCheckId, data: SafeData): Record<string, unknown> {
  if (checkId === "worker-queue-summary") {
    return {
      pending: data.pending,
      running: data.running,
      failed: data.failed,
      oldestPendingMinutes: data.oldestPendingMinutes,
    };
  }

  if (checkId === "worker-failed-summary") {
    const parsed = adminOpsWorkerFailedSummaryDataSchema.safeParse(data);

    if (!parsed.success) {
      return {};
    }

    return {
      totalFailed: parsed.data.totalFailed,
      groupCount: parsed.data.groups.length,
      hasFreshFailures: parsed.data.interpretation.hasFreshFailures,
      hasOnlyHistoricalFailures: parsed.data.interpretation.hasOnlyHistoricalFailures,
      recommendedNextAction: parsed.data.interpretation.recommendedNextAction,
    };
  }

  return {};
}

function buildLogMetadata(run: AdminOpsCheckRun): Record<string, unknown> {
  return {
    source: "admin_ui",
    checkId: run.checkId,
    result: run.result,
    diagnosticTraceId: run.diagnosticTraceId,
    durationMs: run.durationMs,
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.errorSummary && run.checkId !== "worker-failed-summary"
      ? { errorSummary: run.errorSummary }
      : {}),
    ...safeCountsForMetadata(run.checkId, run.data),
  };
}

function readString(metadata: Record<string, unknown>, key: string, maxLength = 200): string | null {
  const value = metadata[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function checkIdFromMetadata(metadata: Record<string, unknown>): AdminOpsCheckId | null {
  const parsed = adminOpsCheckIdSchema.safeParse(metadata.checkId);
  return parsed.success ? parsed.data : null;
}

function resultFromAction(action: AdminOpsActivityType): AdminOpsResult {
  if (action === "admin_ops.check_succeeded") {
    return "succeeded";
  }

  if (action === "admin_ops.check_failed") {
    return "failed";
  }

  return "skipped";
}

function recentCheckFromLog(log: AdminOpsCheckLogRow) {
  const checkId = checkIdFromMetadata(log.metadataJson);
  const diagnosticTraceId = readString(log.metadataJson, "diagnosticTraceId", 80);
  const duration = readNumber(log.metadataJson, "durationMs");

  if (!checkId || !diagnosticTraceId || duration === null) {
    return null;
  }

  return {
    checkId,
    result: resultFromAction(log.type),
    diagnosticTraceId,
    runAt: log.createdAt.toISOString(),
    durationMs: duration,
    errorCode: readString(log.metadataJson, "errorCode", 120),
    errorSummary: readString(log.metadataJson, "errorSummary", 240),
  };
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === "OPS_CHECK_TIMEOUT";
}

export function createProductionAdminOpsService(
  dependencies: CreateAdminOpsServiceDependencies = {},
): AdminOpsService {
  const googleSheetsSetupService =
    dependencies.googleSheetsSetupService ?? createProductionGoogleSheetsSetupService();
  const repository = dependencies.repository ?? productionRepository;

  async function performCheck(
    workspaceId: string,
    actorUserId: string,
    checkId: AdminOpsCheckId,
  ): Promise<AdminOpsCheckRun> {
    const startedAtMs = Date.now();
    const diagnosticTraceId = randomUUID();
    const runAt = new Date().toISOString();

    try {
      if (checkId === "google-sheets-test") {
        const since = new Date(Date.now() - GOOGLE_SHEETS_TEST_COOLDOWN_MS);
        const recentLogs = await repository.findRecentCheckLogsSince({
          workspaceId,
          since,
          limit: RECENT_CHECK_SCAN_LIMIT,
        });
        const coolingDown = recentLogs.some(
          (log) => checkIdFromMetadata(log.metadataJson) === "google-sheets-test",
        );

        if (coolingDown) {
          return cooldownRun({
            checkId,
            diagnosticTraceId,
            runAt,
            durationMs: durationMs(startedAtMs),
          });
        }
      }

      let data: SafeData;
      let result: AdminOpsResult = "succeeded";
      let errorCode: string | null = null;
      let errorSummary: string | null = null;

      if (checkId === "api-health") {
        data = await withTimeout(
          Promise.resolve({ uptimeSeconds: Math.floor(process.uptime()) }),
          API_HEALTH_TIMEOUT_MS,
        );
      } else if (checkId === "db-health") {
        data = await withTimeout(repository.checkDbHealth(workspaceId), DB_HEALTH_TIMEOUT_MS);
      } else if (checkId === "google-sheets-status") {
        const status = await googleSheetsSetupService.getSetupStatus(workspaceId);
        data = safeGoogleSheetsStatusData(status);
      } else if (checkId === "google-sheets-test") {
        const setupResult = await googleSheetsSetupService.runSetupTest(workspaceId, actorUserId);
        result = setupResult.result;
        errorCode = setupResult.errorCode;
        errorSummary = setupResult.errorSummary;
        data = safeGoogleSheetsTestData(setupResult);
      } else if (checkId === "worker-queue-summary") {
        const summary = await withTimeout(
          repository.getWorkerQueueSummary(workspaceId),
          WORKER_QUEUE_TIMEOUT_MS,
        );
        data = {
          pending: summary.pending,
          running: summary.running,
          failed: summary.failed,
          oldestPendingMinutes: summary.oldestPendingMinutes,
        };
      } else {
        data = await withTimeout(
          repository.getWorkerFailedSummaryGroups(workspaceId).then(safeWorkerFailedSummaryData),
          WORKER_FAILED_TIMEOUT_MS,
        );
      }

      return adminOpsRunCheckResponseSchema.parse({
        success: true,
        data: {
          checkId,
          result,
          diagnosticTraceId,
          runAt,
          durationMs: durationMs(startedAtMs),
          errorCode,
          errorSummary,
          data,
        },
      }).data;
    } catch (error) {
      return failedRun({
        checkId,
        diagnosticTraceId,
        runAt,
        durationMs: durationMs(startedAtMs),
        errorCode: isTimeoutError(error) ? "OPS_CHECK_TIMEOUT" : "OPS_CHECK_FAILED",
        errorSummary: isTimeoutError(error) ? "Check timed out." : "Check failed.",
      });
    }
  }

  return {
    async getHealth(workspaceId: string): Promise<AdminOpsHealth> {
      const checkedAt = new Date().toISOString();
      let db: AdminOpsHealth["db"];
      let googleSheets: AdminOpsHealth["googleSheets"];
      let workerQueue: AdminOpsHealth["workerQueue"];

      try {
        const dbHealth = await withTimeout(repository.checkDbHealth(workspaceId), DB_HEALTH_TIMEOUT_MS);
        db = {
          status: "ok",
          latencyMs: dbHealth.latencyMs,
        };
      } catch {
        db = {
          status: "error",
          latencyMs: null,
        };
      }

      try {
        googleSheets = googleSheetsHealthStatus(
          await googleSheetsSetupService.getSetupStatus(workspaceId),
        );
      } catch {
        googleSheets = {
          status: "error",
          configured: false,
          lastTestResult: null,
          lastTestedAt: null,
        };
      }

      try {
        workerQueue = workerQueueStatus(
          await withTimeout(repository.getWorkerQueueSummary(workspaceId), WORKER_QUEUE_TIMEOUT_MS),
        );
      } catch {
        workerQueue = {
          status: "error",
          pending: null,
          running: null,
          failed: null,
          oldestPendingMinutes: null,
        };
      }

      return adminOpsHealthResponseSchema.parse({
        success: true,
        data: {
          status: overallStatus({ db, googleSheets, workerQueue }),
          checkedAt,
          api: {
            status: "ok",
            uptimeSeconds: Math.floor(process.uptime()),
          },
          db,
          googleSheets,
          workerQueue,
        },
      }).data;
    },

    async runCheck(input): Promise<AdminOpsCheckRun> {
      const run = await performCheck(input.workspaceId, input.actorUserId, input.checkId);

      await repository.writeCheckActivityLog({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: actionForResult(run.result),
        metadataJson: buildLogMetadata(run),
      });

      return run;
    },

    async getRecentChecks(input): Promise<AdminOpsRecentChecks> {
      const limit = limitRecentChecks(input.limit);
      const rows = await repository.findRecentCheckLogs({
        workspaceId: input.workspaceId,
        limit: RECENT_CHECK_SCAN_LIMIT,
      });
      const checks = rows
        .map(recentCheckFromLog)
        .filter((check): check is NonNullable<typeof check> => Boolean(check))
        .filter((check) => (input.checkId ? check.checkId === input.checkId : true))
        .slice(0, limit);

      return adminOpsRecentChecksResponseSchema.parse({
        success: true,
        data: {
          checks,
          limit,
        },
      }).data;
    },
  };
}
