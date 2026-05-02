import { createDbClient, type DbClient } from "@syrantis/db";

const workerDatabaseUrlEnvName = "WORKER_DATABASE_URL";
const acceptedDatabaseProtocols = new Set(["postgres:", "postgresql:"]);

let workerDbClient: DbClient | null = null;

export function getWorkerDatabaseUrl(): string {
  const databaseUrl = process.env[workerDatabaseUrlEnvName]?.trim();

  if (!databaseUrl) {
    throw new Error("WORKER_DATABASE_URL is required for background worker database access.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("WORKER_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (!acceptedDatabaseProtocols.has(parsedUrl.protocol)) {
    throw new Error("WORKER_DATABASE_URL must use the postgres: or postgresql: protocol.");
  }

  return databaseUrl;
}

export function sanitizeWorkerDatabaseUrl(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);

  if (parsedUrl.password) {
    parsedUrl.password = "***";
  }

  return parsedUrl.toString();
}

export function getWorkerDbClient(): DbClient {
  workerDbClient ??= createDbClient(getWorkerDatabaseUrl(), {
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });

  return workerDbClient;
}

export async function closeWorkerDbClient(): Promise<void> {
  const client = workerDbClient;
  workerDbClient = null;
  await client?.close();
}
