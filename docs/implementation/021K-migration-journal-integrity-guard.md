# 021K Migration Journal Integrity Guard

## Summary

Implemented a read-only migration file and journal integrity guard in `@syrantis/db`, then wired it into `pnpm --filter @syrantis/db migrate` before Drizzle migrate runs.

This addresses the 021H and 021J incidents where migration success and journal state were not enough proof that required migration SQL had actually been considered and applied. The real PostgreSQL catalog remains proof for schema objects through `verify-schema`; this issue closes the earlier repository integrity gap where SQL files could be silently ignored by Drizzle if `_journal.json` diverged.

## Files Changed

- `packages/db/migrations/meta/_journal.json`
  - Adds repository journal entries for `0015_background_jobs_scheduled_at` and `0016_email_sends_proof_constraints`, matching committed SQL files.
- `packages/db/src/verify-migration-files/types.ts`
  - Defines migration file, journal entry, drift, result, and path types.
- `packages/db/src/verify-migration-files/scanner.ts`
  - Scans `*.sql` migration files and derives migration ids/tags from filenames.
- `packages/db/src/verify-migration-files/journal.ts`
  - Reads and validates `_journal.json`; malformed or missing journal state maps to exit code `2`.
- `packages/db/src/verify-migration-files/verifier.ts`
  - Performs the pure SQL-file-to-journal comparison.
- `packages/db/src/verify-migration-files/reporter.ts`
  - Formats `MIGRATION_FILES_OK` and `MIGRATION_FILES_DRIFT` output, plus JSON.
- `packages/db/src/verify-migration-files/cli.ts`
  - Adds the `verify-migration-files` CLI.
- `packages/db/src/verify-migration-files/verifier.test.ts`
  - Adds verifier, scanner, journal, and reporter coverage.
- `packages/db/src/migrate-cli.ts`
  - Runs the guard before calling Drizzle migrate and stops on drift.
- `packages/db/src/migrate-cli.test.ts`
  - Verifies preflight ordering and fail-closed behavior.
- `packages/db/package.json`
  - Adds `verify-migration-files`.
  - Includes the new verifier and migrate-cli tests in `@syrantis/db` test.
- `docs/specs/021K-migration-journal-integrity-guard.md`
  - Adds the issue spec.
- `docs/implementation/021K-migration-journal-integrity-guard.md`
  - Adds this implementation report.

## Behavior Delivered

Primary command:

```sh
pnpm --filter @syrantis/db verify-migration-files
```

Current success output:

```text
MIGRATION_FILES_OK
sql_files=17 journal_entries=17 drift=0
```

JSON output:

```sh
pnpm --filter @syrantis/db verify-migration-files -- --json
```

Exit behavior:

- `0`: all SQL files and journal entries match
- `1`: file or journal drift detected
- `2`: runtime, config, read, or parse error

`pnpm --filter @syrantis/db migrate` now prints the migration file verification result before opening the DB client and running Drizzle migrate. If drift exists, the CLI returns non-zero and Drizzle migrate is not called.

## Drift Covered

The verifier fails for:

- SQL file without journal entry
- journal entry without SQL file
- duplicate SQL migration id
- duplicate SQL migration tag
- duplicate journal id
- duplicate journal tag
- missing or malformed `_journal.json`

## Security Notes

The new verifier is filesystem-only and read-only.

It does not:

- execute DDL
- connect to the database
- write business data
- read business rows
- print secrets or connection strings
- add API routes
- change worker, provider, route, DTO, shared contract, RLS, grant, or business behavior

## Deploy Protocol

Production remediation order:

1. Pull the reviewed code.
2. Run `pnpm install --frozen-lockfile`.
3. Run tests.
4. Run `pnpm --filter @syrantis/db verify-migration-files`.
5. Run `pnpm --filter @syrantis/db migrate`.
6. Run `pnpm --filter @syrantis/db verify-schema`.
7. Run `pnpm build`.
8. Restart runtime processes after verification passes.

Production already has the 0015 and 0016 DDL manually applied. With `_journal.json` repaired and the 0016 SQL idempotent, Drizzle can record 0016 normally while the SQL no-ops against existing objects.

## Tests

Implemented coverage for:

- verifier pass when SQL files and journal entries match
- SQL file missing from journal
- journal entry referencing missing SQL file
- duplicate SQL ids and tags
- duplicate journal ids and tags
- missing and malformed journal read errors
- clear drift reporter output
- temporary migration folder scanner and verifier integration
- migrate-cli guard execution before Drizzle migrate
- migrate-cli fail-closed behavior when guard reports drift
- existing `verify-schema` tests still passing in the db test script

## Checks Run

```sh
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/db verify-migration-files
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
grep -RniE "ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE" packages/db/src/verify-migration-files || true
grep -RniE "postgres://|postgresql://|password|secret|token|api.?key|PRIVATE_KEY|DATABASE_URL" packages/db/src/verify-migration-files || true
grep -RniE "FROM (drafts|leads|contacts|email_sends|approvals|activity_logs|ai_runs|lead_scores|background_jobs)" packages/db/src/verify-migration-files || true
```

## Rollback

Revert code and docs only. No DB rollback is needed because 021K adds no migration and performs no database repair.
