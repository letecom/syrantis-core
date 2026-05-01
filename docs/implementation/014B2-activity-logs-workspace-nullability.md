# Issue 014B2 Implementation: Activity Logs Workspace Nullability Hardening

## Files Changed

- `packages/db/src/schema.ts`
- `packages/db/migrations/0003_activity_logs_workspace_not_null.sql`
- `apps/api/src/repositories/activity-logs.ts`
- `apps/api/src/tests/activity-logs.test.ts`
- `docs/specs/014B2-activity-logs-workspace-nullability.md`
- `docs/implementation/014B2-activity-logs-workspace-nullability.md`

## Migration Name

- `0003_activity_logs_workspace_not_null.sql`

## Migration Summary

The migration first checks for existing null workspace activity log rows:

```sql
SELECT 1
FROM activity_logs
WHERE workspace_id IS NULL
```

If any row exists, it raises an exception and stops.

Then it applies:

```sql
ALTER TABLE activity_logs ALTER COLUMN workspace_id SET NOT NULL;
```

No backfill, delete, RLS activation, or policy creation is included.

## Schema Changes

`activityLogs.workspaceId` in `packages/db/src/schema.ts` now uses:

- `.notNull()`
- existing reference to `workspaces.id`

This aligns Drizzle types with the tenant-scoped audit table decision.

## Application Hardening

`createActivityLog(tx, input)` now enforces the backend invariant before insert:

- missing workspace ID fails
- null workspace ID fails when types are bypassed
- empty workspace ID fails

The helper throws an internal error and does not attempt an insert when the invariant fails.

Valid callers preserve existing behavior.

## Tests Added

`apps/api/src/tests/activity-logs.test.ts` now covers:

- `createActivityLog` rejects empty `workspaceId` before insert.
- `createActivityLog` rejects null `workspaceId` before insert when TypeScript is bypassed in the test.

Existing activity log route tests remain unchanged and pass.

The full test suite also covers existing task, approval, organization, contact, and lead mutation behavior.

## Checks Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`

## Risks And Non-Goals

Risks:

- Any non-production environment with null `activity_logs.workspace_id` rows will fail the migration and require explicit cleanup.
- System-wide logs still need a separate future table/design if they are ever required.

Non-goals:

- No RLS activation
- No RLS policies
- No special `NULL` workspace policy
- No platform/system logs table
- No broad automatic backfill
- No data deletion

## Production Preflight Confirmation

Production preflight was manually run before implementation:

```sql
SELECT count(*) FROM activity_logs WHERE workspace_id IS NULL;
```

Result:

```text
0
```

No production backfill is needed.

## Forbidden Scope Confirmation

Not touched:

- RLS activation
- Auth
- `tenantGuard`
- `withWorkspaceDb`
- Resend
- Jobs
- AI
- Drafts
- Webhooks
- UI

No secrets were read or added.

## Rollback Notes

Rollback SQL:

```sql
ALTER TABLE activity_logs ALTER COLUMN workspace_id DROP NOT NULL;
```

No rollback migration was added because this repository uses forward SQL migration files.
