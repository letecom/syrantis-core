# Issue 014B2: Activity Logs Workspace Nullability Hardening

## Objective

Make `activity_logs.workspace_id` mandatory at the database schema level, Drizzle schema level, and application helper level.

This removes the remaining 014A RLS readiness blocker for `activity_logs`.

## Context

014A identified two RLS readiness blockers:

- Task relationship IDs were not same-workspace validated.
- `activity_logs.workspace_id` was nullable.

014B1 fixed the task relationship ownership blocker. This issue fixes only activity log workspace nullability.

## Architectural Decision

`activity_logs` is a tenant-scoped business audit table.

All business activity logs must have a `workspaceId`.

System-wide or platform logs are out of scope and must not be stored as `NULL` workspace activity logs.

## Scope

- Update Drizzle schema so `activityLogs.workspaceId` is `.notNull()` and still references `workspaces`.
- Add a defensive SQL migration that fails fast if null workspace rows exist.
- Add application-level runtime enforcement in `createActivityLog(tx, input)`.
- Add tests for missing and null workspace IDs.
- Document the migration and rollback strategy.

## Anti-Scope

- No RLS activation
- No RLS policies
- No special null-workspace policy
- No `platform_logs` or `system_logs`
- No data deletion
- No broad automatic backfill from entity references
- No auth changes
- No `tenantGuard` changes
- No `withWorkspaceDb` changes
- No Resend, jobs, AI, drafts, webhooks, UI, agents, or background workers
- No secrets access
- No deployment

## Production Preflight Result

Production preflight was run manually before implementation:

```sql
SELECT count(*) FROM activity_logs WHERE workspace_id IS NULL;
```

Result:

```text
0
```

No production backfill is needed.

## Migration Strategy

Migration name:

- `0003_activity_logs_workspace_not_null.sql`

The migration must:

- Check for existing `activity_logs` rows where `workspace_id IS NULL`.
- Raise an exception if any null rows exist.
- Set `activity_logs.workspace_id` to `NOT NULL`.

It must not:

- Backfill ambiguous rows.
- Delete rows.
- Enable RLS.
- Create policies.

## Fail-Fast Behavior

If any environment contains null `activity_logs.workspace_id` rows, the migration fails before changing column nullability.

This forces an explicit human decision instead of silently assigning audit rows to an inferred workspace.

Application runtime behavior:

- `createActivityLog(tx, input)` throws an internal error if `workspaceId` is missing, null, or empty.
- No activity log insert is attempted when the invariant fails.

## Rollback Strategy

If rollback is required after the migration:

```sql
ALTER TABLE activity_logs ALTER COLUMN workspace_id DROP NOT NULL;
```

No explicit down migration is added because the repository currently uses forward SQL migration files.

## Acceptance Criteria

- Drizzle schema marks `activityLogs.workspaceId` as not nullable.
- Migration defensively fails when null workspace rows exist.
- Migration sets `activity_logs.workspace_id` to `NOT NULL`.
- `createActivityLog` rejects missing, null, or empty workspace IDs before insert.
- Existing activity log API tests pass.
- Task, approval, organization, contact, and lead mutation tests continue to pass.
- No RLS behavior is introduced.
- No forbidden scope is touched.
