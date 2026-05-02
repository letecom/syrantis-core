# Issue 017A - Drafts Foundation Implementation

## Summary

Implemented the internal authenticated drafts foundation under `/api/drafts`.

Drafts are controlled proposed outbound artifacts linked to existing leads. This issue prepares the future `lead -> draft -> approval -> send` path without creating approvals, generating AI content, sending email, adding jobs, or introducing public routes.

## Files Changed

- `packages/db/migrations/0009_drafts_foundation_access_rls.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/shared/src/contracts/drafts.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/drafts.ts`
- `apps/api/src/services/drafts.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/drafts.test.ts`
- `docs/specs/017A-drafts-foundation.md`
- `docs/implementation/017A-drafts-foundation.md`

## API

Implemented:

- `GET /api/drafts`
- `POST /api/drafts`
- `GET /api/drafts/:id`
- `PATCH /api/drafts/:id`
- `POST /api/drafts/:id/archive`

All routes use `tenantGuard`. `workspaceId` from body or query is rejected. The repository receives `workspaceId` explicitly and uses Drizzle query builder.

## Contracts

Draft create accepts:

- `leadId`
- optional `contactId`
- optional `channel`, currently only `email`
- optional `subject`
- optional `textBody`
- optional `htmlBody`
- optional `metadata`

At least one body field is required. Create always persists `status = draft`.

Draft update accepts only:

- `subject`
- `textBody`
- `htmlBody`
- `metadata`

Clients cannot directly set draft status or approval states in this issue.

## Relationship Validation

Create validates:

- lead exists in the current workspace
- optional contact exists in the current workspace
- optional contact does not conflict with a lead contact already present on the lead

Missing or cross-workspace related records return `404`.

## Archive Behavior

Archive is a status transition to `archived`; no hard delete was added.

Archived drafts are filtered out of list, detail, and update flows. The archive route returns the archived object once, then future detail or update calls return `404`.

## Activity Logs

Added shared activity action and entity contract support for:

- `draft.created`
- `draft.updated`
- `draft.archived`
- entity type `draft`

Repository mutations write the activity log in the same `withWorkspaceDb` transaction as the draft mutation.

## Runtime DB Access And RLS

Added migration `0009_drafts_foundation_access_rls.sql`:

```sql
GRANT SELECT, INSERT, UPDATE ON TABLE drafts TO syrantis_app;

ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drafts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_drafts"
ON "drafts"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
```

No unrelated table RLS policy or runtime grant was changed.

## Anti-Scope Confirmed

Not implemented:

- draft approval request route
- approval creation from drafts
- AI generation
- `ai_runs`
- Resend
- email sending
- jobs
- public draft routes
- webhooks
- OAuth
- rate limiting
- `DELETE` routes
- frontend changes
- tenant guard changes

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

## Rollback

Application rollback removes the drafts contracts, repository, service, routes, tests, and docs.

Database rollback:

```sql
DROP POLICY IF EXISTS "tenant_isolation_drafts" ON "drafts";
ALTER TABLE "drafts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "drafts" DISABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE ON TABLE drafts FROM syrantis_app;
```
