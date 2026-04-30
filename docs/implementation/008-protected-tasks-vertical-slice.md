# Issue 008: Protected Tasks Vertical Slice Implementation

## Files Changed

- `AGENTS.md`
- `DECISIONS.md`
- `packages/shared/src/contracts/tasks.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/tasks.ts`
- `apps/api/src/services/tasks.ts`
- `apps/api/src/routes/tasks.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/mocks/tasks.ts`
- `apps/api/src/tests/tasks.test.ts`
- `docs/specs/008-protected-tasks-vertical-slice.md`
- `docs/implementation/008-protected-tasks-vertical-slice.md`

## Contracts Added

- `TaskTypeSchema`
- `TaskStatusSchema`
- `CreateTaskInputSchema`
- `UpdateTaskInputSchema`
- `TaskOutputSchema`
- `TaskListQuerySchema`
- `TaskSuccessSchema`
- `TaskListSuccessSchema`

Task type and status enums match the existing `packages/db/src/schema.ts` task check constraints.

Client input schemas do not accept `workspaceId`.

## Routes Added

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`

All task routes are protected by route-level `tenantGuard`.

There is no `DELETE` route.

## Repository and Service Behavior

- Repositories do not import Hono `Context`.
- Every repository function receives `workspaceId` explicitly.
- List queries filter by `workspaceId`.
- Detail reads and updates filter by both `id` and `workspaceId`.
- Create uses trusted `workspaceId` from the service argument, never client input.
- Repository code uses Drizzle query builder only.
- Service maps DB `dueAt`, `createdAt`, and `updatedAt` dates to ISO strings.
- Service maps `metadataJson` to `metadata`.
- Missing and cross-workspace tasks return `null` from service methods and `404 TASK_NOT_FOUND` from routes.

## Tests Added

- `GET /api/tasks` without session returns `401`.
- `POST /api/tasks` creates a task for the current workspace.
- `POST /api/tasks` rejects `workspaceId` in body.
- `GET /api/tasks` lists only current workspace tasks.
- `GET /api/tasks/:id` returns a current workspace task.
- `GET /api/tasks/:id` for another workspace returns `404`.
- `PATCH /api/tasks/:id` updates a current workspace task.
- `PATCH /api/tasks/:id` for another workspace returns `404`.
- `PATCH /api/tasks/:id` with empty body returns `400`.
- `PATCH /api/tasks/:id` with `status: "cancelled"` works.

Tests use fake auth and fake task services only. They do not use `DATABASE_URL` or a real DB.

## Commands Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git status --short`
- `git status --short apps/web ops/docker packages/db apps/api/src/middleware/tenant.ts apps/api/src/routes/auth.ts .env .env.local .env.production Caddyfile Dockerfile`
- `rg --files apps/api/src/routes apps/api/src/repositories apps/api/src/services`
- `rg "DATABASE_URL|createDbClient|getGlobalDbClient|@syrantis/db" apps/api/src/tests apps/api/src/tests/mocks`
- `rg "\bsql\b|raw\(|execute\(|db\.delete|\.delete\(|routes\.delete|taskRoutes\.delete|createTaskRoutes\(.*delete" apps/api/src/routes/tasks.ts apps/api/src/services/tasks.ts apps/api/src/repositories/tasks.ts`
- `rg "workspaceId|where\(|and\(|eq\(" apps/api/src/repositories/tasks.ts`

## Checks Result

- `pnpm test`: passed, 5 test files and 24 tests.
- `pnpm typecheck`: passed across workspace packages.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Built API import without `DATABASE_URL`: passed with `API_IMPORT_OK`.
- Existing auth, health, tenant, and import-safety tests still pass.

## Forbidden Scope Audit

- No `apps/web/*` source changes.
- No `ops/docker/*` changes.
- No `packages/db/*` changes.
- No `apps/api/src/middleware/tenant.ts` changes.
- No `apps/api/src/routes/auth.ts` changes.
- No `.env*` files changed or created.
- No `Caddyfile` or `Dockerfile` changes.
- No non-task business route files were created.
- No task `DELETE` route exists.
- No raw SQL, direct execute call, or `db.delete` exists in task routes, services, or repositories.
- Task tests use fake auth and fake task services only.
- Existing `DATABASE_URL` references in tests are import-safety tests that explicitly unset it.
- Repository functions include `workspaceId` in input types.
- Repository list filters by `workspaceId`.
- Repository detail read and update filters include `workspaceId` and `id`.

## Deviations

- None from the requested scope.
- Command execution used approved non-sandbox execution because the local sandbox failed before command startup with a `bwrap` loopback error.

## Risks Remaining

- `assignedTo` is represented through task metadata because the current DB task table does not have a dedicated assigned-user column.
- Future RLS is still required as a database-level safety layer.
- No authorization roles, approvals workflow, activity logs, jobs, email, or UI behavior is included.

## Post-Merge Validation Commands

```sh
cd /opt/syrantis/repos/syrantis-core
curl -i http://127.0.0.1:8787/api/tasks
curl -i -X POST http://127.0.0.1:8787/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"<email>","password":"<password>"}'
curl -i http://127.0.0.1:8787/api/tasks --cookie 'syrantis_session=<token>'
curl -i -X POST http://127.0.0.1:8787/api/tasks \
  --cookie 'syrantis_session=<token>' \
  -H 'content-type: application/json' \
  --data '{"type":"followup","title":"Validation task"}'
curl -i http://127.0.0.1:8787/api/tasks/<task_id> --cookie 'syrantis_session=<token>'
curl -i -X PATCH http://127.0.0.1:8787/api/tasks/<task_id> \
  --cookie 'syrantis_session=<token>' \
  -H 'content-type: application/json' \
  --data '{"status":"cancelled"}'
```
