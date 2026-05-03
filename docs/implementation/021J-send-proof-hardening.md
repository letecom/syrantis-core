# 021J - Send Proof Hardening

## Summary

Implemented DB-level proof hardening for `email_sends` and extended verify-schema so production can prove the 0016 objects exist.

This issue keeps the current route, worker, DTO, and shared contract surfaces unchanged.

## Files Changed

- `packages/db/migrations/0016_email_sends_proof_constraints.sql`
- `packages/db/src/verify/types.ts`
- `packages/db/src/verify/registry.ts`
- `packages/db/src/verify/queries.ts`
- `packages/db/src/verify/verifier.ts`
- `packages/db/src/verify/verifier.test.ts`
- `docs/specs/021J-send-proof-hardening.md`
- `docs/implementation/021J-send-proof-hardening.md`

## Behavior Delivered

Migration 0016 adds:

- partial unique index `email_sends_provider_message_id_unique_idx`
- check constraint `email_sends_sent_requires_sent_at`
- check constraint `email_sends_failed_requires_failed_at`
- check constraint `email_sends_failed_requires_last_error_code`

verify-schema now supports named check constraint invariants by schema, table, name, and `pg_constraint.contype = 'c'`.

## Anti-Scope Confirmed

No routes, worker behavior, shared API contracts, UI, webhook behavior, CRM push-back, send-attempt history endpoint, terminal immutability trigger, `cancelled_at` column, provider message ID exposure, raw provider error exposure, or data backfill was added.

## Pre-Migration Audit

Run these before applying migration 0016 in production. All must return zero rows.

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

If any query returns rows, do not apply migration 0016 until production data is manually fixed.

## Production Validation Plan

1. Run the pre-migration audit queries. All must return zero rows.
2. Run migration 0016.
3. Run `pnpm --filter @syrantis/db verify-schema`.
4. Confirm verify-schema output includes 0015 and 0016 invariants passing.
5. Run internal provider pipeline: draft -> approval -> request-send -> `worker:once`.
6. Verify `email_sends.status = 'queued'`, `provider_message_id is null`, and `sent_at is null`.
7. Verify no constraint violation occurs.
8. Verify `GET /api/drafts/:id/send-status` returns safe output and no `provider_message_id`.

## Rollback SQL

```sql
DROP INDEX IF EXISTS "email_sends_provider_message_id_unique_idx";
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_sent_requires_sent_at";
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_failed_requires_failed_at";
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_failed_requires_last_error_code";
```

## Verification Notes

Focused DB tests cover:

- registry coverage for all 0016 objects
- verifier pass when the 0016 index and check constraints exist
- drift when the provider message ID unique index is missing
- drift when each 0016 check constraint is missing
- existing 0015 column and index invariants
- read-only catalog SQL limited to PostgreSQL metadata
