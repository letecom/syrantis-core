# 019A Jobs Outbox Foundation

## Goal

Create a PostgreSQL-backed asynchronous jobs foundation and connect approved draft request-send to a `send_email` job using a transactional outbox pattern.

019A does not send email. It creates only an internal job record in the same database transaction as `email_sends`.

## Scope

Add `background_jobs` with tenant isolation, runtime grants, RLS, FORCE RLS, and an `updated_at` trigger.

Connect `POST /api/drafts/:id/request-send` so the existing transaction:

1. Creates `email_sends.status = pending`.
2. Creates `background_jobs.status = pending`.
3. Sets `background_jobs.type = send_email`.
4. Stores `payload_json = { "emailSendId": "<email_send_id>" }`.
5. Writes compact activity log `email_send.queued`.

## Table

`background_jobs` columns:

- `id`
- `workspace_id`
- `type`
- `payload_json`
- `status`
- `attempts`
- `max_attempts`
- `run_after`
- `locked_at`
- `locked_by`
- `completed_at`
- `failed_at`
- `last_error_code`
- `last_error_message`
- `created_at`
- `updated_at`

Checks:

- `status in ('pending', 'running', 'completed', 'failed', 'cancelled')`
- `type in ('send_email')`
- `attempts >= 0`
- `max_attempts >= 1`

Indexes:

- `background_jobs_workspace_id_idx`
- `background_jobs_status_idx`
- `background_jobs_type_idx`
- `background_jobs_run_after_idx`
- `background_jobs_poll_idx`
- `background_jobs_created_at_idx`

## Contracts

`packages/shared/src/contracts/background-jobs.ts` exports:

- `JobTypeSchema = z.enum(["send_email"])`
- `JobStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"])`
- `SendEmailJobPayloadSchema`
- `BackgroundJobOutputSchema`

## Tenant Isolation

`background_jobs.workspace_id` is tenant-scoped. Application producers must receive `workspaceId` from trusted server context only.

RLS validation expectation:

```sql
RESET app.current_workspace_id;
SELECT count(*) FROM background_jobs;
```

As `syrantis_app`, without `app.current_workspace_id`, `background_jobs` returns zero rows because FORCE RLS applies `tenant_isolation_background_jobs`.

## Activity Logs

Add `email_send.queued`.

Metadata stays compact:

```json
{
  "draftId": "...",
  "leadId": "...",
  "contactId": "...",
  "jobId": "...",
  "status": "pending"
}
```

Activity logs must not store email subject, text body, or HTML body.

## Out Of Scope

- Real email sending
- Resend imports or calls
- `fetch`, `axios`, `undici`, `http.request`, or `https.request`
- worker, daemon, cron, or queue runner
- job claim APIs or `SKIP LOCKED`
- jobs HTTP routes
- `WORKER_DATABASE_URL`
- webhook routes
- AI
- sent/failed email state transitions
