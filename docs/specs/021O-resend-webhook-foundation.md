# 021O — Resend Webhook Foundation

## Scope

Add a secure provider-facing `POST /api/webhooks/resend` endpoint for minimal Resend delivery proof.

The endpoint is not tenant-authenticated because Resend does not start with workspace context. It authenticates only through Svix-compatible Resend webhook signatures, then resolves `workspaceId` from a signed `provider_message_id` lookup.

## Security Requirements

- Do not use `tenantGuard` on the webhook route.
- Do not accept `workspaceId` from request body, query, URL params, or headers.
- Verify the raw request body before trusting or parsing payload content.
- Require `RESEND_WEBHOOK_SECRET`.
- Do not log or store raw webhook payloads, signature values, recipient addresses, subject, body, provider error text, or `provider_message_id`.
- Do not make provider external calls from the webhook route or service.
- Resolve `email_sends` through a dedicated RLS-safe SELECT policy using `current_setting('app.current_provider_message_id', true)`.
- Mutate delivery proof only after resolving `workspaceId`, through `withWorkspaceDb(workspaceId)`.

## Accepted Events

- `email.delivered`
- `email.bounced`
- `email.complained`

Ignored events return `200 { success:true, ignored:true }` and do not mutate:

- `email.sent`
- `email.delivery_delayed`
- `email.opened`
- `email.clicked`
- unknown event types

## Data Model

Do not extend `email_sends.status`. It remains submission/execution state:

- `pending`
- `queued`
- `sent`
- `failed`
- `cancelled`

Add delivery proof fields:

- `delivery_status text null`
- `delivered_at timestamptz null`
- `bounced_at timestamptz null`
- `complained_at timestamptz null`
- `delivery_error_code text null`

Allowed `delivery_status` values are `delivered`, `bounced`, `complained`, or null.

## Behavior

- `email.delivered`: set `delivery_status='delivered'`, set `delivered_at` if null, do not alter send execution status.
- `email.bounced`: set `delivery_status='bounced'`, set `bounced_at` if null, set `delivery_error_code='RESEND_BOUNCED'`.
- `email.complained`: set `delivery_status='complained'`, set `complained_at` if null, set `delivery_error_code='RESEND_COMPLAINED'`; preserve existing `delivered_at`.
- Duplicate already-applied events return unchanged.
- Unknown `provider_message_id` returns unmatched without leaking existence details.

## Read Models

Extend safe draft send read models with only:

- `deliveryStatus`
- `deliveredAt`
- `bouncedAt`
- `complainedAt`
- `deliveryErrorCode`

Continue hiding provider IDs, provider name, PII, subject/body content, metadata, raw errors, workspace internals, jobs, and AI internals.
