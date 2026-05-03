import type { MigrationId, SchemaInvariant } from "./types.js";

const defaultSchema = "public";

export const schemaInvariantRegistry: readonly SchemaInvariant[] = [
  {
    kind: "column",
    migration: "0015",
    schema: defaultSchema,
    table: "background_jobs",
    column: "scheduled_at",
    dataType: "timestamp with time zone",
    isNullable: true
  },
  {
    kind: "index",
    migration: "0015",
    schema: defaultSchema,
    table: "background_jobs",
    indexName: "background_jobs_pending_send_email_scheduled_at_idx"
  }
] as const;

export function getInvariantObject(invariant: SchemaInvariant): string {
  if (invariant.kind === "column") {
    return `${invariant.table}.${invariant.column}`;
  }

  return invariant.indexName;
}

export function getInvariantKey(invariant: SchemaInvariant): string {
  if (invariant.kind === "column") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.column}`;
  }

  return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.indexName}`;
}

export function filterInvariantsByMigration(
  invariants: readonly SchemaInvariant[],
  migration?: MigrationId
): SchemaInvariant[] {
  return migration ? invariants.filter((invariant) => invariant.migration === migration) : [...invariants];
}
