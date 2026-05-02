# 020D - Resend Provider Integration

## Scope

020D adds a real email provider path for `send_email` background jobs while keeping the safe internal behavior as the default.

The provider is inactive unless:

- `SEND_EMAIL_PROVIDER=resend`

When the provider is absent or set to `internal`, the worker keeps the existing mock behavior and moves `email_sends.pending` to `queued` without any external call.

## Database Decision

No migration is required.

The existing `email_sends` table already has:

- `provider`
- `provider_message_id`
- `sent_at`
- `failed_at`
- `status`
- `updated_at`

The implementation reuses existing compact error columns and background job failure fields. No new table and no schema change are needed.

## Provider

Resend is isolated in:

- `apps/api/src/services/email/resend-provider.ts`

The only allowed Resend endpoint is:

- `https://api.resend.com/emails`

The provider sends:

- `Authorization: Bearer <RESEND_API_KEY>`
- `Content-Type: application/json`
- `Idempotency-Key: <emailSendId>`
- `User-Agent: Syrantis-Core/1.0`

The provider uses a 5 second timeout and one local retry:

- `429`: retry once after 2 seconds
- `5xx`, network, timeout: retry once after 1 second
- `400`, `401`, `403`, other 4xx: fail without retry

The response is parsed with Zod as `{ id: string }`.

No request body, email content, or API key is logged.

## Provider Resolution

Email provider resolution lives in:

- `apps/api/src/services/email/email-provider.ts`

Rules:

- missing or `internal` provider: internal mock behavior
- `resend`: Resend provider
- any other value: `EMAIL_PROVIDER_INVALID`

## Allowlist

When `SEND_EMAIL_PROVIDER=resend` and `RESEND_TO_ALLOWLIST` is set, the recipient must be allowlisted.

If the recipient is not allowlisted:

- `EMAIL_RECIPIENT_NOT_ALLOWED` is thrown
- no fetch is made
- no email is sent

## Worker Handler

The `send_email` handler runs in three phases:

1. Short tenant transaction:
   - load `email_sends`
   - load related draft
   - enforce idempotence
   - enforce allowed status
   - enforce draft approval
   - build provider payload
2. Provider call outside the DB transaction.
3. Short tenant transaction:
   - success: mark `email_sends.status = sent`
   - failure: mark `email_sends.status = failed`
   - write compact activity log

Internal mode keeps the existing behavior:

- `pending` becomes `queued`
- `queued` and `sent` are idempotent no-ops
- no Resend call

## Activity Logs

Added actions:

- `email_send.sent`
- `email_send.failed`

Metadata is compact:

- success: `emailSendId`, `provider`, `messageId`
- failure: `emailSendId`, `provider`, `errorType`, optional `statusCode`

Forbidden metadata:

- subject
- text body
- HTML body
- provider request body
- provider raw response
- API key

## Anti-Scope

020D does not add:

- Resend webhooks
- bounce, delivery, open, or click events
- attachments
- CC or BCC
- batch sending
- Resend templates
- direct send routes
- tenant guard changes
- workspace DB helper changes
- SMTP fallback
- infinite retries

## Tests

Tests cover:

- Resend success
- idempotency header
- user agent header
- timeout retry
- `429` retry
- `500` retry
- `400` no retry
- allowlist rejection before fetch
- internal worker regression
- Resend success handler path
- already sent idempotence
- draft approval gate
- Resend failure persistence
- request-send regression
- score_lead regression

## Production Validation

1. Keep `SEND_EMAIL_PROVIDER=internal`.
2. Run normal install, tests, typecheck, lint, and build.
3. Confirm no migration is expected.
4. Create approved draft and request send.
5. Run `worker:once` in internal mode and confirm no external email is sent.
6. Temporarily set `SEND_EMAIL_PROVIDER=resend` with a test recipient in `RESEND_TO_ALLOWLIST`.
7. Create approved draft to allowlisted test email.
8. Request send and run `worker:once`.
9. Verify the email is received.
10. Verify `email_sends.status = sent`, `provider = resend`, `provider_message_id` and `sent_at` are populated.
11. Return provider to `internal` if real sending should remain disabled.

## Rollback

If provider is still `internal`, rollback has no network impact.

If Resend has been activated, set `SEND_EMAIL_PROVIDER=internal` and restart the API/worker before reverting code.

Emails already sent cannot be undone.
