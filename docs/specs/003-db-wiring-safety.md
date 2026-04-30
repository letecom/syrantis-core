# Issue 003: DB Wiring Safety

## Objective

Create safe PostgreSQL and Drizzle runtime wiring for Syrantis Core without adding business logic or production automation.

## Business Value

Future auth, tenant guard, task, approval, and email workflow issues need a real database connection path. This issue turns the Issue 002 schema into an operable foundation while keeping import safety and production migration control explicit.

## Scope

- Add database configuration helpers that read only the calling process environment.
- Add explicit PostgreSQL pool and Drizzle client factory functions.
- Add a database health check that reports missing configuration without throwing.
- Add an explicit migration runner using the generated Drizzle migrations folder.
- Add package scripts for health and migration execution.
- Export the DB runtime helpers from `@syrantis/db` without creating import-time connections.

## Allowed Changes

- `packages/db/src/config.ts`
- `packages/db/src/client.ts`
- `packages/db/src/health.ts`
- `packages/db/src/health-cli.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/migrate-cli.ts`
- `packages/db/src/index.ts`
- `packages/db/package.json`
- `pnpm-lock.yaml`
- `docs/specs/003-db-wiring-safety.md`
- `docs/implementation/003-db-wiring-safety.md`

## Forbidden Changes

- No `.env`, `.env.local`, secrets, or production environment access.
- No Docker, Docker Compose, Caddy, deploy, or production runtime changes.
- No app routes, UI, auth implementation, tenant middleware implementation, email adapter, pg-boss worker, or business workflow.
- No RLS policies.
- No tRPC, Redis, BullMQ, Prisma, Next.js, or NestJS.
- No schema or migration SQL changes unless required by build failure.

## Acceptance Criteria

- Importing `@syrantis/db` does not require `DATABASE_URL`.
- Importing `packages/db/src/index.ts` creates no database connection and runs no migration.
- `createDbClient()` and `createPgPool()` require a database URL only when called.
- `checkDatabaseHealth()` returns `missing_config` when no database URL exists.
- `runMigrations()` requires a database URL and closes its pool.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- No forbidden runtime files, secrets, dependencies, routes, middleware, or UI changes are added.

## Rollback

Remove the Issue 003 DB runtime files, package script/dependency changes, lockfile updates, and docs. Restore `packages/db/src/index.ts` to schema and seed exports only if rolling back to the Issue 002 state.

## Next Issue

Add approved application-side database usage in a narrow slice, such as a non-business health integration or database client wiring for the API, without auth or tenant enforcement until explicitly approved.
