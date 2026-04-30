# Issue 010: Activity Logs Core Minimal Implementation

## Files Changed

- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/activity-logs.ts`
- `apps/api/src/services/activity-logs.ts`
- `apps/api/src/routes/activity-logs.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/repositories/tasks.ts`
- `apps/api/src/services/tasks.ts`
- `apps/api/src/routes/tasks.ts`
- `apps/api/src/tests/mocks/tasks.ts`
- `apps/api/src/tests/activity-logs.test.ts`
- `docs/specs/010-activity-logs-core.md`
- `docs/implementation/010-activity-logs-core.md`

## Behavior Added

- `GET /api/activity-logs` is protected by `tenantGuard`.
- Activity log reads filter by current workspace.
- Query filters support `entityType`, `entityId`, `action`, `limit`, and `offset`.
- Task creation writes `task.created` inside the same transaction as the task insert.
- Task update writes `task.updated` inside the same transaction as the task update.
- If activity log insertion fails, the task transaction fails.

## Activity Log Metadata

- `task.created`: `taskType`, `status`
- `task.updated`: `status`

No before/after diff is stored.

## Commands Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git status --short`
- `git --no-pager diff --name-only`
- `grep -R "db.insert(activityLogs)" apps/api/src || true`
- `grep -R "getGlobalDbClient" apps/api/src/repositories/activity-logs.ts apps/api/src/services/activity-logs.ts || true`
- `grep -R "password\\|token\\|cookie\\|secret" apps/api/src/repositories/activity-logs.ts apps/api/src/services/activity-logs.ts apps/api/src/routes/activity-logs.ts || true`
- `git status --short | grep -E 'packages/db/src/schema.ts|packages/db/migrations|apps/api/src/middleware/tenant.ts|apps/api/src/routes/auth.ts|ops/docker|apps/web|(^|/)\\.env|Caddyfile|Dockerfile' || true`

## Checks Result

- `pnpm test`: passed, 6 test files and 28 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Import safety without `DATABASE_URL`: passed with `API_IMPORT_OK`.

## Audits Result

- `git status --short`: only Issue 010 scoped files changed.
- `git --no-pager diff --name-only`: showed modified tracked Issue 010 files; untracked new files are visible in `git status --short`.
- `db.insert(activityLogs)` audit: no output.
- `getGlobalDbClient` audit in activity log repository/service: no output.
- Sensitive-term audit in activity log repository/service/route: no output.
- Forbidden-scope audit: no output.
- Additional RLS audit: no output.
- Additional activity-log delete audit: no output.

## Known Deviations

- No repository-level transaction mock test was added. The implementation keeps the guarantee structurally by requiring `createActivityLog(tx, input)` and calling it inside the existing `withWorkspaceDb` mutation callbacks.

## Risks Remaining

- Activity log action/entity enums are intentionally minimal.
- Activity log metadata is intentionally sparse.
- Future business resources will need their own scoped log actions.
- There is no RLS in this issue.

## Manual Production Validation

1. Login with founder.
2. Create a task.
3. PATCH the task.
4. Run:

```sh
curl -i "http://127.0.0.1:8787/api/activity-logs?entityType=task&entityId=<task_id>" \
  --cookie 'syrantis_session=<token>'
```

5. Verify two logs:
   - `task.created`
   - `task.updated`
6. Verify `actorUserId` equals founder user ID.
7. Verify `workspaceId` equals founder workspace ID.
