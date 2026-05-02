# 018A Email Sends Foundation

Implemented the internal email send request foundation. This issue creates controlled `email_sends` intentions from approved drafts and never sends real email.

## Files Changed

- `packages/db/src/schema.ts`
- `packages/db/migrations/0010_email_sends_access_rls.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/shared/src/contracts/email-sends.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/email-sends.ts`
- `apps/api/src/services/email-sends.ts`
- `apps/api/src/routes/email-sends.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/email-sends.test.ts`
- `docs/specs/018A-email-sends-foundation.md`
- `docs/implementation/018A-email-sends-foundation.md`

## Schema And Migration

The audit confirmed `email_sends` already existed in schema and migration `0000`. 018A did not recreate the table.

Added migration `0010_email_sends_access_rls.sql`:

- adds `lead_id`, `contact_id`, `metadata_json`, and `updated_at`
- adds FKs for `lead_id` and `contact_id`
- changes the default status to `pending`
- broadens the status check to include `pending` while preserving existing historical `queued` and `cancelled`
- adds `email_sends_set_updated_at_trg` using `syrantis_set_updated_at`
- grants `SELECT, INSERT, UPDATE` to `syrantis_app`
- enables RLS and FORCE RLS
- adds `tenant_isolation_email_sends`

RLS validation note: as `syrantis_app`, without `app.current_workspace_id`, `email_sends` returns zero rows. With `app.current_workspace_id` set to a workspace UUID, only rows for that workspace are visible.

## Routes Added

- `POST /api/drafts/:id/request-send`
- `GET /api/email-sends`
- `GET /api/email-sends/:id`

All routes are protected by `tenantGuard`. Client-provided `workspaceId` in body or query is rejected.

## Behavior

`POST /api/drafts/:id/request-send`:

- returns `401` without session
- returns `404` for missing, archived, or cross-workspace drafts
- returns `409 EMAIL_SEND_CONFLICT` unless the draft is `approved`
- returns `422 EMAIL_SEND_RECIPIENT_MISSING` when no recipient email can be resolved
- creates `email_sends.status = pending`
- generates an internal idempotency key because the existing schema requires it
- stores snapshot fields on `email_sends`
- writes `email_send.requested` and `email_send.created` activity logs in the same transaction

Activity logs include only compact metadata: draft, lead, contact, and status. They do not store subject, text body, or HTML body.

## Status Contract

The shared output contract accepts all database-valid statuses:

- `pending`
- `queued`
- `sent`
- `failed`
- `cancelled`

018A creates only `pending`. `queued` and `cancelled` remain readable for legacy rows.

## External Side Effects

No Resend provider code, external HTTP call, job, queue, webhook, AI call, or send execution was added.

The API implementation uses no `fetch`, `axios`, `undici`, `http.request`, or `https.request` in the 018A email send code path.

## Limits

- 018A only records an internal pending intention.
- No `sent` or `failed` transition route exists yet.
- No replay/idempotency behavior is exposed publicly.
- The internal sender is a placeholder snapshot value, not an actual sending identity.

## Rollback

Application rollback removes the new contracts, repository, service, routes, tests, and docs.

Database rollback:

```sql
DROP POLICY IF EXISTS "tenant_isolation_email_sends" ON "email_sends";
ALTER TABLE "email_sends" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "email_sends" DISABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE ON TABLE email_sends FROM syrantis_app;
DROP TRIGGER IF EXISTS email_sends_set_updated_at_trg ON email_sends;
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_status_check";
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_status_check" CHECK ("status" in ('queued', 'sent', 'failed', 'cancelled'));
ALTER TABLE "email_sends" ALTER COLUMN "status" SET DEFAULT 'queued';
ALTER TABLE "email_sends" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE "email_sends" DROP COLUMN IF EXISTS "metadata_json";
ALTER TABLE "email_sends" DROP COLUMN IF EXISTS "contact_id";
ALTER TABLE "email_sends" DROP COLUMN IF EXISTS "lead_id";
```
