import { and, asc, eq, lt, sql } from "drizzle-orm";

import { backgroundJobs } from "@syrantis/db";
import type { JobStatus } from "@syrantis/shared";

import {
  getWorkerDatabaseUrl,
  getWorkerDbClient,
  sanitizeWorkerDatabaseUrl,
} from "../lib/worker-db.js";

export type WorkerCheck = {
  name: string;
  ok: boolean;
  message: string;
};

export type WorkerEnvironmentCheckResult = {
  ok: boolean;
  checks: WorkerCheck[];
  errors: string[];
  sanitizedDatabaseUrl: string | null;
};

export type WorkerJobInspectionInput = {
  status?: JobStatus;
  limit?: number;
};

export type WorkerJobSummary = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkerJobProjection = {
  id: string;
  workspaceId: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  completedAt: Date | null;
  failedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkerRepairStaleInput = {
  apply?: boolean;
  thresholdMinutes?: number;
};

export type WorkerRepairStaleResult = {
  dryRun: boolean;
  thresholdMinutes: number;
  matchedCount: number;
  updatedCount: number;
  jobs: Array<Pick<WorkerJobSummary, "id" | "type" | "status" | "attempts" | "lockedAt" | "lockedBy">>;
};

type DbCheckRow = {
  current_user: string;
  role_exists: boolean;
  rolcanlogin: boolean | null;
  rolbypassrls: boolean | null;
  rolsuper: boolean | null;
  background_jobs_select: boolean;
  background_jobs_update: boolean;
  background_jobs_insert: boolean;
  background_jobs_delete: boolean;
  email_sends_select: boolean;
  activity_logs_insert: boolean;
  users_select: boolean;
};

type QueryResultLike<T> = {
  rows?: T[];
};

const requiredWorkerUser = "syrantis_worker";

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 20, 1), 100);
}

