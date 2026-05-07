import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { activityLogs } from "@syrantis/db";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

const setupActivityTypes = [
  "google_sheets_setup.test_succeeded",
  "google_sheets_setup.test_failed",
  "google_sheets_setup.test_skipped",
] as const;

export type GoogleSheetsSetupActivityType = (typeof setupActivityTypes)[number];

export type GoogleSheetsSetupActivityLogRow = {
  id: string;
  type: GoogleSheetsSetupActivityType;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

function mapSetupActivityLog(row: {
  id: string;
  type: string;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}): GoogleSheetsSetupActivityLogRow {
  return {
    ...row,
    type: row.type as GoogleSheetsSetupActivityType,
  };
}

export async function findLatestGoogleSheetsSetupActivityLog(
  workspaceId: string,
): Promise<GoogleSheetsSetupActivityLogRow | null> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    const [log] = await tx
      .select({
        id: activityLogs.id,
        type: activityLogs.type,
        metadataJson: activityLogs.metadataJson,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.workspaceId, workspaceId),
          eq(activityLogs.entityType, "google_sheets_setup"),
          isNull(activityLogs.entityId),
          inArray(activityLogs.type, [...setupActivityTypes]),
        ),
      )
      .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
      .limit(1);

    return log ? mapSetupActivityLog(log) : null;
  });
}

export async function createGoogleSheetsSetupActivityLog(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    actorUserId: string;
    action: GoogleSheetsSetupActivityType;
    metadataJson: Record<string, unknown>;
  },
) {
  return createActivityLog(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "google_sheets_setup",
    entityId: null,
    metadataJson: input.metadataJson,
  });
}
