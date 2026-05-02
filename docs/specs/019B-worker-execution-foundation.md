# 019B Worker Execution Foundation

## Goal

Create a manually executable background worker foundation that can claim one `background_jobs` row, execute a mock `send_email` handler, move `email_sends.status` from `pending` to `queued`, and complete the job.

`queued` means the mock worker accepted the send request for future processing. It does not mean the email was sent.

## Non-Goals

- No Resend.
- No real email sending.
- No external HTTP.
- No worker daemon installed by ops.
- No cron.
- No public or protected HTTP jobs route.
- No `job_attempts`.
- No `drafts.status = sent`.
- No `email_sends.status = sent`.

## Worker Database

The claim path uses `WORKER_DATABASE_URL` through `apps/api/src/lib/worker-db.ts`.

The worker database client:

- is lazy, so API import safety without `DATABASE_URL` still works
- never falls back to `DATABASE_URL`
- fails clearly if `WORKER_DATABASE_URL` is missing when a worker claim runs

The worker/system connection claims globally. It must not perform tenant-scoped business mutations.

## Claim

`claimNextBackgroundJob({ workerId })` uses raw SQL only in `apps/api/src/repositories/background-jobs.ts` because the claim requires `FOR UPDATE SKIP LOCKED`.

Claimable jobs:

- `pending` jobs with `run_after <= now()`
- stale `running` jobs with `locked_at < now() - interval '5 minutes'`

The claim updates:

- `status = running`
- `locked_at = now()`
- `locked_by = workerId`
- `attempts = attempts + 1`

## Execution

`processNextBackgroundJob({ workerId })`:

1. Claims with worker DB.
2. Returns `{ status: "idle" }` if no job exists.
3. Validates `job.type`.
4. Validates `payload_json` with `SendEmailJobPayloadSchema`.
5. Enters `withWorkspaceDb(job.workspaceId, tx => ...)` for business execution.
6. Runs the mock `send_email` handler.
7. Completes or fails the job inside tenant-scoped transactions.

## Mock send_email Handler

The handler:

- reads `email_sends` by `id` and `workspaceId`
- throws `EMAIL_SEND_NOT_FOUND` if missing
- changes `pending` to `queued`
- leaves `sent_at` null
- leaves `provider_message_id` null
- treats `queued` and `sent` as idempotent no-ops
- throws `EMAIL_SEND_NOT_PROCESSABLE` for `failed` or `cancelled`

No provider call is made.

## Activity Logs

Added actions:

- `background_job.claimed`
- `background_job.completed`
- `background_job.failed`

Added entity type:

- `background_job`

Metadata is compact only:

- `jobId`
- `type`
- `workerId`
- `attempts`
- `emailSendId`
- `errorCode`

Do not log subject, text body, HTML body, provider payload, secrets, tokens, Authorization, or stack traces.

## Scripts

API package scripts:

- `pnpm --filter @syrantis/api worker:once`
- `pnpm --filter @syrantis/api worker:run`

`worker:once` processes at most one job and exits 0 when idle.

`worker:run` loops with a short configurable delay and handles `SIGINT` / `SIGTERM`. It is not launched automatically.

## Validation

Vitest covers claim branch behavior with mocked DB responses and service/handler behavior with mocked tenant transactions.

The real concurrency behavior of `FOR UPDATE SKIP LOCKED` must be validated in staging or production-like DB validation with concurrent `worker:once` or psql sessions.

RLS validation expectation:

```sql
RESET app.current_workspace_id;
SELECT count(*) FROM background_jobs;
```

As `syrantis_app`, without `app.current_workspace_id`, `background_jobs` returns zero rows.
