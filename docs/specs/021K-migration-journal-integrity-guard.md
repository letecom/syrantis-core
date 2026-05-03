# 021K Migration Journal Integrity Guard

## Goal

Add a read-only migration file and journal integrity guard so Drizzle cannot silently ignore SQL migration files that are present in the repository but absent from `packages/db/migrations/meta/_journal.json`.

Primary command:

```sh
pnpm --filter @syrantis/db verify-migration-files
```

The migrate command must run this guard before calling Drizzle migrate.

## Incident Context

021H proved that the migration journal alone is not proof. Migration `0015_background_jobs_scheduled_at.sql` was expected to add `background_jobs.scheduled_at` and an index, but production catalog objects were absent after migrate reported success. 021I added `verify-schema` so the real PostgreSQL catalog is checked directly.

021J then added migration `0016_email_sends_proof_constraints.sql` for send proof constraints. Production migrate reported success, but `verify-schema` failed because all 0016 catalog objects were missing and the latest Drizzle journal id remained 15. Manual application of the idempotent SQL file repaired production catalog state.

The root repository issue is that a SQL migration file can exist under `packages/db/migrations/*.sql` without a matching `_journal.json` entry. Drizzle ignores such a file. That mismatch must fail before migration begins.

## Scope

Add package-local tooling in `@syrantis/db` that compares:

- SQL files in `packages/db/migrations/*.sql`
- journal entries in `packages/db/migrations/meta/_journal.json`

The verifier must fail when:

- a SQL file has no matching journal entry
- a journal entry references a missing SQL file
- duplicate SQL migration ids exist
- duplicate SQL migration tags exist
- duplicate journal ids exist
- duplicate journal tags exist
- `_journal.json` is missing, unreadable, or malformed

The verifier must pass when all SQL files are journaled and all journal entries have files.

## Output And Exit Codes

Human-readable output:

```text
MIGRATION_FILES_OK
```

or:

```text
MIGRATION_FILES_DRIFT
```

Exit codes:

- `0`: pass
- `1`: file or journal drift
- `2`: runtime, config, read, or parse error

Optional `--json` output is allowed if it stays low risk.

## Migrate Preflight

`packages/db/src/migrate-cli.ts` must run the migration file guard before Drizzle migrate.

If the guard exits non-zero:

- print controlled drift output
- return non-zero
- do not call Drizzle migrate
- do not auto-repair

## Journal Repair

Repository metadata must represent all committed SQL migrations. If `0016_email_sends_proof_constraints.sql` exists and is absent from `_journal.json`, add the repository-level journal entry using the existing Drizzle journal format.

Do not modify the production `drizzle.__drizzle_migrations` table manually.

## Anti-Scope

021K must not:

- add a SQL migration
- execute DDL
- insert into or repair database migration tables
- modify application API, worker, provider, routes, DTOs, shared contracts, RLS, grants, or business logic
- merge journal logic into `verify-schema` beyond a tiny shared helper if needed
- access business table rows
- print secrets or connection strings

## Deploy Protocol

For production remediation after this code is reviewed:

1. Pull the reviewed code.
2. Run `pnpm install --frozen-lockfile`.
3. Run tests.
4. Run `pnpm --filter @syrantis/db verify-migration-files`.
5. Run `pnpm --filter @syrantis/db migrate`.
6. Run `pnpm --filter @syrantis/db verify-schema`.
7. Run `pnpm build`.
8. Restart runtime processes only after verification passes.

Because production already had the 0015 and 0016 DDL manually applied, the repaired repository journal lets Drizzle record 0016 normally while the idempotent SQL no-ops safely.

## Tests

Required coverage:

- verifier passes when SQL files and journal entries match
- verifier fails when a SQL file is missing from journal
- verifier fails when journal references a missing SQL file
- verifier fails on duplicate SQL migration ids or tags
- verifier fails on duplicate journal ids or tags
- verifier exits `2` on malformed or missing journal
- reporter produces clear drift output
- migrate-cli preflight calls the guard before Drizzle migrate
- migrate-cli does not call Drizzle migrate if the guard fails
- root `pnpm test` includes the new verifier tests
- existing db `verify-schema` tests still pass
- existing API regression tests still pass

## Rollback

Rollback reverts code and docs only. There is no database rollback for 021K because it adds no migration and performs no database repair.
