import pg from "pg";

import { requireDatabaseUrl } from "../config.js";
import { buildPgSchemaCatalog } from "./queries.js";
import { filterInvariantsByMigration, schemaInvariantRegistry } from "./registry.js";
import { formatSchemaVerifyJson, formatSchemaVerifyText, getSchemaVerifyExitCode } from "./reporter.js";
import { verifySchemaInvariants } from "./verifier.js";
import type { MigrationId } from "./types.js";

const { Pool } = pg;

type CliOptions = {
  json: boolean;
  migration?: MigrationId;
};

function parseCliOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    json: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      throw new Error("Missing verify-schema option.");
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--migration") {
      const migration = args[index + 1];

      if (!isMigrationId(migration)) {
        throw new Error("--migration requires a registered migration id.");
      }

      options.migration = migration;
      index += 1;
      continue;
    }

    if (arg.startsWith("--migration=")) {
      const migration = arg.slice("--migration=".length);

      if (!isMigrationId(migration)) {
        throw new Error("--migration requires a registered migration id.");
      }

      options.migration = migration;
      continue;
    }

    throw new Error(`Unknown verify-schema option: ${arg}`);
  }

  return options;
}

function isMigrationId(value: string | undefined): value is MigrationId {
  return (
    value === "0005" ||
    value === "0006" ||
    value === "0007" ||
    value === "0009" ||
    value === "0010" ||
    value === "0011" ||
    value === "0012" ||
    value === "0015" ||
    value === "0016"
  );
}

export async function runVerifySchemaCli(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseCliOptions(args);
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  try {
    const catalog = buildPgSchemaCatalog(pool);
    const invariants = filterInvariantsByMigration(schemaInvariantRegistry, options.migration);
    const result = await verifySchemaInvariants(catalog, invariants);
    console.log(options.json ? formatSchemaVerifyJson(result) : formatSchemaVerifyText(result));
    return getSchemaVerifyExitCode(result);
  } finally {
    await pool.end();
  }
}

void runVerifySchemaCli()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown schema verification error.");
    process.exitCode = 2;
  });
