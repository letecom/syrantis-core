import { and, desc, eq, type SQL } from "drizzle-orm";

import { activityLogs } from "@syrantis/db";
import type {
  ActivityLogAction,
  ActivityLogEntityType,
  ActivityLogQuery
} from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";

export type ActivityLogTx = WorkspaceDbTransaction;
export type ActivityLogRow = typeof activityLogs.$inferSelect;

export type CreateActivityLogInput = {
  workspaceId: string;
  actorUserId?: string | null;
  action: ActivityLogAction;
  entityType: ActivityLogEntityType;
  entityId?: string | null;
  metadataJson?: Record<string, unknown>;
};

export type ListActivityLogsInput = {
  workspaceId: string;
  query: ActivityLogQuery;
};

function activityLogFilters(input: ListActivityLogsInput): SQL[] {
  const filters = [eq(activityLogs.workspaceId, input.workspaceId)];

  if (input.query.entityType) {
    filters.push(eq(activityLogs.entityType, input.query.entityType));
  }

  if (input.query.entityId) {
    filters.push(eq(activityLogs.entityId, input.query.entityId));
  }

  if (input.query.action) {
    filters.push(eq(activityLogs.type, input.query.action));
  }

  return filters;
}

export async function createActivityLog(
  tx: ActivityLogTx,
  input: CreateActivityLogInput
): Promise<ActivityLogRow> {
  const [activityLog] = await tx
    .insert(activityLogs)
    .values({
      workspaceId: input.workspaceId,
      userId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      type: input.action,
      message: input.action,
      metadataJson: input.metadataJson ?? {}
    })
    .returning();

  if (!activityLog) {
    throw new Error("Failed to create activity log.");
  }

  return activityLog;
}

export async function listActivityLogs(input: ListActivityLogsInput): Promise<ActivityLogRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(activityLogs)
      .where(and(...activityLogFilters(input)))
      .orderBy(desc(activityLogs.createdAt))
      .limit(input.query.limit)
      .offset(input.query.offset);
  });
}
