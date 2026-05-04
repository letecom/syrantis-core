# 021O — Resend Webhook Foundation Implementation

## Summary

Implemented a minimal Resend webhook foundation at `POST /api/webhooks/resend`.

The route verifies Svix-compatible Resend signatures against the raw request body before parsing event content. It rejects missing webhook configuration, missing headers, invalid signatures, malformed payloads, and client-provided workspace identifiers. It ignores non-delivery events and applies delivery proof only for delivered, bounced, and complained events.

## Database

Added migration `0017_resend_webhook_delivery_proof.sql`:

- Adds delivery proof columns to `email_sends`.
- Adds delivery status and timestamp check constraints.
- Adds `email_sends_provider_message_lookup` SELECT policy using `app.current_provider_message_id`.
- Does not add an event store table.
- Does not add terminal immutability triggers.

Updated Drizzle schema and verify-schema registry. The registry now checks 31 invariants: the prior 21 plus 10 delivery proof invariants for 0017.

## RLS Flow

The webhook starts without workspace context:

1. Verify raw request body with Svix/Resend signature.
2. Extract provider message id from the signed payload.
3. Use `withProviderMessageLookupDb(providerMessageId)` for the dedicated RLS-safe lookup.
4. Resolve `workspaceId` from the matched `email_sends` row.
5. Apply mutation through `withWorkspaceDb(workspaceId)`.

## Activity Logs

One compact `email_send.delivery_updated` activity log is written only when delivery state changes. It stores only internal email send id, event type, and safe delivery status. It does not store raw payloads, provider message ids, recipients, subject/body content, signatures, or raw provider errors.

## Read Models

Extended:

- `GET /api/drafts/:id/send-status`
- `GET /api/drafts/:id/send-attempts`

Both expose only safe delivery proof fields and continue hiding provider ids, provider name, PII, content, raw errors, metadata, workspace ids, job internals, and AI internals.

## Verification Notes

Targeted tests cover webhook error responses, signature ordering, ignored/unmatched/idempotent events, delivery proof mutations, workspace isolation behavior, safe read-model fields, no provider external calls, and verify-schema drift detection.

No deploy, merge, or production environment access was performed.
