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
  },
  {
    kind: "index",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    indexName: "email_sends_provider_message_id_unique_idx"
  },
  {
    kind: "check_constraint",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    constraintName: "email_sends_sent_requires_sent_at"
  },
  {
    kind: "check_constraint",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    constraintName: "email_sends_failed_requires_failed_at"
  },
  {
    kind: "check_constraint",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    constraintName: "email_sends_failed_requires_last_error_code"
  }
] as const;

export function getInvariantObject(invariant: SchemaInvariant): string {
  if (invariant.kind === "column") {
    return `${invariant.table}.${invariant.column}`;
  }

  if (invariant.kind === "check_constraint") {
    return invariant.constraintName;
  }

  return invariant.indexName;
}

export function getInvariantKey(invariant: SchemaInvariant): string {
  if (invariant.kind === "column") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.column}`;
  }

  if (invariant.kind === "check_constraint") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.constraintName}`;
  }

  return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.indexName}`;
}

export function filterInvariantsByMigration(
  invariants: readonly SchemaInvariant[],
  migration?: MigrationId
): SchemaInvariant[] {
  return migration ? invariants.filter((invariant) => invariant.migration === migration) : [...invariants];
}
