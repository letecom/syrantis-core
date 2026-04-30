# Issue 007: Tenant Guard Hardening

## Objective

Implement the official `tenantGuard` middleware and Hono context pattern for Syrantis Core protected API routes.

The guard must require a valid `syrantis_session` cookie, resolve the current authenticated user through `AuthService.getCurrentUser(token)`, and inject the active workspace context before any business route handlers run.

## Business Value

Tenant isolation is a boundary requirement before adding Lead Response, Devis Relance, or any client data routes. This issue gives future protected routers a small explicit pattern for user and workspace context without introducing SaaS platform scope, roles, permissions, or business features.

## Scope

- Replace the placeholder tenant middleware with `createTenantGuard(authService?)`.
- Export `tenantGuard = createTenantGuard()` for production route mounting.
- Add Hono app variable types for `currentUser`, `userId`, and `workspaceId`.
- Add tenant helper functions for guarded handlers.
- Add a protected `/auth/session-check` diagnostic endpoint.
- Add shared dependency-light API error helpers.
- Add tenant tests using only a fake `AuthService`.
- Add Issue 007 spec and implementation docs.

## Non-Scope

- No business routes.
- No global `app.use("/api/*")` guard.
- No DB-backed tests.
- No RLS.
- No permissions or roles beyond current user/workspace context.
- No auth/session storage changes.
- No web app changes.
- No runtime Docker, production, Caddy, or `.env` changes.

## Auth vs Tenant Guard Distinction

Auth/session establishes who the current user is and owns login, logout, cookie creation, and `/auth/me` compatibility.

`tenantGuard` is the protected-route boundary. It requires the existing session cookie, asks the injected or production `AuthService` for the current user, rejects missing or invalid sessions, and sets the workspace context that downstream handlers must use.

The guard must not duplicate raw session SQL. It delegates session validity to `AuthService.getCurrentUser(token)`.

## Route Protection Pattern

Public routes remain public unless a protected router explicitly mounts `tenantGuard`.

Future protected routes should use a pattern like:

```ts
const protectedRoutes = new Hono<AppEnv>();
protectedRoutes.use("*", tenantGuard);
protectedRoutes.get("/example", (c) => {
  const workspaceId = requireWorkspaceId(c);
  return c.json({ success: true, data: { workspaceId } });
});
```

`/health` and `/api/health` must remain public. This issue does not add a global API guard because `/api/health` already exists and is intentionally public.

## Hono Context Pattern

`apps/api/src/types/hono.ts` defines:

- `currentUser: AuthMe`
- `userId: string`
- `workspaceId: string`

Guarded handlers may read these through `c.get(...)` or helper functions in `apps/api/src/lib/tenant.ts`.

Helpers throw clear internal errors if used before `tenantGuard`, so missing route protection fails loudly during development and tests.

## Testing Approach

- Tests inject a fake `AuthService`.
- Tests do not require `DATABASE_URL`.
- Tests do not connect to PostgreSQL.
- Tests cover missing cookie, invalid cookie with cookie clearing, valid context injection, and `/auth/session-check`.
- Existing auth, health, and import-safety tests must keep passing.

## Allowed Files

- `apps/api/src/types/hono.ts`
- `apps/api/src/lib/tenant.ts`
- `apps/api/src/middleware/tenant.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/tests/tenant.test.ts`
- `apps/api/src/tests/mocks/auth.ts`
- `packages/shared/src/contracts/errors.ts`
- `packages/shared/src/contracts/index.ts`
- `packages/shared/src/index.ts` if needed
- Issue 007 docs

## Forbidden Files

- `apps/web/*`
- `ops/docker/*`
- `packages/db/src/schema.ts`
- `packages/db/migrations/*`
- `packages/db/src/client.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/health.ts`
- `apps/api/src/index.ts` unless absolutely required
- `.env*`
- `Caddyfile`
- `Dockerfile`
- Business route files for leads, tasks, opportunities, organizations, contacts, drafts, or approvals

## Acceptance Criteria

- `createTenantGuard(authService?)` exists and can use injected fake auth services.
- `tenantGuard = createTenantGuard()` exists for production route mounting.
- Missing cookie returns `401` with `{ success:false, error:"Unauthorized.", code:"NO_SESSION" }`.
- Invalid or expired cookie clears `syrantis_session` and returns `401` with code `INVALID_SESSION`.
- Valid cookie sets `currentUser`, `userId`, and `workspaceId`.
- `/auth/session-check` returns `{ success:true, data:{ userId, workspaceId } }` when guarded.
- `/health` and `/api/health` remain public.
- API import remains safe without `DATABASE_URL`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and import-safety command pass.
- Forbidden scope audit passes.

## Post-Merge Prod Validation Commands

Run only after human review and merge, from the production repo/runtime environment:

```sh
cd /opt/syrantis/repos/syrantis-core
curl -i http://127.0.0.1:8787/auth/session-check
curl -i -X POST http://127.0.0.1:8787/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"<email>","password":"<password>"}'
curl -i http://127.0.0.1:8787/auth/session-check --cookie 'syrantis_session=<token>'
curl -i -X POST http://127.0.0.1:8787/auth/logout --cookie 'syrantis_session=<token>'
```
