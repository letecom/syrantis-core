# 021P - Terminal Delivery Immutability Guard Implementation

## Summary

Implemented database-level immutability protection for `email_sends` terminal submission proof and delivery proof.

This exists before CRM push-back so `email_sends` remains trustworthy as the canonical proof surface when future integrations read from it. The guard prevents later updates from rewriting terminal send outcomes or delivery proof after a webhook has established it.

## Database

Added migration `0018_email_sends_terminal_delivery_immutability.sql`.

The migration creates:

- `enforce_email_sends_terminal_delivery_immutability()`
- `email_sends_terminal_delivery_immutability_trg` on `public.email_sends`

The trigger uses `IS DISTINCT FROM` comparisons and compact generic exception messages:

- `email_sends terminal proof is immutable`
- `email_sends delivery proof is immutable`

The exceptions do not include provider message ids, email addresses, subject/body content, raw provider payloads, or other PII.

## Behavior

Protected states:

- `status in ('failed', 'cancelled')`: only `updated_at` may change.
- `status='sent'`: submission proof, identity, content snapshot, metadata, and creation fields are immutable; delivery fields may be populated.
- `delivery_status='delivered'`: `delivered_at` is preserved; the only allowed escalation is `delivered` to `complained` with `complained_at` set and `delivery_error_code='RESEND_COMPLAINED'`.
- `delivery_status in ('bounced', 'complained')`: delivery proof is terminal; only `updated_at` may change.

`pending` and `queued` rows without delivery proof are not over-constrained, so existing request-send, cancel-send, retry/backoff, and provider execution flows can continue.

## Verify-Schema

Extended verify-schema with 0018 catalog invariants for:

- Trigger function existence.
- Trigger existence on `public.email_sends`.
- Trigger enabled state.
- Trigger function target.

The verifier remains read-only and catalog-only. The 0018 checks use `pg_proc`, `pg_trigger`, `pg_class`, and `pg_namespace` and do not read tenant tables.

Expected verify-schema count after 021P: `checked=33`.

## Tests

Added verifier tests for:

- Registry includes 0018 invariants.
- Missing trigger function drift.
- Missing trigger drift.
- Disabled trigger drift.
- Wrong trigger function drift.
- Catalog-only SQL coverage including `pg_proc` and `pg_trigger`.
- JSON output compatibility at `checked=33`.

No new live database migration harness was introduced.

## Anti-Scope

This issue intentionally does not add:

- CRM push-back.
- Connectors.
- New public API routes.
- UI.
- Event store tables.
- Raw webhook payload persistence.
- Provider calls.
- Resend signature verification changes.
- Status vocabulary changes.
- Read model changes.

021O delivery proof behavior remains in place.

## Production Validation

Recommended validation:

- Run `pnpm --filter @syrantis/db verify-migration-files`.
- Apply migrations in the approved deployment process.
- Run verify-schema and confirm `checked=33` with zero drift.
- Confirm the trigger is enabled and targets `enforce_email_sends_terminal_delivery_immutability()`.
- Exercise delivered, bounced, complained, duplicate delivered, and complained-after-delivered webhook flows.
- Confirm any intentional trigger exception contains no PII or provider identifiers.

## Rollback

Rollback is limited to the 0018 database objects:

- Drop `email_sends_terminal_delivery_immutability_trg`.
- Drop `enforce_email_sends_terminal_delivery_immutability()`.

No API, worker, read model, CRM, event store, provider, or route rollback is required because none were changed.
