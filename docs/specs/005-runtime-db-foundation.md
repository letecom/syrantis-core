# Issue 005: Runtime DB Foundation

## Objective

Create the minimal PostgreSQL runtime foundation for Syrantis Core without deploying the application or adding business behavior.

## Business Value

Auth, sessions, tenant guard, approvals, and workflows need a real migrated PostgreSQL runtime. This issue prepares that runtime while keeping secrets outside the repository and leaving application behavior unchanged.

## Scope

- Add a Docker Compose definition for PostgreSQL only.
- Add a dummy env example for local syntax validation.
- Add Makefile commands for controlled runtime database operations.
- Add a database runtime runbook.
- Document implementation and rollback.

## Allowed Files

- `ops/docker/docker-compose.yml`
- `ops/docker/.env.example`
- `docs/specs/005-runtime-db-foundation.md`
- `docs/implementation/005-runtime-db-foundation.md`
- `docs/runbooks/db-runtime.md`
- `Makefile`

## Forbidden Files

- `apps/*`
- `packages/db/src/schema.ts`
- `packages/db/src/client.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/health.ts`
- `packages/db/migrations/*`
- `packages/shared/*`
- `.env*` real secret files
- `Caddyfile`
- `Dockerfile`
- Runtime env files under `/opt/syrantis/env`

## Env Model

Runtime secrets live outside the repository in `/opt/syrantis/env/core.prod.env`. Agents must not read or print that file. The repository only includes `ops/docker/.env.example` with dummy values for configuration validation.

Generate `POSTGRES_PASSWORD` with `openssl rand -hex 32`. Base64 passwords may contain URL-unsafe characters such as `/`, `+`, and `=`, and must be URL-encoded before being embedded in `DATABASE_URL`.

Required variables:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

## Docker Design

- One service only: `postgres`.
- Image: `postgres:16-alpine`.
- Container name: `syrantis-postgres`.
- Named volume: `syrantis-postgres-data`.
- Internal bridge network: `syrantis-internal`.
- Local-only port binding: `127.0.0.1:5432:5432`.
- Healthcheck uses `pg_isready`.
- No top-level `version` key.

## Makefile Command Design

Makefile commands reference `/opt/syrantis/env/core.prod.env` but do not print its contents. Docker lifecycle targets are explicit and non-destructive. No reset or volume deletion target is included.

Targets:

- `db-up`
- `db-stop`
- `db-down`
- `db-logs`
- `db-ps`
- `db-health`
- `db-migrate`

## Acceptance Criteria

- Compose defines only PostgreSQL.
- PostgreSQL binds only to `127.0.0.1`.
- Runtime secrets are not committed.
- Makefile commands use the external runtime env path.
- No app, schema, migration, DB client, shared package, UI, auth, tenant, Caddy, or Dockerfile changes.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

## Rollback

Remove `ops/docker/docker-compose.yml`, `ops/docker/.env.example`, `docs/runbooks/db-runtime.md`, the Issue 005 docs, and the Makefile DB targets.

## Risks

- Docker commands must be run by the `syrantis` runtime user, not by `syrantis-ai`.
- A weak or missing `POSTGRES_PASSWORD` in the runtime env will prevent a safe runtime posture.
- A base64 password embedded directly in `DATABASE_URL` can break URL parsing if it contains URL-unsafe characters.
- Migration execution remains explicit and should happen only after reviewing the target database URL.

## Next Issue

Implement the next narrow runtime foundation step, such as auth/session database usage, after the database is created, healthy, and migrated.
