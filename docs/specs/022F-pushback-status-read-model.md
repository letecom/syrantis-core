# 022F - Pushback Status Read Model

## Objective

Expose a safe backend read model for Google Sheets push-back state without requiring operators to
run manual SQL.

The read model prepares:

- 023A Minimal Admin Console
- 023B Admin Action Panel
- a future replay UI button
- cleaner founder/client diagnostics

## Routes

### `GET /api/email-sends/:id/pushback-status`

Authoritative status for a single `email_sends` row.

Rules:

- authenticated internal session only
- admin/founder only
- tenant-scoped through trusted server context
- unknown or cross-workspace email sends return 404
- no body, query, header, or client state may provide `workspaceId`

### `GET /api/drafts/:id/pushback-status`

UI resolver for a draft.

Rules:

- authenticated internal session only
- admin/founder only
- tenant-scoped through trusted server context
- unknown or cross-workspace drafts return 404
- resolves latest `email_sends` row by `created_at DESC, id DESC`
- does not filter by send status
- if no email send exists, returns `no_send`
- delegates to the same pushback status construction logic as the email-send route

## Data Sources

- `email_sends`: send status, delivery proof, replay eligibility
- `activity_logs`: pushback diagnostics
- `drafts`: draft route resolver only

Pushback diagnostic logs are linked by:

- `entity_type = 'email_send'`
- `entity_id = emailSendId`
- `type in ('crm_pushback.succeeded', 'crm_pushback.failed', 'crm_pushback.skipped')`

## Status Algorithm

When no email send exists for the draft resolver:

- `pushback.status = "no_send"`
- `canReplay = false`
- `canReplayReason = "no_email_send"`

When an email send exists:

- `pending` or `queued`: `send_not_terminal`
- `failed`: `send_failed`
- `cancelled`: `send_cancelled`
- `sent` with null delivery status: `no_delivery_proof`
- `sent` with `delivered`, `bounced`, or `complained` and no pushback log: `not_pushed`
- with pushback logs and replay eligibility: latest log by `created_at DESC, id DESC` wins

Replay eligibility is true only when:

- `email_sends.status = 'sent'`
- `delivery_status in ('delivered', 'bounced', 'complained')`

Manual replay is represented by:

- `latestSource = "manual_replay"`

No separate replayed status values exist.

## Safety Requirements

The read model is strictly read-only.

It must not:

- mutate `email_sends`
- create `activity_logs`
- create `background_jobs`
- call Google
- call Resend
- call `fetch`
- simulate webhooks
- replay pushback
- add a table or migration
- change existing pushback or replay behavior
- expose raw metadata
- expose `provider_message_id`
- expose contact email
- expose email subject or body
- expose raw Google errors
- expose raw webhook payloads
- expose credentials
- expose `workspaceId`

Only explicit safe fields may be mapped from `activity_logs.metadata_json`.

## Response Contract

The shared contract is `PushbackStatusResponseSchema`.

The response includes:

- target identity
- compact send state
- pushback status
- latest safe diagnostic event
- replay eligibility and endpoint
- safe diagnostic fields
- event counts
- recent history limited to 5 entries, newest first

## Non-Goals

022F does not add:

- UI
- replay execution changes
- Google Sheets changes
- Resend changes
- migrations
- background jobs
- CRM adapter abstractions
- outbox behavior
