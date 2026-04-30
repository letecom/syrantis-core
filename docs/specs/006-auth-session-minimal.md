# Issue 006: Auth Session Minimal

## Objective

Implement minimal cookie/session authentication for Syrantis Core with DB-backed login, logout, current user lookup, and founder bootstrap.

## Business Value

Auth/session unlocks protected API routes, founder access, and the later tenant guard. Without this foundation, future delivery workflows remain unsafe or impossible to operate.

## Scope

- Add shared auth contracts.
- Add bcrypt password helpers.
- Add random session token generation and SHA-256 token hashing.
- Add DB-backed auth service with dependency injection for tests.
- Add `/auth/login`, `/auth/me`, and `/auth/logout`.
- Add session middleware helper without changing tenant middleware.
- Add a founder creation CLI.
- Add a minimal sessions schema migration for token hashes.
- Add route tests that use a fake auth service and no live DB.

## Architecture Decisions

- Use `bcryptjs`.
- Do not use JWT, Redis, OAuth, magic links, password reset, or argon2.
- Store session token hashes in PostgreSQL, not raw session tokens.
- Keep API app import safe without `DATABASE_URL`.
- Do not harden tenant guard in this issue.

## Cookie Model

- Cookie name: `syrantis_session`.
- Token: random 32-byte hex string.
- Lifetime: 7 days.
- Flags:
  - `httpOnly: true`
  - `sameSite: Strict`
  - `secure: process.env.NODE_ENV === "production"`
  - `path: "/"`
  - `maxAge: 604800`

## Session Token Hash Model

- Raw token is returned only to the client cookie.
- DB stores SHA-256 hex token hash in `sessions.token_hash`.
- `sessions.token_hash` is unique and not nullable.
- Session lookup hashes the cookie token and checks non-expired active sessions.

## Founder CLI

- Script: `pnpm --filter @syrantis/api create-founder`.
- Make target: `make auth-create-founder`.
- Requires `DATABASE_URL`, `FOUNDER_EMAIL`, and `FOUNDER_PASSWORD` at runtime.
- Refuses to overwrite an existing user.
- Prints only safe IDs and never prints password or `DATABASE_URL`.

## Tests

- Auth tests use an injected fake auth service.
- Tests do not require `DATABASE_URL`.
- Tests do not connect to PostgreSQL.
- Tests cover invalid login, valid login cookie flags, unauthenticated `/auth/me`, authenticated `/auth/me`, logout cookie clearing, and app import safety.

## Allowed Files

- Shared auth contracts.
- API auth helpers, service, routes, middleware, CLI, and tests.
- Minimal session token hash schema migration.
- Makefile target for founder creation.
- Issue 006 docs.

## Forbidden Files

- `apps/api/src/middleware/tenant.ts`
- `ops/docker/*`
- `apps/web/*`
- DB client, migrate, or health runtime files
- `.env*`
- Caddyfile or Dockerfile

## Acceptance Criteria

- `/auth/login`, `/auth/me`, and `/auth/logout` exist.
- Passwords verify with bcryptjs.
- Sessions store SHA-256 token hashes.
- API import remains safe without `DATABASE_URL`.
- Auth tests pass without a live database.
- Drizzle migration is generated for minimal auth/session schema changes.
- No tenant guard hardening, UI auth, RLS, jobs, email, Redis, JWT, or OAuth is added.

## Post-Merge Manual Validation

Run against production only after the migration is reviewed and applied:

```sh
make db-migrate
read -r FOUNDER_EMAIL
read -rs FOUNDER_PASSWORD
export FOUNDER_EMAIL FOUNDER_PASSWORD
make auth-create-founder
unset FOUNDER_EMAIL FOUNDER_PASSWORD
curl -i -X POST http://127.0.0.1:8787/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"<email>","password":"<password>"}'
curl -i http://127.0.0.1:8787/auth/me --cookie 'syrantis_session=<token>'
curl -i -X POST http://127.0.0.1:8787/auth/logout --cookie 'syrantis_session=<token>'
```
