# 021H Worker Retry / Backoff / Dead Letter

## Summary

Implemented database-backed retry/backoff/dead-letter behavior for `send_email` worker execution.

The implementation keeps the original `background_jobs` row as the durable execution record and creates a new `email_sends` row for each retry attempt. No new routes, UI, webhooks, public status endpoints, or `email_sends` schema changes were added.

## Files Changed

- `packages/db/migrations/0015_background_jobs_scheduled_at.sql`
  - Adds nullable `background_jobs.scheduled_at`.
  - Adds a partial pending send-email scheduling index.
- `packages/db/src/schema.ts`
  - Adds `scheduledAt` to `backgroundJobs`.
  - Adds the partial index to the Drizzle schema.
- `packages/shared/src/contracts/background-jobs.ts`
  - Adds nullable `scheduledAt` to background job output contracts.
- `apps/api/src/repositories/background-jobs.ts`
  - Maps `scheduled_at`.
  - Clears `scheduled_at` on claim/completion/failure.
  - Ignores future-scheduled pending `send_email` jobs during claim.
  - Adds `rescheduleSendEmailJob` to reuse the same job row for retries.
- `apps/api/src/services/send-retry-config.ts`
  - Adds retry defaults, env parsing/clamping, backoff math, and retryability helpers.
- `apps/api/src/services/send-email-job-handler.ts`
  - Schedules retryable provider failures before max attempts.
  - Marks current send failed, clones a new pending retry send, and reschedules the same job.
  - Keeps terminal failures compact and sanitized.
- `apps/api/src/services/background-worker.ts`
  - Passes claimed attempt counts into the send handler.
  - Recognizes retry scheduling without marking the job failed.
- `apps/api/src/tests/background-jobs.test.ts`
  - Adds retry config, polling, retry scheduling, dead-letter, and no-retry regressions.
- `apps/api/src/tests/draft-send-status.test.ts`
  - Adds newest retry row read-model compatibility coverage.
- `apps/api/src/tests/draft-send-cancellation.test.ts`
  - Adds cancel-send during future scheduled backoff coverage.
- `docs/specs/021H-worker-retry-backoff-dead-letter.md`
  - Adds issue spec.
- `docs/implementation/021H-worker-retry-backoff-dead-letter.md`
  - Adds this implementation report.

## Migration Summary

Migration `0015_background_jobs_scheduled_at.sql` is additive:

```sql
ALTER TABLE "background_jobs"
  ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
```

It also adds:

```sql
CREATE INDEX IF NOT EXISTS "background_jobs_pending_send_email_scheduled_at_idx"
ON "background_jobs" USING btree ("type", "scheduled_at", "created_at")
WHERE "status" = 'pending' AND "type" = 'send_email';
```

No existing columns, constraints, or `email_sends` schema are changed.

## Exact Behavior

Worker claim:

- still uses `FOR UPDATE SKIP LOCKED`
- pending `send_email` jobs with `scheduled_at` in the future are ignored
- pending `send_email` jobs with `scheduled_at null` or in the past are claimable
- claimed jobs clear `scheduled_at`

Internal provider:

- pending send -> queued
- job -> completed
- no retry row

Provider success:

- existing sent behavior is preserved

Retryable provider failure before max attempts:

- current pending `email_sends` row -> failed
- new retry `email_sends` row -> pending
- same `background_jobs` row -> pending
- `background_jobs.scheduled_at` set to now + backoff
- `background_jobs.payload_json.emailSendId` updated to the new retry send ID
- controlled error code/message stored
- no intermediate retry activity log is created

Retryable provider failure at max attempts:

- current pending `email_sends` row -> failed
- job -> failed through the existing worker failure path
- no retry row

Permanent failure:

- current pending `email_sends` row -> failed when available
- job -> failed
- no retry row

Compatibility:

- send-status returns the newest retry `email_sends` row because the read model already orders by `created_at desc, id desc`
- cancel-send can cancel a pending retry send while its job is pending with future `scheduled_at`
- cancelled scheduled retry jobs are not claimed by the worker

## Security Notes

Retry scheduling stores only controlled error codes/messages on `email_sends` and `background_jobs`. Intermediate retry scheduling does not create activity log spam.

No route calls a provider or worker. No new route was added. Normal API DTOs still do not expose provider message IDs or raw provider errors.

## Rollback

Revert the code changes and docs from this issue. The database rollback, if required before production reliance, is:

```sql
DROP INDEX IF EXISTS "background_jobs_pending_send_email_scheduled_at_idx";
ALTER TABLE "background_jobs" DROP COLUMN IF EXISTS "scheduled_at";
```
