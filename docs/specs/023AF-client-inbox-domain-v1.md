# 023AF Client Inbox Domain v1

## Scope

023AF adds the backend foundation for the future live client Inbox. It creates the first dedicated
Client Inbox Domain so the future `app.syrantis.fr` Inbox can read prioritized message summaries,
open one message with its body, edit the associated draft, and request or cancel Gmail draft export
from the Inbox context.

The live client Inbox must not directly reuse the existing founder/admin validation queues. Mail
Queue and Draft Queue remain safe validation surfaces; Client Inbox has its own storage and API
contract.

## Non-Goals

- No live UI implementation.
- No change to `ClientInboxPreviewPage`.
- No client role or RBAC model.
- No AI rewrite route or job.
- No direct send.
- No Gmail, Google API, Resend, OpenRouter, Google Sheets, Apps Script, Caddy, systemd, env, or
  deployment change.
- No raw Gmail or provider payload storage.

## Storage

Add `client_mail_items` as the dedicated workspace-scoped mail item table.

Approved client Inbox fields include:

- safe links to `intake_classifications`, `leads`, `contacts`, and `drafts`
- external id and thread id as internal storage only
- source and inbound-only direction
- client-visible sender/recipient display, sender/recipient email, subject, snippet, body text
- received timestamp
- attachment metadata as a JSON array
- created and updated timestamps

The table has nullable foreign keys with `on delete set null`, no cascading business deletes,
workspace RLS, FORCE RLS, the standard tenant policy, a partial unique index on
`(workspace_id, external_id)` when `external_id` is present, read indexes for Inbox queries, and the
standard `syrantis_set_updated_at` trigger.

Full mail body is approved only in this table and the dedicated detail DTO.

## Intake Behavior

`POST /api/intake/inbound-message` keeps API-key workspace resolution and the 023Z classification
gate. For every request that passes validation, intake creates or reuses exactly one
`client_mail_items` row under the existing external id semantics.

Ignored messages now create:

- one `intake_classifications` row
- one `client_mail_items` row
- no lead
- no score job
- no draft
- no approval
- no `email_sends`
- no provider call

Leadable or review messages continue the existing lead/contact/job path and link the mail item to
classification, lead, and contact where available. When draft generation later creates a draft for
the lead, the draft id is backfilled into matching mail items.

Public intake response shape remains safe. It does not expose `body_text`, email addresses,
workspace id, provider ids, prompt/output, raw metadata, API key material, or raw provider payload.

## Client Inbox Routes

Session-only founder/admin routes are mounted under:

```txt
GET /api/client/inbox/messages
GET /api/client/inbox/messages/:mailItemId
PATCH /api/client/inbox/messages/:mailItemId/draft
POST /api/client/inbox/messages/:mailItemId/gmail-export-request
POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel
```

All routes are protected by `tenantGuard`, derive workspace only from trusted server context, reject
client-provided workspace or tenant identity, and return `404` for missing or cross-workspace mail
items.

The list route supports tab, score band, category, contact status, draft status, pagination, and
sort query params. It returns summary DTOs only. The DTO keeps a nullable `subject` field for the
frozen 023AE shape, but v1 returns `null` there so subject values stay in storage/detail only. It
intentionally omits full body, sender email, recipient email, workspace id, provider ids, raw
metadata, prompt/output, lease token, and API key material.

The detail route is the narrow place where client-visible `bodyText`, `fromEmail`, and `toEmail`
may be returned. It still excludes workspace id, raw metadata, provider ids, prompt/output, lease
token, API key material, and raw Gmail/provider payload.

## Draft Edit

`PATCH /api/client/inbox/messages/:mailItemId/draft` resolves the draft through the workspace-safe
mail item relation. It updates only Syrantis draft fields and safe metadata indicating a client
Inbox human edit. It may write a compact safe activity log.

The route does not call providers, send mail, request export, create approvals, create
`email_sends`, or create background jobs. Response and activity metadata do not include subject,
body, sender, recipient, or body text.

## Gmail Export Wrappers

Inbox export routes resolve `mailItemId -> draftId` and delegate to the existing 023U Gmail export
request/cancel service rules. They do not duplicate Gmail export business rules.

The wrappers do not call Gmail, Google APIs, Apps Script, Resend, or providers. They do not create
approvals, `email_sends`, sends, or background jobs.

## Safety Boundary

Allowed only in `client_mail_items` and the dedicated detail DTO:

- `from_email`
- `to_email`
- `subject`
- `body_text`

Not allowed in activity log metadata, background job payloads, public intake responses, list route
responses, Google Sheets, admin queues, raw metadata, prompts, outputs, provider payloads, or docs
examples with real customer data.

## Future Work

Future UI work can consume the list/detail/action routes. AI rewrite and direct send require
separate approved issues.
