import { and, asc, count, desc, eq, gte, inArray, max, min, sql } from "drizzle-orm";

import { activityLogs, backgroundJobs } from "@syrantis/db";
import type { ActivityLogAction } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export const adminOpsActivityTypes = [
  "admin_ops.check_succeeded",
  "admin_ops.check_failed",
  "admin_ops.check_skipped",
] as const;

export type AdminOpsActivityType = (typeof adminOpsActivityTypes)[number];

export type AdminOpsWorkerQueueSummary = {
  pending: number;
  running: number;
  failed: number;
  oldestPendingMinutes: number | null;
};

export type AdminOpsWorkerFailedSummaryGroup = {
  type: string;
  count: number;
  minAttempts: number | null;
  maxAttempts: number | null;
  oldestCreatedAt: Date | null;
  latestUpdatedAt: Date | null;
};

export type AdminOpsCheckLogRow = {
  type: AdminOpsActivityType;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

async function countJobsByStatus(tx: WorkspaceDbTransaction, workspaceId: string, status: string) {
  const [row] = await tx
    .select({ value: count() })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.workspaceId, workspaceId), eq(backgroundJobs.status, status)));

  return row?.value ?? 0;
}

function minutesSince(value: Date | null): number | null {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
}

function mapLog(row: {
  type: string;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}): AdminOpsCheckLogRow {
  return {
    type: row.type as AdminOpsActivityType,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt,
  };
}

export async function checkAdminOpsDbHealth(workspaceId: string): Promise<{ latencyMs: number }> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    const startedAtMs = Date.now();
    await tx.select({ ok: sql<number>`1` });
    return { latencyMs: Math.max(0, Date.now() - startedAtMs) };
  });
}

export async function getAdminOpsWorkerQueueSummary(
  workspaceId: string,
): Promise<AdminOpsWorkerQueueSummary> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    const pending = await countJobsByStatus(tx, workspaceId, "pending");
    const running = await countJobsByStatus(tx, workspaceId, "running");
    const failed = await countJobsByStatus(tx, workspaceId, "failed");
    const [oldestPending] = await tx
      .select({ value: min(backgroundJobs.createdAt) })
      .from(backgroundJobs)
      .where(and(eq(backgroundJobs.workspaceId, workspaceId), eq(backgroundJobs.status, "pending")));

    return {
      pending,
      running,
      failed,
      oldestPendingMinutes: minutesSince(oldestPending?.value ?? null),
    };
  });
}

export async function getAdminOpsWorkerFailedSummaryGroups(
  workspaceId: string,
): Promise<AdminOpsWorkerFailedSummaryGroup[]> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    const failedCount = count();
    const rows = await tx
      .select({
        type: backgroundJobs.type,
        count: failedCount,
        minAttempts: min(backgroundJobs.attempts),
        maxAttempts: max(backgroundJobs.attempts),
        oldestCreatedAt: min(backgroundJobs.createdAt),
        latestUpdatedAt: max(backgroundJobs.updatedAt),
      })
      .from(backgroundJobs)
      .where(and(eq(backgroundJobs.workspaceId, workspaceId), eq(backgroundJobs.status, "failed")))
      .groupBy(backgroundJobs.type)
      .orderBy(desc(failedCount), asc(backgroundJobs.type));

    return rows.map((row) => ({
      type: row.type,
      count: row.count,
      minAttempts: row.minAttempts,
      maxAttempts: row.maxAttempts,
      oldestCreatedAt: row.oldestCreatedAt,
      latestUpdatedAt: row.latestUpdatedAt,
    }));
  });
}

export async function createAdminOpsCheckActivityLog(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    actorUserId: string;
    action: AdminOpsActivityType;
    metadataJson: Record<string, unknown>;
  },
) {
  return createActivityLog(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action as ActivityLogAction,
    entityType: "admin_ops",
    entityId: null,
    metadataJson: input.metadataJson,
  });
}

export async function writeAdminOpsCheckActivityLog(input: {
  workspaceId: string;
  actorUserId: string;
  action: AdminOpsActivityType;
  metadataJson: Record<string, unknown>;
}) {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return createAdminOpsCheckActivityLog(tx, input);
  });
}

export async function findRecentAdminOpsCheckLogs(input: {
  workspaceId: string;
  limit: number;
}): Promise<AdminOpsCheckLogRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const rows = await tx
      .select({
        type: activityLogs.type,
        metadataJson: activityLogs.metadataJson,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.workspaceId, input.workspaceId),
          eq(activityLogs.entityType, "admin_ops"),
          inArray(activityLogs.type, [...adminOpsActivityTypes]),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(input.limit);

    return rows.map(mapLog);
  });
}

export async function findRecentAdminOpsCheckLogsSince(input: {
  workspaceId: string;
  since: Date;
  limit: number;
}): Promise<AdminOpsCheckLogRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const rows = await tx
      .select({
        type: activityLogs.type,
        metadataJson: activityLogs.metadataJson,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.workspaceId, input.workspaceId),
          eq(activityLogs.entityType, "admin_ops"),
          inArray(activityLogs.type, [...adminOpsActivityTypes]),
          gte(activityLogs.createdAt, input.since),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(input.limit);

    return rows.map(mapLog);
  });
}
