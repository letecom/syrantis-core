# 021P - Terminal Delivery Immutability Guard

## Scope

Add database-level immutability protection for `email_sends` proof-bearing rows before CRM push-back is built.

021O made `email_sends` the canonical delivery proof surface for Resend webhooks. 021P protects that surface with a PostgreSQL `BEFORE UPDATE` trigger so later worker, webhook, or internal updates cannot corrupt submission proof or delivery proof after it has become meaningful.

This issue does not add CRM push-back, a connector, an event store, a public API route, UI, raw webhook payload persistence, provider calls, or changes to Resend signature verification.

## Proof Dimensions

Submission and execution proof:

- `status`
- `provider`
- `provider_message_id`
- `sent_at`
- `failed_at`
- `last_error_code`
- `last_error_message`

Delivery proof:

- `delivery_status`
- `delivered_at`
- `bounced_at`
- `complained_at`
- `delivery_error_code`

Identity and canonical record fields such as `id`, `workspace_id`, `draft_id`, `approval_id`, contact links, idempotency key, content snapshot, metadata, and `created_at` must also remain stable once the row is terminal or delivery proof-bearing.

## Database Behavior

Add migration `0018_email_sends_terminal_delivery_immutability.sql`.

The migration must:

- Create or replace `enforce_email_sends_terminal_delivery_immutability()`.
- Create `email_sends_terminal_delivery_immutability_trg` as a `BEFORE UPDATE` trigger on `public.email_sends`.
- Use `IS DISTINCT FROM` comparisons.
- Avoid dynamic SQL.
- Avoid PII, provider message ids, recipient addresses, subject/body content, and raw provider payload values in exception text.
- Raise compact generic errors only, such as `email_sends terminal proof is immutable` and `email_sends delivery proof is immutable`.

Expected semantics:

- `failed` and `cancelled` rows are terminal. Only `updated_at` may change.
- `sent` rows with no delivery proof have immutable submission proof. Delivery proof fields may be populated by webhook behavior.
- `delivered` preserves `delivered_at`. The only valid delivery escalation is `delivered` to `complained`, with `complained_at` set and `delivery_error_code='RESEND_COMPLAINED'`.
- `delivered` to `bounced`, `delivered` to null, delivered timestamp rewrites, and submission proof mutation are blocked.
- `bounced` and `complained` delivery proof is terminal. Only `updated_at` may change.
- `pending` and `queued` rows without delivery proof remain unconstrained so normal worker lifecycle, retry, backoff, cancellation, and provider submission flows continue.

## Verification

Extend verify-schema with catalog-only invariants for migration 0018:

- Trigger function exists in `public`.
- Trigger exists on `public.email_sends`.
- Trigger is enabled.
- Trigger points to `enforce_email_sends_terminal_delivery_immutability()`.

Verifier SQL must remain read-only and catalog-only, using PostgreSQL metadata such as `pg_proc`, `pg_trigger`, `pg_class`, and `pg_namespace`. It must not read tenant tables and must not run DDL or DML.

Expected verify-schema count after 021P: `checked=33`.

## Tests

Required verifier coverage:

- Registry includes 0018 terminal delivery immutability invariants.
- Drift when trigger function is missing.
- Drift when trigger is missing.
- Drift when trigger is disabled.
- Drift when trigger points to the wrong function.
- Catalog-only SQL remains true.
- JSON output compatibility remains true.

Required regression coverage:

- Resend webhook delivery, bounce, complaint, complaint-after-delivery, and duplicate delivery behavior still passes.
- Draft send status and send attempts read models still expose safe delivery proof fields.
- Existing background job and email send tests still pass.
- Full test, typecheck, lint, and build remain green.

## Production Validation

Before production rollout:

- Run migration file verification and verify-schema against the target database.
- Confirm verify-schema reports `checked=33` with no drift.
- Confirm the trigger is enabled on `public.email_sends` and points to the expected function.
- Exercise a staging or production-like Resend webhook flow for delivered, bounced, and complained events.
- Confirm trigger errors, if intentionally tested, contain no PII or provider message ids.

## Rollback

Rollback is database-only:

- Drop `email_sends_terminal_delivery_immutability_trg` from `email_sends`.
- Drop `enforce_email_sends_terminal_delivery_immutability()`.
- Re-run verify-schema to confirm 0018 drift is expected for the rolled-back state.

No read model, route, worker, provider, event store, or CRM rollback is required because this issue does not change those surfaces.
