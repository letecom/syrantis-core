# Issue 014C Spec: Enable RLS For Stable Business Tables

## Objective

Enable PostgreSQL Row Level Security as a database-level tenant isolation layer for stable, workspace-scoped business tables.

The application already enforces tenant isolation through `tenantGuard`, explicit `workspaceId` repository filters, and `withWorkspaceDb`. This issue adds RLS as a defense-in-depth boundary for the stable tables that are ready for enforcement.

## Context

Validated production preflight from 014C0 confirmed:

- runtime `DATABASE_URL` uses `syrantis_app`
- migrations use `MIGRATION_DATABASE_URL` with `syrantis`
- `syrantis_app` is not superuser
- `syrantis_app` does not bypass RLS
- `syrantis_app` owns no tables
- current RLS status is disabled and not forced on scoped tables
- no existing RLS policies exist on scoped tables
- scoped tables have zero `workspace_id` null values

Runtime workspace context is set by `withWorkspaceDb(workspaceId, fn)` inside a transaction:

```sql
select set_config('app.current_workspace_id', workspaceId, true)
```

RLS policies must read that transaction-local setting.

## Tables In Scope

- `organizations`
- `contacts`
- `leads`
- `tasks`
- `approvals`
- `activity_logs`

## Tables Out Of Scope

- `users`
- `workspaces`
- `sessions`
- `drafts`
- `templates`
- `opportunities`
- `email_sends`
- `email_events`
- `ai_runs`
- `notes`
- `jobs`
- `webhooks`

Out-of-scope tables must not receive RLS policies in this issue.

## FORCE RLS Decision

The migration uses both:

```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;
```

The runtime role is `syrantis_app`, which is not a superuser, does not bypass RLS, and owns no tables. `FORCE ROW LEVEL SECURITY` still makes the desired posture explicit and prevents table-owner bypass if ownership or runtime role assumptions change later.

## Policy Template

Each in-scope table gets one permissive policy:

```sql
CREATE POLICY "tenant_isolation_<table_name>"
ON "<table_name>"
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

The `USING` expression limits reads and updates to the current workspace. The `WITH CHECK` expression prevents inserts and updates from writing rows outside the current workspace.

## Migration Strategy

Create the next sequential Drizzle SQL migration and register it in `packages/db/migrations/meta/_journal.json` so `pnpm --filter @syrantis/db migrate` executes it.

The migration must:

- enable RLS on each in-scope table
- force RLS on each in-scope table
- create exactly one tenant isolation policy per in-scope table
- avoid out-of-scope tables

No rollback migration is created unless the repository adopts explicit down migrations.

## Runtime Access Requirements

Every API path that touches in-scope business tables must run inside `withWorkspaceDb` or an equivalent transaction that sets `app.current_workspace_id`.

The audit must cover:

- list methods
- detail methods
- create methods
- update, archive, approve, and reject methods
- activity log reads and writes

Repositories must continue to receive `workspaceId` explicitly and must continue to filter by `workspaceId` so the tenant boundary remains obvious in code review.

## Rollback Strategy

Rollback SQL is documented, not shipped as a down migration:

```sql
DROP POLICY IF EXISTS "tenant_isolation_<table>" ON "<table>";
ALTER TABLE "<table>" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "<table>" DISABLE ROW LEVEL SECURITY;
```

Run this shape for each in-scope table if RLS activation must be reverted.

## Validation Plan

- Run `pnpm test`.
- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- Run the API import check with `DATABASE_URL` unset.
- Confirm the migration is registered in Drizzle metadata.
- Confirm the migration only touches in-scope tables.
- After applying the migration in staging or production, connect as `syrantis_app` and verify direct table reads without `app.current_workspace_id` return zero rows.
- Connect as `syrantis_app` and verify direct inserts without `app.current_workspace_id` fail due to the RLS `WITH CHECK`.
- Verify normal API flows still work through `tenantGuard` plus `withWorkspaceDb`.
- Verify cross-workspace API access remains `404`.

## Acceptance Criteria

- RLS is enabled and forced on all six in-scope tables.
- Exactly one tenant isolation policy exists for each in-scope table.
- No out-of-scope table receives RLS in this issue.
- Drizzle migration metadata registers the new migration.
- Runtime access audit finds all scoped business reads and writes wrapped with workspace context, or minimal wrapping fixes are made.
- Existing API route behavior is unchanged except for DB-level RLS enforcement.
- Rollback SQL is documented.
- Required checks and audits are run or any blocker is documented.
