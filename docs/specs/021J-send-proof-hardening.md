# 021J - Send Proof Hardening

## Goal

Harden `email_sends` as database proof for send execution outcomes.

021J adds database-level constraints that make terminal send proof rows harder to write incorrectly, and extends `pnpm --filter @syrantis/db verify-schema` so production can prove those hardening objects exist in the PostgreSQL catalog.

## Constraints

Migration `0016_email_sends_proof_constraints.sql` must add:

- partial unique index `email_sends_provider_message_id_unique_idx` on `email_sends(provider_message_id)` where `provider_message_id is not null`
- check constraint `email_sends_sent_requires_sent_at`: `status <> 'sent' OR sent_at IS NOT NULL`
- check constraint `email_sends_failed_requires_failed_at`: `status <> 'failed' OR failed_at IS NOT NULL`
- check constraint `email_sends_failed_requires_last_error_code`: `status <> 'failed' OR last_error_code IS NOT NULL`

The check constraints must be added through idempotent `DO` blocks that inspect `pg_constraint` before `ALTER TABLE`, because PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS`.

## verify-schema

The verify-schema registry must include 0016 invariants for:

- index `email_sends_provider_message_id_unique_idx` on `email_sends`
- check constraint `email_sends_sent_requires_sent_at` on `email_sends`
- check constraint `email_sends_failed_requires_failed_at` on `email_sends`
- check constraint `email_sends_failed_requires_last_error_code` on `email_sends`

The verifier must check named check constraints by exact table, schema, and constraint name. It should verify `pg_constraint.contype = 'c'`. It must not inspect business table data and must remain read-only.

## Anti-Scope

021J does not add or change:

- routes
- worker behavior unless existing behavior violates the new constraints
- DTOs or shared API contracts
- UI
- webhook behavior
- CRM push-back
- send-attempt history endpoint
- terminal immutability trigger
- `cancelled_at` column
- provider message ID exposure to normal API clients
- raw provider error exposure
- data backfill unless tests prove it is unavoidable

## Pre-Migration Audit

Run these queries in production before applying migration 0016. All must return zero rows. If any query returns rows, do not apply the migration until the data is fixed manually.

```sql
-- Sent rows missing sent_at
select id, status, sent_at
from email_sends
where status = 'sent'
  and sent_at is null;

-- Failed rows missing failed_at
select id, status, failed_at
from email_sends
where status = 'failed'
  and failed_at is null;

-- Failed rows missing last_error_code
select id, status, last_error_code
from email_sends
where status = 'failed'
  and last_error_code is null;

-- Duplicate provider_message_id
select provider_message_id, count(*)
from email_sends
where provider_message_id is not null
group by provider_message_id
having count(*) > 1;
```

## Production Validation

1. Run the pre-migration audit queries. All must return zero rows.
2. Run migration 0016.
3. Run `pnpm --filter @syrantis/db verify-schema`.
4. Confirm verify-schema output includes 0015 and 0016 invariants passing.
5. Run the internal provider pipeline: draft -> approval -> request-send -> `worker:once`.
6. Verify the resulting `email_sends` row has `status = 'queued'`, `provider_message_id is null`, and `sent_at is null`.
7. Verify no constraint violation occurs.
8. Verify `GET /api/drafts/:id/send-status` still returns safe output and does not include `provider_message_id`.

## Rollback

```sql
DROP INDEX IF EXISTS "email_sends_provider_message_id_unique_idx";
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_sent_requires_sent_at";
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_failed_requires_failed_at";
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_failed_requires_last_error_code";
```
