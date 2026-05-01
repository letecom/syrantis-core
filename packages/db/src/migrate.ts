import { existsSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDbClient } from "./client.js";
import { requireDatabaseUrl } from "./config.js";

export type RunMigrationsResult = {
  ok: true;
  migrationsFolder: string;
};

function getDefaultMigrationsFolder(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "packages/db/migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(moduleDirectory, "../migrations"),
    path.resolve(moduleDirectory, "../../migrations")
  ];

  const migrationsFolder = candidates.find((candidate) => existsSync(candidate));

  if (!migrationsFolder) {
    throw new Error("Drizzle migrations folder was not found. Generate migrations before running migrate.");
  }

  return migrationsFolder;
}

function getMigrationDatabaseUrl(): string | undefined {
  const value = process.env.MIGRATION_DATABASE_URL?.trim();
  return value && value.length > 0 ? value : undefined;
}

export async function runMigrations(databaseUrl?: string): Promise<RunMigrationsResult> {
  const startedAt = performance.now();
  let client: ReturnType<typeof createDbClient> | undefined;

  try {
    const resolvedDatabaseUrl = databaseUrl ?? getMigrationDatabaseUrl() ?? requireDatabaseUrl();
    const migrationsFolder = getDefaultMigrationsFolder();
    client = createDbClient(resolvedDatabaseUrl);

    console.log("[migrate] Starting migrations...");
    await migrate(client.db, { migrationsFolder });
    console.log(`[migrate] Done in ${Math.round(performance.now() - startedAt)}ms`);

    return {
      ok: true,
      migrationsFolder
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown migration error.";
    console.error(`[migrate] Failed: ${message}`);
    throw error;
  } finally {
    await client?.close();
  }
}
