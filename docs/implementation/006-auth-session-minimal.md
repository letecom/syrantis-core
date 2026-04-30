# Issue 006: Auth Session Minimal Implementation

## Files Changed

- `packages/shared/src/contracts/auth.ts`
- `packages/shared/src/contracts/index.ts`
- `packages/db/src/schema.ts`
- `packages/db/migrations/*`
- `apps/api/package.json`
- `apps/api/src/lib/password.ts`
- `apps/api/src/lib/session-token.ts`
- `apps/api/src/services/auth.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/middleware/session.ts`
- `apps/api/src/cli/create-founder.ts`
- `apps/api/src/tests/auth.test.ts`
- `Makefile`
- `pnpm-lock.yaml`
- `docs/specs/006-auth-session-minimal.md`
- `docs/implementation/006-auth-session-minimal.md`

## Schema Changes

- Pending.

## Migration Generated

- Pending.

## Routes Added

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

## Tests Added

- Invalid login returns 401.
- Valid login returns success and sets `syrantis_session`.
- `/auth/me` without cookie returns 401.
- `/auth/me` with valid fake cookie returns the current user.
- Logout clears cookie and returns success.
- API app import remains safe without `DATABASE_URL`.

## Commands Run

- Pending.

## Checks Result

- Pending.

## Deviations

- Pending.

## Risks Remaining

- Tenant guard hardening is intentionally not implemented.
- Password reset, user management, lockouts, rate limiting, and audit logging are not implemented.
- Founder creation is manual and must be run only with a reviewed runtime environment.

## Post-Merge Manual Commands

```sh
cd /opt/syrantis/repos/syrantis-core
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
