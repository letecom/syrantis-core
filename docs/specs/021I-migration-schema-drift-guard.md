# 021I Migration Schema Drift Guard

## Goal

Add deterministic, read-only schema verification tooling for migration invariants that must exist in the real PostgreSQL catalog before production traffic relies on them.

Primary command:

```sh
pnpm --filter @syrantis/db verify-schema
```

## Incident Context

Issue 021H added migration `0015_background_jobs_scheduled_at.sql`:

- nullable `background_jobs.scheduled_at`
- partial index `background_jobs_pending_send_email_scheduled_at_idx`

Production later showed that the Drizzle migration journal contained migration id `15`, but the real schema initially did not contain the column or the index. The API then crashed on request-send because `background_jobs.scheduled_at` did not exist. Manual idempotent DDL repaired production.

The lesson is part of Syrantis doctrine: the database is proof. A migration journal entry is not enough proof that PostgreSQL has the required schema objects.

## Scope

Add a package-local verifier in `@syrantis/db` that checks registered migration invariants against PostgreSQL catalog metadata.

MVP invariants for migration `0015`:

- `background_jobs.scheduled_at` exists
- `background_jobs.scheduled_at` data type is `timestamp with time zone`
- `background_jobs.scheduled_at` is nullable
- `background_jobs_pending_send_email_scheduled_at_idx` exists on `background_jobs`

The verifier must:

- use `DATABASE_URL` from the calling process environment
- never print connection strings or credentials
- query only catalog metadata such as `information_schema.columns` and `pg_indexes`
- exit `0` when all invariants pass
- exit `1` when schema drift is found
- exit `2` for verifier/runtime/connectivity errors
- print human-readable output by default

Optional low-risk additions:

- `--json`
- `--migration 0015`

## Anti-Scope

No database migration is added for this issue.

The verifier must not:

- repair drift
- execute DDL
- execute business writes
- query tenant or business rows
- add API routes
- change worker behavior
- verify RLS policies
- verify worker grants
- become a full schema diff engine
- change Drizzle migration behavior

## Architecture

The verifier has three separate concerns:

- registry: typed invariant definitions that future migrations can extend
- catalog queries: read-only PostgreSQL metadata lookups
- verifier and reporter: pure comparison and output formatting

Business tables are mentioned only as catalog object names. There are no reads from business table rows.

## Production Protocol

Production deployment order for migrations that add runtime-required schema:

1. Run migrations.
2. Run `pnpm --filter @syrantis/db verify-schema` against the target database.
3. Deploy or restart API/worker processes only after verification exits `0`.

If verification exits `1`, stop deployment/restart and investigate real catalog drift. Do not auto-fix from the verifier.

If verification exits `2`, treat it as an operational verifier/runtime/connectivity failure and investigate without printing secrets.

## Tests

Required coverage:

- registry keys are unique
- registry includes the 0015 scheduled_at column invariant
- registry includes the 0015 scheduled_at index invariant
- verifier passes when catalog responses match
- verifier reports drift for missing column
- verifier reports drift for type mismatch
- verifier reports drift for nullability mismatch
- verifier reports drift for missing index
- reporter/exit summary returns non-zero on drift
- verifier SQL stays limited to PostgreSQL catalog metadata and does not query business rows

## Rollback

Rollback removes only the verifier code, package script, and docs from this issue. There is no database rollback because this issue adds no migration and performs no repair.
