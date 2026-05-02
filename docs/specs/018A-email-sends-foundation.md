# 018A Email Sends Foundation

## Goal

Create the internal `email_sends` foundation for requesting an email send from an approved draft.

018A creates only a controlled send intention. It does not send email, call Resend, perform external HTTP, enqueue jobs, register webhooks, or run AI.

## Existing Schema Audit

`email_sends` already exists in `packages/db/src/schema.ts` and migration `0000_early_blonde_phantom.sql`.

The existing table is not recreated. 018A adds only the missing access and runtime foundation:

- runtime grants for `syrantis_app`
- RLS and FORCE RLS tenant policy
- `updated_at` plus `email_sends_set_updated_at_trg`
- non-destructive snapshot columns `lead_id`, `contact_id`, and `metadata_json`
- status check/default support for the 018A `pending` state while preserving existing historical `queued` and `cancelled` statuses

## Routes

All routes are protected by `tenantGuard`.

- `POST /api/drafts/:id/request-send`
- `GET /api/email-sends`
- `GET /api/email-sends/:id`

No public route, API key auth path, send/execute endpoint, webhook route, queue, job, or external provider route is added.

## Request Send Contract

`POST /api/drafts/:id/request-send`

Payload:

```json
{
  "message": "optional operator note"
}
```

Client-provided `workspaceId` is rejected from body and query. `workspaceId` comes only from trusted tenant context.

## Business Rules

The route may create an `email_send` only when:

- the draft exists in the current workspace
- the draft is not archived
- `draft.status = approved`
- an approved approval row exists for the draft
- a recipient email can be resolved from the draft contact, or from the lead contact

If the draft is missing, archived, or cross-workspace, return `404`.

If the draft status is not `approved`, return `409 EMAIL_SEND_CONFLICT`.

If no recipient email can be resolved, return `422 EMAIL_SEND_RECIPIENT_MISSING`.

## Status Contract

The output contract accepts every status currently valid in the database:

- `pending`
- `queued`
- `sent`
- `failed`
- `cancelled`

018A creates only `pending`. `queued` and `cancelled` are accepted for legacy row inspection only.

## Transaction

Creation runs inside `withWorkspaceDb(workspaceId, async tx => ...)`.

The transaction:

1. Loads the visible draft by `id` and `workspaceId`.
2. Verifies `status = approved`.
3. Resolves the approved approval row needed by the existing table.
4. Resolves the recipient contact email in the same workspace.
5. Inserts `email_sends` with `status = pending`.
6. Stores a draft snapshot in `email_sends`: draft, lead, contact, recipient, subject, text body, and HTML body.
7. Writes compact activity logs:
   - `email_send.requested`
   - `email_send.created`

Activity log metadata must not include full email bodies or subject content.

## Tenant Isolation

Repository functions receive `workspaceId` explicitly and use Drizzle query builder. Business reads and writes filter by `workspaceId`; detail reads filter by both `id` and `workspaceId`.

RLS validation expectation:

```sql
RESET app.current_workspace_id;
SELECT count(*) FROM email_sends;
```

As `syrantis_app`, without `app.current_workspace_id`, `email_sends` returns zero rows because FORCE RLS applies the `tenant_isolation_email_sends` policy.

## Out Of Scope

- Real email sending
- Resend imports or calls
- `fetch`, `axios`, `undici`, `http.request`, or `https.request`
- send jobs or queues
- webhooks
- delivery status mutation routes
- idempotency replay behavior
- AI
- CRM push-back
- DELETE behavior
