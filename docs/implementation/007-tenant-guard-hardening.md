# Issue 007: Tenant Guard Hardening Implementation

## Files Changed

- `apps/api/src/types/hono.ts`
- `apps/api/src/lib/tenant.ts`
- `apps/api/src/middleware/tenant.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/tests/tenant.test.ts`
- `apps/api/src/tests/mocks/auth.ts`
- `packages/shared/src/contracts/errors.ts`
- `packages/shared/src/contracts/index.ts`
- `docs/specs/007-tenant-guard-hardening.md`
- `docs/implementation/007-tenant-guard-hardening.md`

## Middleware Behavior

- `createTenantGuard(authService?)` reads the `syrantis_session` cookie.
- Missing cookie returns `401` with `NO_SESSION`.
- Invalid or expired cookie deletes `syrantis_session` and returns `401` with `INVALID_SESSION`.
- Valid cookie calls `AuthService.getCurrentUser(token)` and sets:
  - `currentUser`
  - `userId`
  - `workspaceId`
- `tenantGuard = createTenantGuard()` is exported for production protected routers.
- The guard does not call the database at import time.

## Helper Behavior

- `getCurrentUser(c)` returns the guarded `AuthMe`.
- `getWorkspaceId(c)` returns the guarded workspace ID.
- `requireWorkspaceId(c)` returns the guarded workspace ID.
- `tenantWhere(table, c)` returns a Drizzle `eq(table.workspaceId, workspaceId)` condition.
- Helpers throw clear internal errors if called without prior `tenantGuard`.

## Route Added

- `GET /auth/session-check`

The route is protected with `createTenantGuard(authService)` inside `createAuthRoutes({ authService })` so tests can inject a fake auth service. It returns:

```json
{ "success": true, "data": { "userId": "<userId>", "workspaceId": "<workspaceId>" } }
```

## Tests Added

- `tenantGuard` returns `401` without a cookie.
- `tenantGuard` returns `401` with an invalid cookie and clears the cookie.
- `tenantGuard` sets `currentUser`, `userId`, and `workspaceId` for a valid cookie.
- `/auth/session-check` returns `401` without a cookie.
- `/auth/session-check` returns `userId` and `workspaceId` with a valid cookie.
- Tests use only `apps/api/src/tests/mocks/auth.ts`.
- Tests do not require `DATABASE_URL` or a real DB.

## Commands Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git status --short`
- `git status --short apps/web ops/docker packages/db`
- `git status --short -- .env .env.local .env.production`
- `git status --short apps/api/src/index.ts Caddyfile Dockerfile`
- `rg "DATABASE_URL|createDbClient|getGlobalDbClient|@syrantis/db" apps/api/src/tests apps/api/src/middleware/tenant.ts apps/api/src/lib/tenant.ts`
- `rg --files apps/api/src`

## Checks Result

- `pnpm test`: passed, 4 test files and 14 tests.
- `pnpm typecheck`: passed across workspace packages.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Built API import without `DATABASE_URL`: passed with `API_IMPORT_OK`.
- Import-safety tests still pass without `DATABASE_URL`.

## Forbidden Scope Audit

- No `apps/web/*` source changes.
- No `ops/docker/*` changes.
- No `packages/db/*` changes.
- No `.env*` files changed or created.
- No `apps/api/src/index.ts`, `Caddyfile`, or `Dockerfile` changes.
- No business route files created for leads, tasks, opportunities, organizations, contacts, drafts, or approvals.
- Tenant tests use a fake `AuthService` and do not import `@syrantis/db`, `createDbClient`, or `getGlobalDbClient`.
- Existing test references to `DATABASE_URL` are import-safety tests that explicitly unset it.

## Deviations

- None from the requested implementation scope.
- Command execution used approved non-sandbox execution because the local sandbox failed to start commands with a `bwrap` loopback error before any repository command could run.

## Risks Remaining

- Future protected routers must explicitly mount `tenantGuard`; there is intentionally no global `/api/*` guard in this issue.
- `/auth/me` remains on its existing compatibility path and still uses the auth service directly.
- No rate limiting, role authorization, permissions model, or RLS is added.

## Post-Merge Validation Commands

```sh
cd /opt/syrantis/repos/syrantis-core
curl -i http://127.0.0.1:8787/auth/session-check
curl -i -X POST http://127.0.0.1:8787/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"<email>","password":"<password>"}'
curl -i http://127.0.0.1:8787/auth/session-check --cookie 'syrantis_session=<token>'
curl -i -X POST http://127.0.0.1:8787/auth/logout --cookie 'syrantis_session=<token>'
```
