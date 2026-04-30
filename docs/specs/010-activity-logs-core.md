# Issue 010: Activity Logs Core Minimal

## Objective

Add a minimal tenant-scoped business activity log system for task mutations, with a protected read route.

Task creation and update must write activity logs in the same database transaction as the task mutation. If the log write fails, the task mutation rolls back.

## Business Value

Activity logs provide a first operational timeline for the protected business slice. They make task mutations auditable without adding approvals, drafts, email, jobs, UI, or broad workflow scope.

## Scope

- Add shared activity log contracts.
- Add an activity log repository.
- Add an activity log service for tenant-scoped reads.
- Add `GET /api/activity-logs`.
- Write `task.created` when a task is created.
- Write `task.updated` when a task is updated.
- Mount activity log routes under `/api/activity-logs`.
- Add route tests with fake auth and fake activity log service.

## Non-Scope

- No schema change.
- No migration.
- No RLS.
- No UI.
- No approvals.
- No drafts.
- No email.
- No jobs.
- No auth logs.
- No export.
- No dashboard.
- No full before/after diffs.

## Contracts

`ActivityLogActionSchema`:

- `task.created`
- `task.updated`

`ActivityLogEntityTypeSchema`:

- `task`

`ActivityLogQuerySchema` supports:

- `entityType`
- `entityId`
- `action`
- `limit`, default `50`, max `100`
- `offset`, default `0`

`ActivityLogOutputSchema` exposes:

- `id`
- `workspaceId`
- `actorUserId`
- `action`
- `entityType`
- `entityId`
- `metadata`
- `createdAt`

## Transaction Rule

Activity log writes are not fire-and-forget and not best-effort.

`createActivityLog(tx, input)` requires an existing transaction as its first argument. Task repository mutations call it inside the same `withWorkspaceDb(...)` callback after the task row is returned.

If inserting the activity log fails, the surrounding task transaction fails and the task mutation rolls back.

## Tenant Isolation

- `workspaceId` is never accepted from the client.
- Routes get `workspaceId` only from `tenantGuard` context.
- Repositories receive `workspaceId` explicitly.
- Activity log reads always filter by `workspaceId`.
- The read route rejects client-provided `workspaceId`.

## Metadata Rules

This issue stores only minimal task metadata:

- `task.created`: `taskType`, `status`
- `task.updated`: `status`

No passwords, session material, cookies, credentials, or full before/after diffs are stored.

## Routes

`GET /api/activity-logs`

Protected by `tenantGuard`.

Returns:

```json
{ "success": true, "data": [] }
```

Invalid query input returns:

```json
{ "success": false, "error": "Invalid request.", "code": "INVALID_REQUEST" }
```

No create, update, or delete routes exist for logs.

## Acceptance Criteria

- Activity log contracts are exported.
- `GET /api/activity-logs` is protected by `tenantGuard`.
- Task creation writes `task.created` in the same transaction.
- Task update writes `task.updated` in the same transaction.
- Activity log reads are tenant-scoped.
- Existing task API shape is unchanged.
- Existing task tests still pass.
- No schema or migration change.
- No secrets are stored in log metadata.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and import safety pass.

## Manual Production Validation

1. Login with founder.
2. Create a task.
3. PATCH the task.
4. `GET /api/activity-logs?entityType=task&entityId=<task_id>`.
5. Verify two logs:
   - `task.created`
   - `task.updated`
6. Verify `actorUserId` equals founder user ID.
7. Verify `workspaceId` equals founder workspace ID.
