import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";

import { requireDatabaseUrl } from "./config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export type PgPool = InstanceType<typeof Pool>;

export type DbClient = {
  db: ReturnType<typeof drizzle<typeof schema, PgPool>>;
  pool: PgPool;
  close: () => Promise<void>;
};

export type DbPoolOptions = Omit<PoolConfig, "connectionString">;

const defaultPoolOptions: DbPoolOptions = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
};

let globalDbClient: DbClient | null = null;

function resolveDatabaseUrl(databaseUrl?: string): string {
  return databaseUrl ?? requireDatabaseUrl();
}

function createClosePool(pool: PgPool): () => Promise<void> {
  let closePromise: Promise<void> | null = null;

  return () => {
    closePromise ??= pool.end();
    return closePromise;
  };
}

export function createPgPool(databaseUrl?: string, options: DbPoolOptions = {}): PgPool {
  return new Pool({
    ...defaultPoolOptions,
    ...options,
    connectionString: resolveDatabaseUrl(databaseUrl)
  });
}

export function createDbClient(databaseUrl?: string, options: DbPoolOptions = {}): DbClient {
  const pool = createPgPool(databaseUrl, options);
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: createClosePool(pool)
  };
}

export function getGlobalDbClient(databaseUrl?: string, options: DbPoolOptions = {}): DbClient {
  globalDbClient ??= createDbClient(databaseUrl, options);
  return globalDbClient;
}

export async function closeGlobalDbClient(): Promise<void> {
  const client = globalDbClient;
  globalDbClient = null;
  await client?.close();
}
