# Issue 017A - Drafts Foundation

## Goal

Implement the internal drafts foundation for controlled proposed outbound artifacts linked to existing leads.

The draft chain prepared by this issue is:

`lead -> draft -> approval -> send`

Only the draft resource is in scope. Approval handoff, AI generation, email sending, jobs, Resend, public routes, and webhooks are out of scope.

## Data Model

Use the existing `drafts` table from `packages/db/src/schema.ts`.

The API exposes the stable DB-backed subset:

- `leadId`
- `contactId`
- `channel`
- `subject`
- `textBody`
- `htmlBody`
- `metadata`

The existing DB status values are:

- `draft`
- `pending_approval`
- `approved`
- `rejected`
- `archived`

Issue 017A creates drafts with `status = draft` and archives drafts by setting `status = archived`. Clients cannot set `pending_approval`, `approved`, or `rejected`.

## Auth And Tenant Boundary

All `/api/drafts` routes are internal authenticated routes protected by `tenantGuard`.

Routes must never accept `workspaceId` from request body, query params, URL params, headers, or client-side state. The route reads `workspaceId` only from trusted tenant context and passes it into the service or repository.

Cross-workspace drafts and related records must behave as invisible and return `404`.

## Routes

Implemented routes:

- `GET /api/drafts`
- `POST /api/drafts`
- `GET /api/drafts/:id`
- `PATCH /api/drafts/:id`
- `POST /api/drafts/:id/archive`

Forbidden in this issue:

- `POST /api/drafts/:id/request-approval`
- approval creation from drafts
- AI generation
- `ai_runs`
- Resend
- email sending
- jobs
- public routes
- webhooks
- OAuth
- rate limiting
- `DELETE` routes

## Create Contract

`POST /api/drafts`

```json
{
  "leadId": "uuid",
  "contactId": "optional uuid",
  "channel": "email",
  "subject": "optional string",
  "textBody": "optional string",
  "htmlBody": "optional string",
  "metadata": {}
}
```

Rules:

- `leadId` is required.
- At least one of `textBody` or `htmlBody` is required.
- `channel` defaults to `email`; no other channels are introduced.
- The linked lead must exist in the current workspace.
- When `contactId` is provided, the contact must exist in the current workspace.
- When the lead already has a contact, provided `contactId` must not conflict with it.

## Update Contract

`PATCH /api/drafts/:id`

Editable fields:

- `subject`
- `textBody`
- `htmlBody`
- `metadata`

PATCH cannot change lead, contact, workspace, status, approval state, or sending state.

## Archive Behavior

`POST /api/drafts/:id/archive` sets `status = archived`.

Archived drafts:

- do not appear in list responses
- cannot be read by detail route
- cannot be updated
- are returned once by the archive response
- are not hard deleted

## Activity Logs

Mutation and activity log writes must happen in the same `withWorkspaceDb` transaction. If the log fails, the mutation rolls back.

Activity actions:

- `draft.created`
- `draft.updated`
- `draft.archived`

Activity entity type:

- `draft`

## Runtime DB Access And RLS

Because `drafts` existed before runtime role separation, add a migration for runtime access:

- `GRANT SELECT, INSERT, UPDATE ON TABLE drafts TO syrantis_app`
- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- tenant isolation policy using `app.current_workspace_id`

No unrelated RLS policies or grants are in scope.

## Validation Commands

Run before release:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```
