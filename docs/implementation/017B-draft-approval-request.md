# Issue 017B - Draft Approval Request Layer Implementation

## Summary

Implemented Option B for draft approvals.

Drafts can now request human approval through `/api/drafts/:id/request-approval`. Approval approve/reject decisions propagate back to `draft.status`.

This is only a business approval lock. No email is sent, no Resend integration is called, and no send-side table or job is introduced.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
- `packages/shared/src/contracts/approvals.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/repositories/drafts.ts`
- `apps/api/src/services/drafts.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/repositories/approvals.ts`
- `apps/api/src/services/approvals.ts`
- `apps/api/src/tests/drafts.test.ts`
- `apps/api/src/tests/approvals.test.ts`
- `docs/specs/017B-draft-approval-request.md`
- `docs/implementation/017B-draft-approval-request.md`

## Schema Audit

Audited `packages/db/src/schema.ts` before implementation.

Confirmed:

- `approvals.draftId` exists.
- `approvals.taskId` is nullable.
- A draft-only approval can be created without migration.

Migration: no.

## API

Added:

- `POST /api/drafts/:id/request-approval`

The route is protected by `tenantGuard`. `workspaceId` from body or query returns `400 INVALID_REQUEST`.

Success response is `201` with:

- `draft` as `DraftOutput`
- `approval` as `ApprovalOutput`

`ApprovalOutput` now includes `draftId`.

## Behavior

Request approval:

- missing, archived, or cross-workspace draft returns `404 DRAFT_NOT_FOUND`
- non-`draft` status returns `409 DRAFT_APPROVAL_CONFLICT`
- existing pending approval for the draft returns `409 DRAFT_APPROVAL_CONFLICT`
- success updates `draft.status = pending_approval`
- success creates `approvals` row with `entityType = draft`, `entityId = draft.id`, and `draftId = draft.id`

Approve propagation:

- task approvals remain unchanged when `draftId` is null
- draft approvals require the draft to exist in the workspace with `status = pending_approval`
- approval approve sets `draft.status = approved`

Reject propagation:

- task approvals remain unchanged when `draftId` is null
- draft approvals require the draft to exist in the workspace with `status = pending_approval`
- approval reject sets `draft.status = rejected`

## Activity Logs

Added shared contract actions:

- `draft.approval_requested`
- `draft.approved`
- `draft.rejected`

Repository writes run in the same `withWorkspaceDb` transaction as their mutations:

- request approval writes `draft.approval_requested` and `approval.created`
- approve writes `approval.approved` and `draft.approved`
- reject writes `approval.rejected` and `draft.rejected`

## Email Boundary

No email is sent in this issue.

`draft.status = approved` means only that the draft passed the human business lock. It does not mean a message was sent.

Resend, `email_sends`, jobs, delivery status, and outbound side effects remain future work.

## Production Validation

Run before release:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

## Rollback

Application rollback removes the route, shared contracts, repository/service changes, tests, and docs from this issue.

No database rollback is required because no migration was added.
