# 021G Draft Send Cancellation

## Goal

Add a tenant-scoped intention route that lets an authenticated user cancel the latest pending draft send before the worker executes it.

Route:

`POST /api/drafts/:id/cancel-send`

This issue adds no migration, UI, provider call, worker call, retry behavior, or new background job.

## Doctrine

- Route records user intention only.
- Worker remains responsible for send execution.
- Database state is the proof of cancellation.
- `activity_logs` stores one compact audit entry for the first successful cancellation.
- `workspaceId` comes only from trusted server context through `tenantGuard` and `getWorkspaceId(c)`.
- Cross-workspace, missing, and archived drafts are invisible and return `404 DRAFT_NOT_FOUND`.
- Routes do not call providers or workers.
- DTOs and activity logs do not expose raw PII, content, provider payloads, provider message IDs, or AI payloads.

## Behavior

The route locates the visible draft by `id` and `workspaceId`, excluding archived drafts.

It then locates the latest `email_sends` row for the draft ordered by:

1. `email_sends.created_at desc`
2. `email_sends.id desc`

If no send exists, the route returns:

```json
{
  "success": false,
  "error": "Draft send cancellation not allowed.",
  "code": "CANCEL_SEND_NOT_ALLOWED",
  "details": {
    "reason": "NO_SEND_TO_CANCEL",
    "currentStatus": null
  }
}
```

If the latest send is already `cancelled`, the route returns `200` as an idempotent no-op and creates no duplicate activity log.

If the latest send is `queued`, `sent`, or `failed`, the route returns `409 CANCEL_SEND_NOT_ALLOWED` with reason `SEND_NOT_PENDING` and performs no mutation.

If the latest send is `pending`, the route finds the linked `background_jobs` row where:

- `workspace_id` matches the trusted workspace
- `type = send_email`
- `payload_json->>'emailSendId'` equals the latest `email_sends.id`

Cancellation is allowed only when that job exists and has `status = pending`. Missing, running, completed, failed, or cancelled jobs return `409 CANCEL_SEND_NOT_ALLOWED` with reason `SEND_JOB_NOT_PENDING` and perform no mutation.

## Successful Mutation

When allowed, one transaction:

1. Updates `email_sends.status` from `pending` to `cancelled` using an `id + workspaceId + status = pending` guard.
2. Updates the linked `background_jobs.status` from `pending` to `cancelled` using an `id + workspaceId + status = pending` guard.
3. Creates exactly one activity log:
   - `type`: `email_send.cancelled`
   - `entity_type`: `email_send`
   - `entity_id`: `emailSendId`

If either guarded update affects zero rows, the transaction rolls back and returns `409 CANCEL_SEND_NOT_ALLOWED`.

Allowed activity metadata:

```json
{
  "draftId": "uuid",
  "emailSendId": "uuid",
  "jobId": "uuid",
  "previousStatus": "pending",
  "currentStatus": "cancelled"
}
```

Forbidden in response and activity metadata:

- contact or recipient email
- phone
- names
- subject
- text body
- HTML body
- provider
- provider message ID
- job payload
- raw errors
- secrets
- AI input or output fields

## Response

Success:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "emailSendId": "uuid",
    "previousStatus": "pending",
    "currentStatus": "cancelled",
    "cancelled": true,
    "cancelledAt": "2026-05-01T12:01:00.000Z"
  }
}
```

Already cancelled:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "emailSendId": "uuid",
    "previousStatus": "cancelled",
    "currentStatus": "cancelled",
    "cancelled": false,
    "cancelledAt": "2026-05-01T12:00:05.000Z"
  }
}
```

Blocked:

```json
{
  "success": false,
  "error": "Draft send cancellation not allowed.",
  "code": "CANCEL_SEND_NOT_ALLOWED",
  "details": {
    "reason": "SEND_JOB_NOT_PENDING",
    "currentStatus": "pending"
  }
}
```

## Tests

Required coverage:

- Successful pending send and linked pending job cancellation.
- Safe success DTO fields.
- Exactly one compact `email_send.cancelled` activity log on first cancellation.
- No PII, content, provider, or payload fields in activity metadata.
- Already-cancelled idempotent no-op.
- Queued, sent, and failed latest sends blocked with no mutation.
- No send blocked with no mutation.
- Missing, archived, and cross-workspace drafts return `404 DRAFT_NOT_FOUND`.
- Missing or non-pending linked jobs blocked with no mutation.
- Guarded-update race conflicts return `409 CANCEL_SEND_NOT_ALLOWED`.
- No provider, fetch, worker, or enqueue behavior.
- `GET /api/drafts/:id/send-status` reflects `latestSend.status = cancelled` after cancellation.
