# Issue 017B - Draft Approval Request Layer

## Goal

Connect existing drafts to the existing approvals system using Option B:

- `POST /api/drafts/:id/request-approval`
- approval approve/reject propagation back to `draft.status`

This creates the human approval lock needed before future email sending. It does not send email.

## Schema Audit

Use the existing schema in `packages/db/src/schema.ts`.

Confirmed:

- `approvals.draftId` exists.
- `approvals.taskId` is nullable.
- A draft-only approval is possible without a migration.

No new table or migration is approved for this issue.

## Auth And Tenant Boundary

`POST /api/drafts/:id/request-approval` is an internal authenticated route protected by `tenantGuard`.

Routes must never accept `workspaceId` from body or query. `workspaceId` comes only from trusted tenant context and is passed explicitly into services and repositories.

Cross-workspace drafts and approvals remain invisible and return `404`.

Archived drafts remain hidden and return `404`.

## Request Approval Route

`POST /api/drafts/:id/request-approval`

Optional body:

```json
{
  "note": "optional string, max 1000 chars"
}
```

Empty body is accepted.

Success response is `201`:

```json
{
  "success": true,
  "data": {
    "draft": {},
    "approval": {}
  }
}
```

Rules:

- Missing draft or cross-workspace draft returns `404 DRAFT_NOT_FOUND`.
- Archived draft returns `404 DRAFT_NOT_FOUND`.
- Draft status other than `draft` returns `409 DRAFT_APPROVAL_CONFLICT`.
- Existing pending approval for the draft returns `409 DRAFT_APPROVAL_CONFLICT`.
- On success, set draft status to `pending_approval`.
- On success, create an approval linked by `draftId`.
- On success, write `draft.approval_requested` and `approval.created`.
- Mutation and activity logs are ACID in one `withWorkspaceDb` transaction.

The public `/api/approvals` create route remains task-only. Draft approvals are created only through `/api/drafts/:id/request-approval`.

## State Machine

Allowed transitions in this issue:

- `draft -> pending_approval` via request approval
- `pending_approval -> approved` via approval approve
- `pending_approval -> rejected` via approval reject

`approved` means the draft passed the business approval lock. It is not a send and does not trigger email.

`rejected` records the human decision only. It does not create follow-up work, AI output, or email.

`archived` remains hidden from normal draft reads.

## Approval Propagation

When `POST /api/approvals/:id/approve` approves an approval with `draftId`:

- verify the draft exists in the same workspace
- verify `draft.status = pending_approval`
- set `draft.status = approved`
- write `draft.approved`
- keep writing `approval.approved`
- keep task approval behavior unchanged
- run all writes in the same `withWorkspaceDb` transaction

When `POST /api/approvals/:id/reject` rejects an approval with `draftId`:

- verify the draft exists in the same workspace
- verify `draft.status = pending_approval`
- set `draft.status = rejected`
- write `draft.rejected`
- keep writing `approval.rejected`
- keep task approval behavior unchanged
- run all writes in the same `withWorkspaceDb` transaction

## Activity Logs

New activity actions:

- `draft.approval_requested`
- `draft.approved`
- `draft.rejected`

Existing approval actions remain:

- `approval.created`
- `approval.approved`
- `approval.rejected`

## Anti-Scope

Not in scope:

- AI
- Resend
- email sending
- `email_sends`
- jobs
- public routes
- webhooks
- new tables
- migrations
- tenant guard changes
- auth/session changes
- frontend
- business hard deletes
- raw SQL in application code

Resend and actual email sending arrive in a later issue.

## Production Validation

Before release:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```
