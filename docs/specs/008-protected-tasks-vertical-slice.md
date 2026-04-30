# Issue 008: Protected Tasks Vertical Slice

## Objective

Implement the first protected business vertical slice for Syrantis Core: tenant-scoped tasks.

This proves that business routes mount `tenantGuard`, take `workspaceId` only from trusted server context, and access workspace-scoped data through explicit repository filters.

## Business Value

Tasks are the smallest useful business resource for the 90-day wedge. They let Syrantis represent follow-ups, calls, reviews, setup work, and future human approval touchpoints without building a broad CRM, approvals workflow, client dashboard, jobs system, or UI.

## Scope

- Add shared task contracts.
- Add a Drizzle task repository.
- Add a task service layer.
- Add protected task API routes under `/api/tasks`.
- Add route tests with fake auth and fake task services.
- Mount task routes in the API route index.
- Update governance and decisions for Issue 008.
- Add Issue 008 spec and implementation docs.

## Non-Scope

- No DB schema changes.
- No migrations.
- No real DB tests.
- No task `DELETE` route.
- No approvals logic.
- No activity logs.
- No email sending.
- No jobs.
- No UI.
- No RLS.
- No non-task business routes.

## Routes

All task routes are mounted under `/api/tasks` and protected by `tenantGuard`.

- `GET /api/tasks`
  - Query: `status`, `type`, `limit`
  - Returns `{ success: true, data: TaskOutput[] }`

- `POST /api/tasks`
  - Body: `CreateTaskInput`
  - Rejects client-provided `workspaceId`
  - Returns `201 { success: true, data: TaskOutput }`

- `GET /api/tasks/:id`
  - Validates `id` as UUID
  - Returns `404 TASK_NOT_FOUND` when missing or cross-workspace

- `PATCH /api/tasks/:id`
  - Validates `id` as UUID
  - Body: `UpdateTaskInput`
  - Rejects client-provided `workspaceId`
  - Requires at least one update field
  - Returns `404 TASK_NOT_FOUND` when missing or cross-workspace

There is intentionally no `DELETE` route. Cancellation uses `PATCH` with `status: "cancelled"`.

## Contracts

Task type values match the existing DB check constraint:

- `followup`
- `approval`
- `review`
- `call`
- `note`
- `setup`

Task status values match the existing DB check constraint:

- `pending`
- `in_progress`
- `done`
- `cancelled`

Client input never accepts `workspaceId`.

`CreateTaskInput` supports `type`, `title`, `description`, `dueDate`, `assignedTo`, `opportunityId`, `leadId`, `contactId`, and `metadata`.

`UpdateTaskInput` supports `title`, `description`, `status`, nullable `dueDate`, nullable `assignedTo`, and `metadata`, and must contain at least one field.

## Repository Pattern

Repository functions live in `apps/api/src/repositories/tasks.ts`.

They do not import Hono `Context`. Each function receives `workspaceId` explicitly:

- `listTasks({ workspaceId, status, type, limit })`
- `findTaskById({ workspaceId, id })`
- `createTask({ workspaceId, createdByUserId, data })`
- `updateTask({ workspaceId, id, data })`

List queries filter by `workspaceId`.

Detail reads and updates filter by both `id` and `workspaceId`.

Repositories use Drizzle query builder and do not use raw SQL or physical delete.

## Tenant Isolation Invariants

- `workspaceId` comes only from `tenantGuard` context.
- Client-provided `workspaceId` is rejected.
- Cross-workspace resources return `404`, not `403`.
- Routes must not reveal whether a task exists in another workspace.
- Services and repositories do not infer tenant identity from client input.
- Every business data route is protected before handler execution.

## Tests

Tests use fake `AuthService` and fake `TaskService` only.

They do not require `DATABASE_URL`, do not use PostgreSQL, and do not read production env.

Coverage:

- unauthenticated list returns `401`
- create uses current workspace
- create rejects `workspaceId`
- list returns current workspace tasks only
- get current workspace task
- get cross-workspace task returns `404`
- patch current workspace task
- patch cross-workspace task returns `404`
- patch empty body returns `400`
- patch cancellation through `status: "cancelled"`

## Allowed Files

- `packages/shared/src/contracts/tasks.ts`
- `packages/shared/src/contracts/index.ts`
- `packages/shared/src/index.ts` if needed
- `apps/api/src/repositories/tasks.ts`
- `apps/api/src/services/tasks.ts`
- `apps/api/src/routes/tasks.ts`
- `apps/api/src/tests/mocks/tasks.ts`
- `apps/api/src/tests/tasks.test.ts`
- `apps/api/src/routes/index.ts`
- `AGENTS.md`
- `DECISIONS.md`
- Issue 008 docs

## Forbidden Files

- `apps/web/*`
- `ops/docker/*`
- `packages/db/src/schema.ts`
- `packages/db/migrations/*`
- `packages/db/src/client.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/health.ts`
- `apps/api/src/middleware/tenant.ts`
- `apps/api/src/routes/auth.ts`
- `.env*`
- `Caddyfile`
- `Dockerfile`
- Non-task business routes: leads, opportunities, organizations, contacts, drafts, approvals, email, ai-runs

## Acceptance Criteria

- `/api/tasks` routes exist and are protected by `tenantGuard`.
- Shared task contracts use the exact DB task type/status values.
- Client input cannot provide `workspaceId`.
- List reads filter by `workspaceId`.
- Detail reads and updates filter by `id` and `workspaceId`.
- Cross-workspace access returns `404`.
- No task `DELETE` route exists.
- No raw SQL exists in task routes, services, or repositories.
- No DB tests are added.
- API import remains safe without `DATABASE_URL`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and built import safety pass.

## Post-Merge Prod Validation Commands

Run only after human review and merge from the production runtime:

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