function resolveThresholdMinutes(thresholdMinutes: number | undefined): number {
  if (thresholdMinutes === undefined) {
    return 5;
  }

  return Number.isFinite(thresholdMinutes) && thresholdMinutes > 0 ? thresholdMinutes : 5;
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function summarizeJob(row: WorkerJobProjection): WorkerJobSummary {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter.toISOString(),
    lockedAt: toIsoDate(row.lockedAt),
    lockedBy: row.lockedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function addCheck(checks: WorkerCheck[], name: string, ok: boolean, message: string): void {
  checks.push({ name, ok, message });
}

function finishCheck(
  checks: WorkerCheck[],
  sanitizedDatabaseUrl: string | null,
): WorkerEnvironmentCheckResult {
  const errors = checks.filter((check) => !check.ok).map((check) => check.message);

  return {
    ok: errors.length === 0,
    checks,
    errors,
    sanitizedDatabaseUrl,
  };
}

async function queryWorkerChecks(): Promise<DbCheckRow> {
  const { db } = getWorkerDbClient();
  const result = (await db.execute(sql`
    SELECT
      current_user,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'syrantis_worker') AS role_exists,
      role.rolcanlogin,
      role.rolbypassrls,
      role.rolsuper,
      has_table_privilege('syrantis_worker', 'background_jobs', 'select') AS background_jobs_select,
      has_table_privilege('syrantis_worker', 'background_jobs', 'update') AS background_jobs_update,
      has_table_privilege('syrantis_worker', 'background_jobs', 'insert') AS background_jobs_insert,
      has_table_privilege('syrantis_worker', 'background_jobs', 'delete') AS background_jobs_delete,
      has_table_privilege('syrantis_worker', 'email_sends', 'select') AS email_sends_select,
      has_table_privilege('syrantis_worker', 'activity_logs', 'insert') AS activity_logs_insert,
      has_table_privilege('syrantis_worker', 'users', 'select') AS users_select
    FROM (SELECT 1) anchor
    LEFT JOIN pg_roles role ON role.rolname = 'syrantis_worker'
  `)) as QueryResultLike<DbCheckRow>;
  const [row] = result.rows ?? [];

  if (!row) {
    throw new Error("Worker environment check query returned no rows.");
  }

  return row;
}

export async function checkWorkerEnvironment(): Promise<WorkerEnvironmentCheckResult> {
  const checks: WorkerCheck[] = [];
  let parsedUrl: URL | null = null;
  let sanitizedDatabaseUrl: string | null = null;

  try {
    const databaseUrl = getWorkerDatabaseUrl();
    parsedUrl = new URL(databaseUrl);
    sanitizedDatabaseUrl = sanitizeWorkerDatabaseUrl(databaseUrl);
    addCheck(checks, "worker_url_present", true, "Worker database URL is present.");
    addCheck(checks, "worker_url_protocol", true, "Worker database URL uses PostgreSQL.");
  } catch (error) {
    addCheck(
      checks,
      "worker_url_present",
      false,
      error instanceof Error ? error.message : "Worker database URL is invalid.",
    );
    return finishCheck(checks, sanitizedDatabaseUrl);
  }

  addCheck(
    checks,
    "worker_url_user",
    parsedUrl.username === requiredWorkerUser,
    `Worker database user must be ${requiredWorkerUser}.`,
  );
  addCheck(checks, "worker_url_secret", parsedUrl.password.length > 0, "Worker credential is required.");

  let dbChecks: DbCheckRow;

  try {
    dbChecks = await queryWorkerChecks();
    addCheck(checks, "worker_db_connection", true, "Worker database connection succeeded.");
  } catch (error) {
    addCheck(
      checks,
      "worker_db_connection",
      false,
      error instanceof Error ? error.message : "Worker database connection failed.",
    );
    return finishCheck(checks, sanitizedDatabaseUrl);
  }

  addCheck(checks, "worker_current_user", dbChecks.current_user === requiredWorkerUser, "Current user must be syrantis_worker.");
  addCheck(checks, "worker_role_exists", dbChecks.role_exists, "Role syrantis_worker must exist.");
  addCheck(checks, "worker_role_login", dbChecks.rolcanlogin === true, "Role syrantis_worker must be LOGIN.");
  addCheck(checks, "worker_role_bypassrls", dbChecks.rolbypassrls === true, "Role syrantis_worker must keep BYPASSRLS.");
  addCheck(checks, "worker_role_not_superuser", dbChecks.rolsuper === false, "Role syrantis_worker must not be superuser.");
  addCheck(checks, "background_jobs_select", dbChecks.background_jobs_select, "syrantis_worker needs SELECT on background_jobs.");
  addCheck(checks, "background_jobs_update", dbChecks.background_jobs_update, "syrantis_worker needs UPDATE on background_jobs.");
  addCheck(checks, "background_jobs_no_insert", !dbChecks.background_jobs_insert, "syrantis_worker must not INSERT background_jobs.");
  addCheck(checks, "background_jobs_no_delete", !dbChecks.background_jobs_delete, "syrantis_worker must not DELETE background_jobs.");
  addCheck(checks, "email_sends_no_select", !dbChecks.email_sends_select, "syrantis_worker must not SELECT email_sends.");
  addCheck(checks, "activity_logs_no_insert", !dbChecks.activity_logs_insert, "syrantis_worker must not INSERT activity_logs.");
  addCheck(checks, "users_no_select", !dbChecks.users_select, "syrantis_worker must not SELECT users.");

  return finishCheck(checks, sanitizedDatabaseUrl);
}

export async function inspectWorkerJobs(input: WorkerJobInspectionInput = {}): Promise<WorkerJobSummary[]> {
  const { db } = getWorkerDbClient();
  const status = input.status ?? "pending";

  const rows = await db
    .select({
      id: backgroundJobs.id,
      workspaceId: backgroundJobs.workspaceId,
      type: backgroundJobs.type,
      status: backgroundJobs.status,
      attempts: backgroundJobs.attempts,
      maxAttempts: backgroundJobs.maxAttempts,
      runAfter: backgroundJobs.runAfter,
      lockedAt: backgroundJobs.lockedAt,
      lockedBy: backgroundJobs.lockedBy,
      completedAt: backgroundJobs.completedAt,
      failedAt: backgroundJobs.failedAt,
      lastErrorCode: backgroundJobs.lastErrorCode,
      lastErrorMessage: backgroundJobs.lastErrorMessage,
      createdAt: backgroundJobs.createdAt,
      updatedAt: backgroundJobs.updatedAt,
    })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.status, status))
    .orderBy(asc(backgroundJobs.runAfter), asc(backgroundJobs.createdAt))
    .limit(resolveLimit(input.limit));

  return rows.map(summarizeJob);
}

