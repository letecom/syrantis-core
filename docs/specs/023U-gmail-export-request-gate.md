# 023U - Gmail Export Request Gate

## Summary

023U adds an explicit per-draft request gate before the existing Apps Script Gmail draft export pull:

```txt
POST /api/drafts/:id/gmail-export-request
POST /api/drafts/:id/gmail-export-cancel
GET /api/drafts/gmail-export-pending?limit=5
GET /api/drafts/:id/gmail-export-status
```

Old draft rows are inert by default. The API-key pending endpoint may lease only drafts that an
admin/founder explicitly requested and whose request has not expired.

## Auth And Tenancy

- Request and cancel routes are session cookie only.
- Request and cancel routes require `admin` or `founder`.
- Request, cancel, and status are protected by `tenantGuard`.
- Pending remains workspace API-key authenticated and derives workspace from the API key.
- Client-provided workspace or tenant identity is rejected.
- Unknown and cross-workspace drafts return `404`.
- Invalid draft UUIDs return `400` on session routes.

## Metadata State

023U adds no migration and no table. All request state is stored under:

```txt
drafts.metadata_json.gmailExport
```

Request writes merge with existing metadata and set:

- `requestedAt`
- `requestExpiresAt`
- `requestSource = "admin_api"`
- `cancelledAt = null`
- `status = "requested"`
- `leaseToken = null`
- `leaseExpiresAt = null`

Cancel writes preserve existing request audit fields and set:

- `cancelledAt`
- `status = "cancelled"`
- `leaseToken = null`
- `leaseExpiresAt = null`

## Request Rules

`POST /api/drafts/:id/gmail-export-request` returns:

- `401` without session
- `403` for non-admin/non-founder users
- `400` for invalid UUIDs or client-provided workspace identity
- `404` for missing or cross-workspace drafts
- `409` for already exported drafts
- `409` for active leases
- `409` for non-`draft` draft status
- `409` for missing subject or text body
- `409` for missing or invalid recipient
- `409` when `email_sends` rows already exist

If a request is already active, the route is idempotent and returns `already_requested` without
changing timestamps or creating another activity log.

## Pending Rules

`GET /api/drafts/gmail-export-pending` keeps the 023S response shape and Apps Script contract. It
leases only drafts with:

- `requestedAt` present
- `requestExpiresAt` in the future
- no `cancelledAt`
- no `exportedAt`
- metadata status not `exported`
- metadata status not `cancelled`
- no active lease

Lease writes preserve `requestedAt`, `requestExpiresAt`, and `requestSource`.

## Status Rules

`GET /api/drafts/:id/gmail-export-status` adds safe request fields:

- `requestStatus`
- `requestedAt`
- `requestExpiresAt`
- `requestSource`

`canExport` is true only when the draft is otherwise ready, the request status is `requested`, export
status is `not_exported` or `lease_expired`, no active lease exists, and `email_sends` count is zero.
Approvals count remains diagnostic only.

## Non-Goals

023U does not add a migration, table, UI, Apps Script change, Gmail OAuth, Gmail send, provider call,
worker change, scoring change, draft generation change, approval creation, `email_sends` creation,
Caddy/systemd/env change, or deployment behavior.
