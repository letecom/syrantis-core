# 021G Draft Send Cancellation

## Summary

Implemented `POST /api/drafts/:id/cancel-send` as a tenant-scoped intention route for cancelling the latest pending draft send before worker execution.

No migration, UI, provider call, worker call, retry behavior, or new background job was added.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
  - Added draft send cancellation response schema and types.
- `packages/shared/src/contracts/activity-logs.ts`
  - Added `email_send.cancelled`.
- `apps/api/src/routes/drafts.ts`
  - Added the protected `POST /api/drafts/:id/cancel-send` route.
  - Uses `tenantGuard`, `getWorkspaceId(c)`, and rejects client-provided `workspaceId`.
- `apps/api/src/services/draft-send-cancellation.ts`
  - Maps repository rows into safe DTO output.
- `apps/api/src/repositories/draft-send-cancellation.ts`
  - Finds visible drafts by `id + workspaceId` excluding archived drafts.
  - Selects the latest send by `created_at desc, id desc`.
  - Finds the linked `send_email` job by trusted workspace and `payload_json->>'emailSendId'`.
  - Performs guarded email send and job status updates in one transaction.
  - Creates one compact `email_send.cancelled` activity log only on first cancellation.
- `apps/api/src/tests/draft-send-cancellation.test.ts`
  - Covers success, idempotency, blocked states, tenant invisibility, guarded-update conflicts, safe DTOs, safe activity metadata, no provider/worker/enqueue calls, and send-status reflection.
- `docs/specs/021G-draft-send-cancellation.md`
  - Added issue spec.
- `docs/implementation/021G-draft-send-cancellation.md`
  - Added implementation report.

## Exact Behavior

`POST /api/drafts/:id/cancel-send`:

- Returns `404 DRAFT_NOT_FOUND` for missing, archived, or cross-workspace drafts.
- Returns `409 CANCEL_SEND_NOT_ALLOWED` with `NO_SEND_TO_CANCEL` when no send exists.
- Returns `200` for already-cancelled latest sends without mutating or logging again.
- Returns `409 CANCEL_SEND_NOT_ALLOWED` with `SEND_NOT_PENDING` for queued, sent, or failed latest sends.
- Allows cancellation only when the latest send is `pending` and the linked `send_email` job is also `pending`.
- Returns `409 CANCEL_SEND_NOT_ALLOWED` with `SEND_JOB_NOT_PENDING` when the linked job is missing or not pending.
- On success, updates `email_sends.status` and `background_jobs.status` to `cancelled` using guarded `id + workspaceId + status = pending` updates.
- Rolls back and returns `409 CANCEL_SEND_NOT_ALLOWED` if either guarded update affects zero rows.
- Creates exactly one activity log:
  - `type`: `email_send.cancelled`
  - `entity_type`: `email_send`
  - `entity_id`: `emailSendId`
  - metadata: `draftId`, `emailSendId`, `jobId`, `previousStatus`, `currentStatus`

The route does not expose contact email, recipient email, names, phone, subject, text body, HTML body, provider, provider message ID, payload JSON, raw errors, secrets, or AI fields.

## Security Notes

`workspaceId` is never accepted from body, query, URL params, headers, or client state. The route uses the same protected draft route mounting style as the existing draft routes and passes the trusted workspace into the service/repository layer.

Cancellation does not call Resend, OpenRouter, fetch, worker entrypoints, or job enqueue helpers.

## Rollback

Revert the route, service, repository, shared contract additions, tests, and docs from this issue. No database migration rollback is required.
