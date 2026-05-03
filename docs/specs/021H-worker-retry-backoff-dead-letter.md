# 021H Worker Retry / Backoff / Dead Letter

## Goal

Add database-backed retry, backoff, and dead-letter behavior for `send_email` worker execution.

This issue adds no route, UI, webhook, send-attempt read model, or email-send status route. Routes remain intention or read-model only; the worker remains the execution surface; database rows remain the proof.

## Architecture

- Reuse the same `background_jobs` row for retries of the original `request-send` intention.
- Create a new `email_sends` row for each retry attempt.
- Treat failed, sent, and cancelled `email_sends` rows as immutable terminal proof rows.
- Add nullable `background_jobs.scheduled_at`.
- Worker polling ignores pending `send_email` jobs whose `scheduled_at` is in the future.
- No provider message IDs, raw provider errors, raw provider responses, PII, content, secrets, or AI payload fields are exposed to normal API clients.

## Migration

Additive migration:

- `background_jobs.scheduled_at timestamptz null`
- partial pending send-email scheduling index:
  - type, scheduled_at, created_at
  - only rows where `status = 'pending'` and `type = 'send_email'`

No `email_sends` schema changes.

## Retry Config

Defaults:

- max attempts: `3` total worker executions
- base backoff: `1000ms`
- multiplier: `2`
- no jitter

Optional environment overrides:

- `SEND_MAX_RETRIES`
- `SEND_BACKOFF_BASE_MS`
- `SEND_BACKOFF_MULTIPLIER`

Invalid values fall back or clamp to safe ranges.

Backoff:

- attempt 1: 1000ms
- attempt 2: 2000ms

## Retryable Failures

Retryable:

- provider HTTP 429
- provider HTTP 500, 502, 503, 504
- provider timeout/network-style errors represented by controlled provider error codes

Permanent:

- provider HTTP 400, 401, 403, 404, 422
- invalid internal state
- missing email send
- missing/invalid draft state
- malformed payload
- cancelled send
- inconsistent state

## Worker Behavior

Polling:

- pending `send_email` jobs are claimable only when `scheduled_at is null` or `scheduled_at <= now()`
- future scheduled pending `send_email` jobs remain idle
- `FOR UPDATE SKIP LOCKED` behavior is preserved

Execution:

- cancelled, queued, sent, and failed linked `email_sends` rows are idempotent no-op states and do not call providers
- internal provider success preserves existing behavior:
  - pending `email_sends` -> queued
  - job -> completed
  - no retry row
- resend/provider success preserves existing success behavior

Retryable failure before max attempts:

1. Mark the current pending `email_sends` row failed with controlled error fields.
2. Create a new pending `email_sends` row with the same required send snapshot fields.
3. Update the same `background_jobs` row back to pending.
4. Set `background_jobs.scheduled_at = now + backoff`.
5. Update `payload_json.emailSendId` to the new retry row.
6. Store controlled error code/message on the job.
7. Do not write intermediate activity log spam.

Retryable failure at max attempts:

- mark current `email_sends` failed
- mark job failed
- no new `email_sends` row
- preserve compact terminal failure proof

Permanent failure:

- mark current `email_sends` failed when a current send row exists
- mark job failed
- no retry row

## Compatibility

- `GET /api/drafts/:id/send-status` continues to select the latest `email_sends` row by `created_at desc, id desc`, so it returns the newest retry attempt after retry scheduling.
- `POST /api/drafts/:id/cancel-send` can cancel a pending retry attempt while the job is pending with future `scheduled_at`.
- Worker polling does not process cancelled scheduled retry jobs.

## Tests

Required coverage:

- retry config defaults, retryable/permanent classification, backoff math
- future/null/past `scheduled_at` polling behavior
- internal provider no-retry regression
- resend success regression
- retryable failure before max attempts
- retryable failure at max attempts
- permanent failure
- send-status newest retry row compatibility
- cancel-send during backoff
- cancelled scheduled retry jobs ignored
- compact metadata and failure proofs without PII/content/raw provider payloads/secrets/AI fields
