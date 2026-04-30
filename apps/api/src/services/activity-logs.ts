import {
  ActivityLogOutputSchema,
  type ActivityLogOutput,
  type ActivityLogQuery
} from "@syrantis/shared";

import type { ActivityLogRow } from "../repositories/activity-logs.js";
import { listActivityLogs as listActivityLogRows } from "../repositories/activity-logs.js";

export type ActivityLogService = {
  listActivityLogs(workspaceId: string, query: ActivityLogQuery): Promise<ActivityLogOutput[]>;
};

function requireWorkspaceId(value: string | null): string {
  if (!value) {
    throw new Error("Activity log row is missing workspaceId.");
  }

  return value;
}

function requireEntityType(value: string | null): string {
  if (!value) {
    throw new Error("Activity log row is missing entityType.");
  }

  return value;
}

function mapActivityLogRow(row: ActivityLogRow): ActivityLogOutput {
  return ActivityLogOutputSchema.parse({
    id: row.id,
    workspaceId: requireWorkspaceId(row.workspaceId),
    actorUserId: row.userId,
    action: row.type,
    entityType: requireEntityType(row.entityType),
    entityId: row.entityId,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString()
  });
}

export function createProductionActivityLogService(): ActivityLogService {
  return {
    async listActivityLogs(workspaceId: string, query: ActivityLogQuery): Promise<ActivityLogOutput[]> {
      const rows = await listActivityLogRows({ workspaceId, query });
      return rows.map(mapActivityLogRow);
    }
  };
}
