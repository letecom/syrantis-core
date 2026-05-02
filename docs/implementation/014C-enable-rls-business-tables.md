# Issue 014C Implementation: Enable RLS For Stable Business Tables

## Changed Files

- `packages/db/migrations/0005_enable_rls_business_tables.sql`
- `packages/db/migrations/meta/_journal.json`
- `docs/specs/014C-enable-rls-business-tables.md`
- `docs/implementation/014C-enable-rls-business-tables.md`

## Migration Name

- `0005_enable_rls_business_tables.sql`

## Policy List

- `tenant_isolation_organizations` on `organizations`
- `tenant_isolation_contacts` on `contacts`
- `tenant_isolation_leads` on `leads`
- `tenant_isolation_tasks` on `tasks`
- `tenant_isolation_approvals` on `approvals`
- `tenant_isolation_activity_logs` on `activity_logs`

Each policy uses:

```sql
workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
```

for both `USING` and `WITH CHECK`.

## Runtime Wrapping Changes

No runtime code changes were required.

The audit confirmed the six scoped repositories already use `withWorkspaceDb` for list, detail, create, update, archive, approve, reject, and activity log list paths. Activity log writes require an existing transaction and are called from scoped mutations that already run inside `withWorkspaceDb`.

The repositories continue to receive `workspaceId` explicitly and continue to filter by `workspaceId` in Drizzle queries.

## Tests

No new DB-level tests were added. The current test setup exercises mocked repository and API flows; it does not provide an existing PostgreSQL RLS integration harness, and this issue should not introduce a new DB test framework.

Existing test commands to run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`

## Checks Run

- `pnpm test` passed: 10 test files, 94 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"` passed with `API_IMPORT_OK`.

## RLS Activation Confirmation Plan

After the migration is applied with `MIGRATION_DATABASE_URL`, validate as `syrantis_app`.

Direct reads without workspace context should return zero rows:

```sql
select count(*) from organizations;
select count(*) from contacts;
select count(*) from leads;
select count(*) from tasks;
select count(*) from approvals;
select count(*) from activity_logs;
```

Direct inserts without workspace context should fail due to `WITH CHECK`. Use a transaction and roll it back, substituting real non-secret IDs only where required by constraints:

```sql
begin;
insert into organizations (workspace_id, name)
values ('00000000-0000-0000-0000-000000000000', 'rls_check_should_fail');
rollback;
```

The expected result is a PostgreSQL row-level security violation.

API validation:

- login should still work because `users`, `workspaces`, and `sessions` are out of RLS scope
- task, organization, contact, lead, approval, and activity log API flows should still work because repository access uses `withWorkspaceDb`
- cross-workspace API access should remain invisible and return `404`

## Rollback SQL

```sql
DROP POLICY IF EXISTS "tenant_isolation_organizations" ON "organizations";
ALTER TABLE "organizations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_contacts" ON "contacts";
ALTER TABLE "contacts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "contacts" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_leads" ON "leads";
ALTER TABLE "leads" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "leads" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_tasks" ON "tasks";
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_approvals" ON "approvals";
ALTER TABLE "approvals" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "approvals" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_activity_logs" ON "activity_logs";
ALTER TABLE "activity_logs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" DISABLE ROW LEVEL SECURITY;
```

## Risks And Non-Goals

Risks:

- Any future direct access to scoped tables outside `withWorkspaceDb` will see zero rows or fail RLS checks.
- Manual production validation is required to prove role-level behavior under `syrantis_app`.

Non-goals:

- no auth changes
- no `tenantGuard` changes
- no session behavior changes
- no changes to `withWorkspaceDb`
- no out-of-scope RLS tables
- no deletes or business feature additions
- no UI, webhook, AI, drafts, jobs, Resend, or product domain work

## Out-Of-Scope Confirmation

The migration only names:

- `organizations`
- `contacts`
- `leads`
- `tasks`
- `approvals`
- `activity_logs`

It does not create RLS policies for `users`, `workspaces`, `sessions`, `drafts`, `templates`, `opportunities`, `email_sends`, `email_events`, `ai_runs`, `notes`, `jobs`, or `webhooks`.
