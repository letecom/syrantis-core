import { performance } from "node:perf_hooks";

import { createDbClient } from "./client.js";
import { getDatabaseUrl } from "./config.js";

export type DatabaseHealthStatus = "ok" | "missing_config" | "error";

export type DatabaseHealthResult = {
  ok: boolean;
  status: DatabaseHealthStatus;
  latencyMs?: number;
  error?: string;
};

export async function checkDatabaseHealth(databaseUrl?: string): Promise<DatabaseHealthResult> {
  const resolvedDatabaseUrl = databaseUrl ?? getDatabaseUrl();

  if (!resolvedDatabaseUrl) {
    return {
      ok: false,
      status: "missing_config",
      error: "DATABASE_URL is not configured."
    };
  }

  const startedAt = performance.now();
  const client = createDbClient(resolvedDatabaseUrl);

  try {
    await client.pool.query("select 1");

    return {
      ok: true,
      status: "ok",
      latencyMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown database health check error."
    };
  } finally {
    await client.close();
  }
}
