import { sql } from "drizzle-orm";

import { getGlobalDbClient } from "@syrantis/db";
import type { DbClient } from "@syrantis/db";

export type WorkspaceDbTransaction = Parameters<Parameters<DbClient["db"]["transaction"]>[0]>[0];

export async function withWorkspaceDb<T>(
  workspaceId: string,
  fn: (tx: WorkspaceDbTransaction) => Promise<T>
): Promise<T> {
  const { db } = getGlobalDbClient();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_workspace_id', ${workspaceId}, true)`);
    return fn(tx);
  });
}
