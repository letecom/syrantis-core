# 019C Worker Ops Hardening

Implemented worker operations hardening and role guardrails for the existing 019B worker foundation.

## Files Changed

- `scripts/db/setup-worker-role.sql`
- `apps/api/package.json`
- `apps/api/src/lib/worker-db.ts`
- `apps/api/src/services/worker-ops.ts`
- `apps/api/src/worker-ops.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/tests/worker-ops.test.ts`
- `docs/specs/019C-worker-ops-hardening.md`
- `docs/implementation/019C-worker-ops-hardening.md`

## Role Guardrail

`syrantis_worker` keeps `BYPASSRLS` because it must claim `background_jobs` globally across workspaces.

The role is restricted to direct `background_jobs` access only. It must not directly access `email_sends`, `activity_logs`, `users`, or tenant business tables.

Business execution remains tenant-scoped:

1. worker global connection claims the job
2. worker reads `job.workspaceId`
3. business mutation runs through `withWorkspaceDb(job.workspaceId, tx => ...)`

## Setup SQL

Added `scripts/db/setup-worker-role.sql`.

Usage:

```bash
psql -v worker_password='<generated-password>' -f scripts/db/setup-worker-role.sql
```

The script is idempotent and uses `DO $do$ ... $do$` blocks. It does not hardcode a credential.

It grants:

- `CONNECT` on the database
- `USAGE` on `public`
- `SELECT, UPDATE` on `background_jobs`

It revokes broad privileges and explicitly does not grant INSERT, DELETE, TRUNCATE, `email_sends`, `activity_logs`, or `users`.

## Ops Service

Added `apps/api/src/services/worker-ops.ts`.

Functions:

- `checkWorkerEnvironment()`
- `inspectWorkerJobs(input)`
- `repairStaleJobs(input)`

`checkWorkerEnvironment()` returns typed check results, errors, and a masked database URL. It never returns the credential.

`inspectWorkerJobs()` returns compact job summaries only. It does not select or return payload fields.

`repairStaleJobs()` defaults to dry-run and only resets stale `running` jobs when `apply` is true. It does not increment attempts and does not touch completed or cancelled jobs.

## Ops CLI

Added `apps/api/src/worker-ops.ts`.

Package scripts:

```bash
pnpm --filter @syrantis/api worker:check
pnpm --filter @syrantis/api worker:jobs
pnpm --filter @syrantis/api worker:repair-stale
```

CLI output avoids payloads, email identifiers, secrets, credentials, and environment dumps.

## Worker Preflight

`worker:once` and `worker:run` now call `checkWorkerEnvironment()` before any claim.

If preflight fails:

- the worker logs a compact structured error
- exits with code 1
- does not claim a job

Worker runtime logs are structured JSON lines containing only timestamp, level, workerId, event, and message.

## Tests

Added `apps/api/src/tests/worker-ops.test.ts` covering:

- missing `WORKER_DATABASE_URL`
- wrong worker user
- missing `BYPASSRLS`
- dangerous `email_sends`, `activity_logs`, and `users` privileges
- compact jobs output
- status/limit inspection behavior
- dry-run stale repair
- apply stale repair
- completed/cancelled repair guardrails
- worker preflight preventing claim

Existing background job and email send tests remain unchanged in behavior.

## Production Validation Plan

1. Generate a fresh worker credential outside Git.
2. Run `scripts/db/setup-worker-role.sql` with psql variable `worker_password`.
3. Set `WORKER_DATABASE_URL` for manual worker execution.
4. Run `pnpm --filter @syrantis/api worker:check`.
5. Run `pnpm --filter @syrantis/api worker:jobs -- --status pending --limit 20`.
6. If needed, dry-run stale repair before apply:

```bash
pnpm --filter @syrantis/api worker:repair-stale
pnpm --filter @syrantis/api worker:repair-stale -- --apply
```

## Rollback

No schema migration was added.

Rollback is a code revert.

If the setup SQL was run, no rollback mutation is required for application rollback. If needed, manually restore previous role permissions as an operational decision.

## Limits

- No Resend.
- No real email sending.
- No HTTP provider calls.
- No AI.
- No jobs HTTP routes.
- No cron or systemd.
- No new table.
- No direct worker access to business tables.
