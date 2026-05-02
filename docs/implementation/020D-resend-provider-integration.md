# 020D - Resend Provider Integration Implementation

## Summary

020D adds a Resend provider behind the existing `send_email` background job path. The default remains safe: `SEND_EMAIL_PROVIDER=internal` or an unset provider keeps the existing mock behavior and performs no network call.

No migration was added because `email_sends` already contains the required provider, provider message, sent, failed, status, and timestamp columns.

## Files

- `apps/api/src/services/email/resend-provider.ts`
- `apps/api/src/services/email/email-provider.ts`
- `apps/api/src/services/send-email-job-handler.ts`
- `apps/api/src/services/background-worker.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/tests/background-jobs.test.ts`

## Handler Flow

The worker claim and job completion flow remains in `background-worker`.

For `send_email`, the handler now owns its tenant-scoped DB phases:

1. Prepare transaction:
   - find `email_sends` by `workspaceId` and `emailSendId`
   - find the related draft in the same workspace
   - return success without provider call when already `sent`
   - allow only `pending` or `queued`
   - require draft status `approved`
   - build a provider payload without logging subject/body
2. Provider call outside any DB transaction.
3. Success transaction:
   - mark `email_sends.status = sent`
   - store `provider = resend`
   - store `provider_message_id`
   - set `sent_at`
   - clear compact error fields
   - create `email_send.sent`
4. Failure transaction:
   - mark `email_sends.status = failed`
   - set `failed_at`
   - store compact error code
   - create `email_send.failed`
   - rethrow so `background_jobs` becomes failed

Internal mode remains unchanged in behavior:

- `pending` becomes `queued`
- `queued` and `sent` are no-ops
- no fetch

## Safety

The route `POST /api/drafts/:id/request-send` was not changed.

The Resend provider is not used from any route. The only external call is in `resend-provider.ts`.

The provider uses `emailSendId` as the `Idempotency-Key`.

`RESEND_TO_ALLOWLIST` is enforced before fetch when configured.

No email subject, text body, HTML body, provider body, provider raw response, or API key is written to activity logs.

## Tests

The background jobs test suite covers provider behavior, handler behavior, request-send regression, score_lead regression, and compact metadata checks.

## Production Validation Plan

1. Pull main on production.
2. Install and run tests, typecheck, lint, and build.
3. Confirm no migration is needed for 020D.
4. Verify environment variables exist without printing secret values:
   - `SEND_EMAIL_PROVIDER`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `RESEND_REPLY_TO`
   - `RESEND_TO_ALLOWLIST`
5. Keep provider as `internal` for the first worker check.
6. Create draft, approve it, request send, and run `worker:once`.
7. Confirm internal behavior queues the send and makes no external call.
8. Temporarily set provider to `resend` for an allowlisted test recipient.
9. Create and approve a test draft, request send, and run `worker:once`.
10. Confirm email receipt and DB fields:
    - `email_sends.status = sent`
    - `provider = resend`
    - `provider_message_id` is not null
    - `sent_at` is not null
11. Return `SEND_EMAIL_PROVIDER=internal` unless real sending should remain enabled.

## Rollback

Set `SEND_EMAIL_PROVIDER=internal` and restart worker/API to stop real sends immediately.

Then revert the code if needed.

No database rollback is required.
