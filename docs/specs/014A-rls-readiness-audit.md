# Issue 014A: RLS Readiness Audit

## Objective

Create a non-invasive audit of whether current business tables are ready for future PostgreSQL Row Level Security activation.

This issue is documentation-only. It must not enable RLS, create policies, create migrations, modify schema, modify auth, modify tenant guard behavior, or change runtime code.

## Context

Syrantis Core is a TypeScript, Hono, Drizzle, PostgreSQL, Zod, pnpm monorepo.

The current application isolation model is API-first:

- Business routes are protected by `tenantGuard`.
- `workspaceId` is derived from trusted server context.
- Client-provided `workspaceId` in body or query is rejected.
- Cross-workspace access is treated as invisible and returns `404`.
- Business repositories receive `workspaceId` explicitly.
- Business reads filter on `workspaceId`.
- Business mutations use `withWorkspaceDb`, which sets `app.current_workspace_id`.
- Business mutations write transactional activity logs where applicable.

Future RLS is expected to rely on:

```sql
current_setting('app.current_workspace_id', true)
```

Current workspace transaction helper behavior:

```sql
set_config('app.current_workspace_id', workspaceId, true)
```

## In Scope

Audit these business tables:

- `tasks`
- `activity_logs`
- `approvals`
- `organizations`
- `contacts`
- `leads`

Audit these observation-only tables only for explicit exclusion and future sequencing:

- `workspaces`
- `users`
- `sessions`
- `templates`
- `drafts`
- `opportunities`

## Out of Scope

- Enabling RLS
- `CREATE POLICY`, `ALTER POLICY`, or `FORCE ROW LEVEL SECURITY`
- Migrations
- Drizzle schema edits
- Auth changes
- `tenantGuard` changes
- `withWorkspaceDb` changes
- Runtime code changes
- Webhooks
- AI, drafts, jobs, Resend, email automation
- UI
- Agents or background workers
- Reading or modifying secrets
- Deployment

## Tables Audited

Business tables:

- `tasks`
- `activity_logs`
- `approvals`
- `organizations`
- `contacts`
- `leads`

Observation-only tables excluded from 014B unless a later issue explicitly scopes them:

- `workspaces`
- `users`
- `sessions`
- `templates`
- `drafts`
- `opportunities`

## Readiness Criteria

A table is ready for a future 014B RLS activation only if:

- The table has `workspace_id`.
- `workspace_id` is expected to be `NOT NULL` for tenant-scoped rows.
- The table has an index on `workspace_id` or a useful composite index containing `workspace_id`.
- All API read paths are workspace-scoped.
- All read paths that would run under RLS are wrapped by `withWorkspaceDb` or an approved equivalent that sets `app.current_workspace_id`.
- All mutation paths use `withWorkspaceDb`.
- No route accepts `workspaceId` from body, query, URL params, headers, or client state.
- Cross-workspace detail and mutation attempts return `404`.
- No business path uses `.delete()`.
- No business route, service, or repository uses raw SQL bypasses.
- Transactional activity logs are written for business mutations where applicable.
- Relationship IDs accepted from clients are validated against the same workspace.

## Static Audit Checklist

For each table:

- Confirm `workspace_id` column exists.
- Confirm `workspace_id` nullability.
- Confirm workspace index coverage.
- Inspect repository list/detail reads.
- Inspect repository mutations.
- Inspect route-level `workspaceId` rejection.
- Inspect cross-workspace tests and behavior.
- Grep for `.delete(`.
- Grep for raw SQL via `sql\``.
- Grep for `withWorkspaceDb`.
- Grep for `createActivityLog(tx, ...)`.
- Grep for business table references in routes, repositories, services, and tests.
- Check whether future RLS would break reads because `app.current_workspace_id` is not set.

## Relationship Safety Checklist

Relationship IDs must be treated as untrusted client input.

For any accepted relationship ID:

- The referenced row must exist in the same workspace.
- Cross-workspace referenced rows must behave as not found.
- Archived resources must not be linkable where the current API treats them as invisible.
- Generic `entityType` and `entityId` references need an explicit ownership strategy before they are used beyond existing narrow flows.

Relationships currently relevant to audited business tables:

- `tasks.organization_id`
- `tasks.contact_id`
- `tasks.lead_id`
- `tasks.opportunity_id`
- `approvals.task_id`
- `contacts.organization_id`
- `leads.organization_id`
- `leads.contact_id`
- `activity_logs.entity_type`
- `activity_logs.entity_id`

## Future 014B Policy Considerations

014B should remain separate from this audit and should be small, reversible, and migration-backed.

Candidate policy shape for tenant-scoped business tables:

```sql
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
```

014B should decide explicitly whether system/global rows with `workspace_id IS NULL` are allowed for any table. No such allowance should be added implicitly.

014B should verify:

- App role behavior under RLS.
- Migration ordering.
- Rollback plan.
- Whether `FORCE ROW LEVEL SECURITY` is appropriate.
- Whether tests should exercise behavior with `DATABASE_URL` against a real PostgreSQL test database.

## Rollback Considerations For 014B

Any future RLS migration must be reversible:

- Drop policies first.
- Disable RLS only after policies are dropped or proven harmless.
- Avoid changing table data during RLS activation.
- Keep a preflight query list for tables with `workspace_id IS NULL`.
- Keep API smoke tests for list/detail/create/update before and after rollback.

## Acceptance Criteria

- The audit identifies RLS readiness for each in-scope business table.
- The audit calls out blockers before 014B.
- The audit identifies excluded tables.
- The audit summarizes static grep results.
- The audit confirms no RLS was enabled.
- The audit confirms no migration or schema change was made.
- The audit confirms no secrets were touched.
- The audit recommends that 014B should not start until blockers are resolved or explicitly accepted.
