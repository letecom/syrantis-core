# 019B Worker Execution Foundation

Implemented a manually executable worker foundation for claiming `background_jobs` and running a mock `send_email` handler.

## Files Changed

- `apps/api/package.json`
- `apps/api/src/lib/worker-db.ts`
- `apps/api/src/repositories/background-jobs.ts`
- `apps/api/src/services/background-worker.ts`
- `apps/api/src/services/send-email-job-handler.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/tests/background-jobs.test.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `docs/specs/019B-worker-execution-foundation.md`
- `docs/implementation/019B-worker-execution-foundation.md`

## Worker DB

Added `apps/api/src/lib/worker-db.ts`.

The worker DB client uses `WORKER_DATABASE_URL`, validates it as a PostgreSQL URL, and never falls back to `DATABASE_URL`.

It is lazy, so importing the API without `DATABASE_URL` remains safe. Runtime worker execution still requires `WORKER_DATABASE_URL`; tenant-scoped business execution also uses the existing `withWorkspaceDb(job.workspaceId)` path.

## Claim

Extended `apps/api/src/repositories/background-jobs.ts`:

- `claimNextBackgroundJob(input)`
- `completeBackgroundJob(tx, input)`
- `failBackgroundJob(tx, input)`

`claimNextBackgroundJob` is the only new raw SQL path. It uses `FOR UPDATE SKIP LOCKED` to claim either due `pending` jobs or stale `running` jobs older than 5 minutes.

Claim sets:

- `status = running`
- `locked_at = now()`
- `locked_by = workerId`
- `attempts = attempts + 1`

## Execution

Added `processNextBackgroundJob({ workerId })`.

Flow:

1. Claim globally through worker DB.
2. Return idle if no job is claimed.
3. Validate type and payload.
4. Re-enter tenant-scoped business execution with `withWorkspaceDb(job.workspaceId, tx => ...)`.
5. Run the mock `send_email` handler.
6. Complete the job on success.
7. Fail the job in a tenant-scoped transaction on controlled error.

No tenant business mutation is executed with the worker/system claim connection.

## Mock send_email

Added `apps/api/src/services/send-email-job-handler.ts`.

Behavior:

- `pending` email send becomes `queued`
- `queued` and `sent` are idempotent no-ops
- missing email send throws `EMAIL_SEND_NOT_FOUND`
- `failed` and `cancelled` throw `EMAIL_SEND_NOT_PROCESSABLE`
- `sent_at` is not set
- `provider_message_id` is not set
- no network or provider call exists

`email_sends.status = queued` means the worker mock picked up the outbox job. It does not mean the email was sent.

`drafts.status` is unchanged.

## Scripts

Added API scripts:

- `worker:once`
- `worker:run`

`worker:once` processes at most one job and exits. Idle exits successfully.

`worker:run` loops with a configurable pause and supports `SIGINT` / `SIGTERM`. It is not launched automatically.

## Activity Logs

Added activity actions:

- `background_job.claimed`
- `background_job.completed`
- `background_job.failed`

Added entity type:

- `background_job`

Metadata is compact and excludes subject, text body, HTML body, provider payloads, secrets, tokens, Authorization, and stack traces.

## Validation Notes

Vitest validates claim branch behavior with mocked DB responses and validates service/handler behavior with mocked tenant transactions.

The real concurrency behavior of `FOR UPDATE SKIP LOCKED` must be validated with concurrent staging or production-like `worker:once` or psql sessions. Vitest does not fake a concurrency proof.

RLS validation note: as `syrantis_app`, without `app.current_workspace_id`, `background_jobs` returns zero rows. Worker claim uses the separate worker/system DB connection, then business execution returns to `withWorkspaceDb(job.workspaceId)`.

## External Side Effects

No Resend import, provider integration, external HTTP call, worker daemon install, cron, jobs HTTP route, webhook, AI, DELETE, or email send was added.

No `fetch`, `axios`, `undici`, `http.request`, or `https.request` is used in 019B worker code.

## Limits

- No real worker deployment.
- No job retry policy beyond claim/reclaim fields.
- No `claimNext` HTTP API.
- No `job_attempts` table.
- No email delivery state beyond `queued`.
- No `sent`/`failed` email send transition implementation.