export async function repairStaleJobs(input: WorkerRepairStaleInput = {}): Promise<WorkerRepairStaleResult> {
  const { db } = getWorkerDbClient();
  const thresholdMinutes = resolveThresholdMinutes(input.thresholdMinutes);
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const staleFilters = and(eq(backgroundJobs.status, "running"), lt(backgroundJobs.lockedAt, cutoff));

  if (!input.apply) {
    const rows = await db
      .select({
        id: backgroundJobs.id,
        workspaceId: backgroundJobs.workspaceId,
        type: backgroundJobs.type,
        status: backgroundJobs.status,
        attempts: backgroundJobs.attempts,
        maxAttempts: backgroundJobs.maxAttempts,
        runAfter: backgroundJobs.runAfter,
        lockedAt: backgroundJobs.lockedAt,
        lockedBy: backgroundJobs.lockedBy,
        completedAt: backgroundJobs.completedAt,
        failedAt: backgroundJobs.failedAt,
        lastErrorCode: backgroundJobs.lastErrorCode,
        lastErrorMessage: backgroundJobs.lastErrorMessage,
        createdAt: backgroundJobs.createdAt,
        updatedAt: backgroundJobs.updatedAt,
      })
      .from(backgroundJobs)
      .where(staleFilters)
      .orderBy(asc(backgroundJobs.lockedAt), asc(backgroundJobs.createdAt))
      .limit(100);

    const jobs = rows.map(summarizeJob).map(({ id, type, status, attempts, lockedAt, lockedBy }) => ({
      id,
      type,
      status,
      attempts,
      lockedAt,
      lockedBy,
    }));

    return {
      dryRun: true,
      thresholdMinutes,
      matchedCount: jobs.length,
      updatedCount: 0,
      jobs,
    };
  }

  const rows = await db
    .update(backgroundJobs)
    .set({
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: "STALE_LOCK_RESET",
      lastErrorMessage: "Reset by worker repair-stale.",
    })
    .where(staleFilters)
    .returning({
      id: backgroundJobs.id,
      workspaceId: backgroundJobs.workspaceId,
      type: backgroundJobs.type,
      status: backgroundJobs.status,
      attempts: backgroundJobs.attempts,
      maxAttempts: backgroundJobs.maxAttempts,
      runAfter: backgroundJobs.runAfter,
      lockedAt: backgroundJobs.lockedAt,
      lockedBy: backgroundJobs.lockedBy,
      completedAt: backgroundJobs.completedAt,
      failedAt: backgroundJobs.failedAt,
      lastErrorCode: backgroundJobs.lastErrorCode,
      lastErrorMessage: backgroundJobs.lastErrorMessage,
      createdAt: backgroundJobs.createdAt,
      updatedAt: backgroundJobs.updatedAt,
    });

  const jobs = rows.map(summarizeJob).map(({ id, type, status, attempts, lockedAt, lockedBy }) => ({
    id,
    type,
    status,
    attempts,
    lockedAt,
    lockedBy,
  }));

  return {
    dryRun: false,
    thresholdMinutes,
    matchedCount: jobs.length,
    updatedCount: jobs.length,
    jobs,
  };
}
