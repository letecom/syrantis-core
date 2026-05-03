# 021I Migration Schema Drift Guard

## Summary

Implemented read-only schema drift verification tooling in `@syrantis/db`.

The verifier checks registered migration invariants against the real PostgreSQL catalog. It exists because the 021H production incident proved that the Drizzle migration journal can say a migration ran even when required schema objects are absent from the actual database.

## Files Changed

- `packages/db/src/verify/types.ts`
  - Defines typed migration invariants, catalog adapter contracts, pass/failure records, and verification result types.
- `packages/db/src/verify/registry.ts`
  - Adds the reusable invariant registry.
  - Registers the 0015 `background_jobs.scheduled_at` column invariant.
  - Registers the 0015 scheduling index invariant.
- `packages/db/src/verify/queries.ts`
  - Adds read-only catalog lookups through `information_schema.columns` and `pg_indexes`.
- `packages/db/src/verify/verifier.ts`
  - Compares registry invariants to catalog responses.
- `packages/db/src/verify/reporter.ts`
  - Formats human-readable and JSON output.
  - Maps verification drift to exit code `1`.
- `packages/db/src/verify/cli.ts`
  - Adds the `verify-schema` CLI with `--json` and `--migration 0015`.
  - Uses `DATABASE_URL` from the calling environment and does not print it.
- `packages/db/src/verify/verifier.test.ts`
  - Adds unit coverage for registry, verifier, reporter, and catalog-only SQL shape.
- `packages/db/package.json`
  - Adds `verify-schema`.
  - Adds a package-local verifier test command.
- `package.json`
  - Runs the db verifier tests as part of the root test script.
- `docs/specs/021I-migration-schema-drift-guard.md`
  - Adds the issue spec.
- `docs/implementation/021I-migration-schema-drift-guard.md`
  - Adds this implementation report.

## Behavior Delivered

Primary command:

```sh
pnpm --filter @syrantis/db verify-schema
```

Success output:

```text
SCHEMA_VERIFY_OK
checked=2 passed=2 failed=0
```

Drift output:

```text
SCHEMA_VERIFY_DRIFT
checked=2 passed=0 failed=2
missing column: background_jobs.scheduled_at
missing index: background_jobs_pending_send_email_scheduled_at_idx
```

Supported options:

```sh
pnpm --filter @syrantis/db verify-schema -- --json
pnpm --filter @syrantis/db verify-schema -- --migration 0015
pnpm --filter @syrantis/db verify-schema -- --migration=0015
```

Exit behavior:

- `0`: all registered invariants pass
- `1`: drift detected
- `2`: verifier/runtime/connectivity error

## 0015 Invariants

The registry verifies:

- column `background_jobs.scheduled_at` exists
- column data type is `timestamp with time zone`
- column nullability is `true`
- index `background_jobs_pending_send_email_scheduled_at_idx` exists

## Security Notes

The verifier is read-only and catalog-only.

It does not:

- repair drift
- execute DDL
- execute business writes
- query tenant/business rows
- print `DATABASE_URL`
- print credentials
- add API routes
- change worker behavior

## Production Protocol

For runtime-required migrations:

1. Run migrations.
2. Run `pnpm --filter @syrantis/db verify-schema` against the target database.
3. Deploy or restart API/worker processes only when the verifier exits `0`.

If the verifier exits `1`, stop deployment/restart and investigate the catalog drift manually. If it exits `2`, investigate the verifier/runtime/connectivity failure.

## Tests

Implemented unit tests for:

- unique invariant keys
- 0015 scheduled_at column registry coverage
- 0015 scheduled_at index registry coverage
- pass result when catalog metadata matches
- missing column drift
- type mismatch drift
- nullability mismatch drift
- missing index drift
- non-zero drift exit summary
- SQL limited to PostgreSQL catalog metadata and not business row reads

## Rollback

Remove the verifier files, package script additions, and docs from this issue. No database rollback is required because 021I adds no migration and performs no auto-repair.
