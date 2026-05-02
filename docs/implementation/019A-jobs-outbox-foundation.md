# 019A Jobs Outbox Foundation

Implemented the PostgreSQL jobs foundation and transactional outbox bridge for email send requests.

## Files Changed

- `packages/db/src/schema.ts`
- `packages/db/migrations/0011_background_jobs_foundation.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/shared/src/contracts/background-jobs.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/background-jobs.ts`
- `apps/api/src/repositories/email-sends.ts`
- `apps/api/src/tests/email-sends.test.ts`
- `docs/specs/019A-jobs-outbox-foundation.md`
- `docs/implementation/019A-jobs-outbox-foundation.md`

## Migration

Added `0011_background_jobs_foundation.sql`:

- creates `background_jobs`
- adds status, type, attempts, and max attempts checks
- adds workspace, status, type, run-after, poll, and created-at indexes
- adds `background_jobs_set_updated_at_trg` using `syrantis_set_updated_at`
- grants `SELECT, INSERT, UPDATE` to `syrantis_app`
- enables RLS and FORCE RLS
- adds `tenant_isolation_background_jobs`

RLS validation note: as `syrantis_app`, without `app.current_workspace_id`, `background_jobs` returns zero rows. With `app.current_workspace_id` set to a workspace UUID, only jobs for that workspace are visible.

## Transactional Outbox

`requestEmailSendFromDraft` now creates the outbox job in the same `withWorkspaceDb` transaction as `email_sends`.

The transaction:

1. Loads the draft by `id` and `workspaceId`.
2. Verifies the draft is `approved`.
3. Resolves the approved approval row and recipient.
4. Creates `email_sends.status = pending`.
5. Calls `enqueueSendEmailJob(tx, ...)`.
6. Creates `background_jobs.status = pending`.
7. Stores `payload_json = { emailSendId }`.
8. Writes activity logs `email_send.requested`, `email_send.created`, and `email_send.queued`.

The enqueue function receives an existing transaction and does not call `withWorkspaceDb`.

## Activity Logs

Added `email_send.queued`.

Queued metadata is compact:

- `draftId`
- `leadId`
- `contactId`
- `jobId`
- `status`

No email subject, text body, or HTML body is written to activity logs.

## External Side Effects

No Resend provider code, external HTTP call, worker, daemon, cron, queue runner, webhook, AI call, or send execution was added.

No `fetch`, `axios`, `undici`, `http.request`, or `https.request` is used in the 019A code path.

## Limits

- Jobs are only enqueued.
- No worker exists.
- No job claim, retry, lock, or completion behavior exists.
- No HTTP routes expose jobs.
- `email_sends` still only creates `pending`; no `sent` or `failed` transition was added.

## Rollback

Application rollback removes the background job contracts, repository, email send enqueue call, tests, and docs.

Database rollback:

```sql
DROP POLICY IF EXISTS "tenant_isolation_background_jobs" ON "background_jobs";
DROP TABLE IF EXISTS "background_jobs";
```
