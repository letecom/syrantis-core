# Issue 021E: Worker Send Execution Hardening

## Goal

Harden the existing `send_email` worker execution path so worker execution is idempotent, state-machine safe, and proof-oriented.

The route remains intention, the worker remains execution, and the database remains proof. This issue does not add a public send status route, retry system, provider expansion, webhook, migration, UI, or deployment behavior.

## Status Vocabulary

The implementation must preserve the current schema and shared contract statuses.

`background_jobs.status`:

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`

`email_sends.status`:

- `pending`
- `queued`
- `sent`
- `failed`
- `cancelled`

## Worker Behavior

Invalid `send_email` payloads fail the background job through the existing worker failure path before any provider call.

Missing or non-visible `email_sends` rows fail the background job through the existing worker failure path before any provider call.

Only `email_sends.status = pending` may execute a provider path.

For `pending` sends:

- `SEND_EMAIL_PROVIDER=internal` performs no external provider call and moves the send to `queued`.
- `SEND_EMAIL_PROVIDER=resend` calls the existing Resend provider path once.
- provider success may update existing proof fields such as `provider`, `provider_message_id`, and `sent_at`.
- provider failure may update existing failure proof fields such as `failed_at`, `last_error_code`, and `last_error_message`.

For `queued`, `sent`, `failed`, and `cancelled` sends:

- do not call the provider
- do not create duplicate send activity logs
- do not crash the worker
- allow the background job to complete or safely no-op according to existing worker conventions

## Activity Logs

Activity logs must stay compact and proof-oriented.

Allowed send worker metadata includes:

- `jobId`
- `emailSendId`
- `provider`
- controlled status or error code values
- timestamps
- `workerId`

Activity logs and worker failure proof must not include contact email, contact phone, contact names, draft subject, draft body, raw provider payload, raw provider response, secrets, AI prompt/output payload, AI costs, or token fields.

## Security

The worker must scope all `email_sends` reads and writes by both `id` and `workspaceId`.

The worker must use `withWorkspaceDb(workspaceId)` for workspace-scoped execution.

The implementation must not add tenant IDs to URLs, expose raw provider responses, create public provider routes, or change the default `SEND_EMAIL_PROVIDER=internal` behavior.
