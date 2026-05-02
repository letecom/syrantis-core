# 019C Worker Ops Hardening

## Goal

Harden worker operations before any real provider or AI worker exists.

The worker role keeps `BYPASSRLS` only for global job orchestration. Tenant business mutations still run through `withWorkspaceDb(job.workspaceId, tx => ...)`.

## Worker Role

Production uses `syrantis_worker` through `WORKER_DATABASE_URL`.

`syrantis_worker` keeps `BYPASSRLS` because it must inspect and claim jobs across workspaces. This is intentionally limited to `background_jobs`.

Direct access is forbidden for:

- `email_sends`
- `activity_logs`
- `users`
- other tenant business tables

The worker must not mutate business data with the global worker connection.

## Setup SQL

Add non-Drizzle ops script:

```bash
psql -v worker_password='<generated-password>' -f scripts/db/setup-worker-role.sql
```

The script:

- creates `syrantis_worker` if missing
- sets `LOGIN BYPASSRLS`
- does not hardcode a credential
- requires psql variable `worker_password`
- revokes broad table and sequence privileges
- grants only `SELECT, UPDATE` on `background_jobs`
- does not grant INSERT, DELETE, or TRUNCATE on `background_jobs`
- does not grant direct access to `email_sends`, `activity_logs`, or `users`

## Worker Preflight

`worker:once` and `worker:run` must run `checkWorkerEnvironment()` before any claim.

Preflight verifies:

- `WORKER_DATABASE_URL` exists
- URL uses `postgres:` or `postgresql:`
- URL username is exactly `syrantis_worker`
- credential exists
- DB connection succeeds
- `current_user = syrantis_worker`
- role exists
- role can login
- role has `BYPASSRLS`
- role is not superuser
- exact expected direct table privileges

If preflight fails, the worker exits before claiming a job.

## Ops CLI

Scripts:

```bash
pnpm --filter @syrantis/api worker:check
pnpm --filter @syrantis/api worker:jobs
pnpm --filter @syrantis/api worker:repair-stale
```

`worker:check` prints `[OK]` and `[FAIL]` lines with a masked database URL.

`worker:jobs` supports:

```bash
pnpm --filter @syrantis/api worker:jobs -- --status pending --limit 20
```

It prints only compact job columns and never prints job payloads or email send identifiers.

`worker:repair-stale` defaults to dry-run:

```bash
pnpm --filter @syrantis/api worker:repair-stale
pnpm --filter @syrantis/api worker:repair-stale -- --apply --threshold-minutes 10
```

Dry-run lists stale jobs without mutation.

Apply resets only stale `running` jobs:

- `status = pending`
- `locked_by = null`
- `locked_at = null`
- `last_error_code = STALE_LOCK_RESET`
- `last_error_message = Reset by worker repair-stale.`

It does not increment attempts and does not touch completed or cancelled jobs.

## Logging

Worker runtime logs are structured JSON lines:

- timestamp
- level
- workerId
- event
- message

Logs must not include payloads, email identifiers, subject, text body, HTML body, provider payloads, secrets, credentials, Authorization, tokens, or environment dumps.

## Out Of Scope

- Resend
- real email sending
- HTTP provider calls
- AI
- jobs HTTP routes
- cron or systemd
- Drizzle schema migration
- new tables
- `job_attempts`
- changes to `tenantGuard`
- changes to `withWorkspaceDb`
- changes to `request-send`
- removing `BYPASSRLS`
- granting worker direct access to business tables
- DELETE behavior
