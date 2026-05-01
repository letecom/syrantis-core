# Issue 014A Implementation: RLS Readiness Audit

## Executive Summary

014A remained documentation-only. No RLS was enabled, no migration was created, no schema file was modified, and no runtime code was changed.

The current business repositories are closer to RLS-ready than expected: all audited business read paths run through repositories that call `withWorkspaceDb`, so future policies based on `current_setting('app.current_workspace_id', true)` should have the setting available for reads as well as mutations.

014B should not start yet. Two material issues should be resolved or explicitly accepted first:

- `activity_logs.workspace_id` is nullable even though `activity_logs` is listed as a business table for tenant-scoped RLS.
- `tasks` accepts relationship IDs without same-workspace ownership checks for `organizationId`, `contactId`, `leadId`, and `opportunityId`.

## Readiness Matrix

| Table | workspace_id | NOT NULL | Workspace index | Reads set workspace setting | Mutations set workspace setting | Client workspaceId rejected | Cross-workspace 404 | No business delete | No business raw SQL | Transactional logs | Relationship safety | RLS readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tasks` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Gap | Not ready |
| `activity_logs` | Yes | No | Yes | Yes | Insert uses caller tx | Yes | Query scoped | Yes | Yes | N/A | N/A | Not ready |
| `approvals` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Mostly ready | Ready with caveat |
| `organizations` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | N/A | Ready |
| `contacts` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Workspace-safe; archive caveat | Ready with caveat |
| `leads` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Workspace-safe | Ready |

## Findings By Severity

### Blocker

`activity_logs.workspace_id` is nullable.

Evidence:

- `packages/db/src/schema.ts` defines `activityLogs.workspaceId` as `uuid("workspace_id").references(...)` without `.notNull()`.
- `activity_logs_workspace_id_idx` exists.
- Business log writes pass a workspace id through `createActivityLog(tx, ...)`, but the database does not enforce tenant ownership.

Impact:

- A strict RLS policy using `workspace_id = current_setting(...)::uuid` would make null-workspace rows invisible.
- Allowing `workspace_id IS NULL` in policy would create a special global row class that is not defined by the current business model.

Recommendation before 014B:

- Decide whether null workspace activity logs are allowed.
- If not allowed, add a migration before 014B to backfill or reject nulls and make `activity_logs.workspace_id` `NOT NULL`.

### High

`tasks` relationship ownership is incomplete.

Evidence:

- `createTask` accepts `opportunityId`, `leadId`, and `contactId` and writes them directly.
- `tasks` schema also has `organizationId`.
- Current task repository filters task rows by `workspaceId`, but it does not verify that supplied relationship IDs belong to the same workspace.

Impact:

- RLS on `tasks` protects the task row itself, but a current-workspace task could contain a cross-workspace foreign key value.
- API responses may expose a foreign UUID from another workspace if such a row is created.
- Future joins under RLS may silently hide the referenced row, producing confusing partial data.

Recommendation before 014B:

- Add same-workspace relationship checks for task relationship IDs, or explicitly remove unsupported relationship inputs until their owning slices exist.

### Medium

`contacts.organizationId` checks workspace ownership but does not check archived organization invisibility.

Evidence:

- Contacts repository validates `organizationId` by `organizations.id` and `organizations.workspaceId`.
- Organizations 012B makes archived organizations invisible for organization list/detail/update.
- Leads repository already rejects archived organizations via `ne(organizations.status, "archived")`.

Impact:

- This is not an RLS isolation failure, because the organization must still be in the same workspace.
- It is a consistency issue with archived organization behavior.

Recommendation:

- Decide whether contacts may remain attached to archived organizations.
- If new links to archived organizations should be forbidden, align contacts with leads.

### Low

Observation-only tables are not ready for 014B by default.

Evidence:

- `workspaces` has no `workspace_id`, because it is the tenant root.
- `users` and `sessions` are auth/session tables and are queried outside `withWorkspaceDb`.
- `templates`, `drafts`, and `opportunities` have `workspace_id`, indexes, and schema shape, but no approved API slices in the current 014A scope.

Impact:

- Including these tables in 014B would expand the blast radius beyond validated business APIs.

Recommendation:

- Exclude them from 014B unless a dedicated issue adds route/repository coverage and tests.

## Raw SQL / Delete / Bypass Audit

Commands run:

- `rg -n "ENABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY|CREATE POLICY|ALTER POLICY" packages apps docs -g '!**/dist/**'`
- `rg -n "\.delete\(" apps packages docs -g '!**/dist/**'`
- `rg -n -F 'sql\`' apps/api/src packages/db/src docs -g '!**/dist/**'`

Results:

- No RLS activation found in runtime or schema code. Existing docs mention previous RLS audit commands only.
- `.delete(` appears only in `apps/api/src/services/auth.ts` for `sessions`, which is not business data deletion.
- `sql\`` appears in Drizzle schema checks/defaults and in `apps/api/src/lib/db.ts` for `set_config('app.current_workspace_id', ...)`.
- No raw SQL was found in business routes, services, or repositories.

## Repository Coverage

Commands run:

- `rg -n "withWorkspaceDb" apps/api/src/repositories apps/api/src/services`
- `rg -n "createActivityLog\(tx" apps/api/src/repositories`

Observed business repositories:

- `tasks`: list, detail, create, update all call `withWorkspaceDb`.
- `activity_logs`: list calls `withWorkspaceDb`; inserts use the mutation transaction passed by callers.
- `approvals`: list, detail, create, approve, reject all call `withWorkspaceDb`.
- `organizations`: list, detail, create, update, archive all call `withWorkspaceDb`.
- `contacts`: list, detail, create, update all call `withWorkspaceDb`.
- `leads`: list, detail, create, update all call `withWorkspaceDb`.

Transactional activity log calls:

- `tasks`: `task.created`, `task.updated`
- `approvals`: `approval.created`, `approval.approved`, `approval.rejected`
- `organizations`: `organization.created`, `organization.updated`, `organization.archived`
- `contacts`: `contact.created`, `contact.updated`
- `leads`: `lead.created`, `lead.updated`

## Route Coverage

Command run:

- `rg -n "workspaceId" apps/api/src/routes/tasks.ts apps/api/src/routes/activity-logs.ts apps/api/src/routes/approvals.ts apps/api/src/routes/organizations.ts apps/api/src/routes/contacts.ts apps/api/src/routes/leads.ts`

Observed:

- All audited business route files include a `hasClientWorkspaceId` guard.
- Business routes use `getWorkspaceId(c)` from trusted tenant context.
- Existing tests cover unauthorized and cross-workspace behavior for tasks, approvals, organizations, contacts, and leads.

## Relationship Ownership Coverage

`tasks`:

- Row access is workspace-scoped.
- Relationship IDs are not fully same-workspace validated.
- Not ready for 014B without remediation or explicit risk acceptance.

`approvals`:

- `createApproval` validates `taskId` against the same workspace.
- Approval approve/reject operations filter approval by `id + workspaceId`.
- Generic `entityType/entityId` remains narrow in current implementation because creates are task-backed.

`organizations`:

- No parent relationship.
- Archived organizations are hidden by default in read/update paths.

`contacts`:

- `organizationId` is validated against the same workspace.
- Archived organization linking remains a product consistency caveat.

`leads`:

- `organizationId` is validated against same workspace and non-archived organization.
- `contactId` is validated against same workspace.

`activity_logs`:

- Entity references are audit metadata, not enforced relationship ownership.
- Tenant isolation depends on `workspace_id`, which is currently nullable.

## Tables Explicitly Excluded From 014B

Exclude unless a future issue scopes them explicitly:

- `workspaces`
- `users`
- `sessions`
- `templates`
- `drafts`
- `opportunities`

Reasons:

- `workspaces` is the tenant root and cannot use the same tenant-row policy shape.
- `users` and `sessions` are auth/session tables with access patterns outside `withWorkspaceDb`.
- `templates`, `drafts`, and `opportunities` are not currently validated business API slices in this scope.

## Proposed 014B Scope

014B should be limited to tables that meet readiness criteria after blockers are addressed:

- `organizations`
- `contacts`, if archived-organization linking is accepted or fixed
- `leads`
- `approvals`
- `tasks`, after relationship ownership checks are fixed or accepted
- `activity_logs`, after nullability is fixed or a null-row policy is explicitly approved

014B should include:

- A migration that enables RLS only for approved tables.
- Explicit policies for `SELECT`, `INSERT`, `UPDATE`, and any approved status-transition behavior.
- No business behavior changes in the same PR.
- Smoke tests or documented validation against a PostgreSQL environment.

## Proposed 014B Policy Template

Candidate tenant policy:

```sql
CREATE POLICY <table>_tenant_isolation
ON <table>
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
```

Open decisions for 014B:

- Whether to use one policy per command or one combined policy.
- Whether to enable `FORCE ROW LEVEL SECURITY`.
- Whether service/admin maintenance paths need separate roles or policies.
- Whether `activity_logs` can ever contain `workspace_id IS NULL`.

## Rollback Notes For 014B

Recommended rollback order:

- Stop writes if production validation shows policy mismatch.
- Drop policies on affected tables.
- Disable RLS on affected tables.
- Keep schema/data changes separate from RLS activation when possible.
- Re-run API smoke tests for list/detail/create/update after rollback.

Preflight before 014B:

- Count rows with `workspace_id IS NULL` for every proposed table.
- Confirm no cross-workspace relationship rows exist in task relationships.
- Confirm application role behavior under RLS in staging.

## Commands Run

- `git status --short`
- `rg -n "ENABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY|CREATE POLICY|ALTER POLICY" packages apps docs -g '!**/dist/**'`
- `rg -n "\.delete\(" apps packages docs -g '!**/dist/**'`
- `rg -n -F 'sql\`' apps/api/src packages/db/src docs -g '!**/dist/**'`
- `rg -n "workspaceId" apps/api/src/routes/tasks.ts apps/api/src/routes/activity-logs.ts apps/api/src/routes/approvals.ts apps/api/src/routes/organizations.ts apps/api/src/routes/contacts.ts apps/api/src/routes/leads.ts`
- `rg -n "withWorkspaceDb" apps/api/src/repositories apps/api/src/services`
- `rg -n "tasks|activityLogs|activity_logs|approvals|organizations|contacts|leads|workspaces|users|sessions|templates|drafts|opportunities" apps/api/src/routes apps/api/src/repositories apps/api/src/services apps/api/src/tests -g '!**/dist/**'`
- `rg -n "createActivityLog\(tx" apps/api/src/repositories`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`

## Check Results

- `pnpm test`: passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed
- Import safety: `API_IMPORT_OK`

## Final Recommendation

Keep 014A separate from 014B.

Do not start 014B until the blockers are resolved or explicitly accepted:

- Decide and enforce the `activity_logs.workspace_id` nullability model.
- Fix or explicitly accept task relationship ownership gaps.

After those decisions, 014B can be a narrowly scoped migration issue for approved business tables only.
