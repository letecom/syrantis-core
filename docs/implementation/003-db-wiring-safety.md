# Issue 003: DB Wiring Safety Implementation

## Objective

Create safe PostgreSQL and Drizzle database wiring that is usable by future features without import-time crashes or automatic production migration execution.

## Business Value

The DB package now exposes an explicit connection path, health check, and migration runner so future work can build against the real Issue 002 schema while keeping production operations controlled.

## Files Modified

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

## Commands Run

- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./packages/db/dist/src/index.js').then(() => console.log('IMPORT_OK'))"`
- `env -u DATABASE_URL node -e "import('./packages/db/dist/src/health.js').then(async (m) => { const r = await m.checkDatabaseHealth(); console.log(JSON.stringify(r)); if (r.status !== 'missing_config') process.exit(2); })"`
- `rg -n "new Pool|drizzle\\(" packages/db/src packages/db/dist/src`
- `git diff --name-only -- apps packages/db/src/schema.ts packages/db/migrations ops`
- `env -u DATABASE_URL pnpm --filter @syrantis/db health`
- `env -u DATABASE_URL node -e "import('./packages/db/dist/src/index.js').then(() => console.log('import ok'))"`
- `env -u DATABASE_URL pnpm --filter @syrantis/db migrate`
- `find . -name '.env*' -o -name 'docker-compose.yml' -o -name 'Caddyfile'`
- `rg -n "trpc|@trpc|redis|bullmq|next|prisma|nestjs|@nestjs|docker-compose|Caddyfile|/opt/syrantis/env|core.prod.env|password=|secret" packages/db docs/specs/003-db-wiring-safety.md docs/implementation/003-db-wiring-safety.md package.json pnpm-lock.yaml`
- `pnpm list prisma --depth -1`
- `pnpm why prisma`
- `git status --short`

## Checks Result

- `pnpm install`: passed; lockfile was already up to date for the added local `tsx` script runner.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Built DB package import with `DATABASE_URL` unset: passed with `IMPORT_OK`.
- Built DB health module check with `DATABASE_URL` unset: passed; returned `{"ok":false,"status":"missing_config","error":"DATABASE_URL is not configured."}`.
- DB health with `DATABASE_URL` unset: passed; returned `{ ok: false, status: "missing_config" }` and exit code 0.
- DB migrate with `DATABASE_URL` unset: failed as expected with a clear `DATABASE_URL is required for database access` error and did not connect.
- Pool creation audit: `new Pool` and `drizzle()` are present only in `packages/db/src/client.ts` and built output.
- Forbidden scope audit: no `apps/*`, schema, migration, or `ops/*` files changed.
- Forbidden runtime file audit: passed; no `.env`, Docker Compose, or `Caddyfile` files were created.
- Forbidden framework audit: no tRPC, Redis, BullMQ, Next.js, Prisma, NestJS, or related setup was added. `pnpm-lock.yaml` still contains Drizzle ORM optional peer metadata for Prisma inherited from existing Drizzle dependencies, but `pnpm list prisma --depth -1` and `pnpm why prisma` returned no installed Prisma dependency.

## Client Lifecycle

- `createDbClient(databaseUrl?, options?)` creates one isolated pool and returns `{ db, pool, close }`.
- `createPgPool(databaseUrl?, options?)` applies default pool settings: `max: 10`, `idleTimeoutMillis: 30000`, and `connectionTimeoutMillis: 5000`.
- `close()` is idempotent and only closes the isolated pool returned by that client factory call.
- `getGlobalDbClient(databaseUrl?, options?)` lazily creates one process-level runtime client only when called.
- `closeGlobalDbClient()` closes the global pool and resets global state to `null`.
- `requireDatabaseUrl()` validates configured URLs with the native `URL` constructor and accepts only `postgres:` or `postgresql:` protocols.
- Importing `@syrantis/db` still creates no pool, no connection, and no migration execution.

## Migration Flow

- `runMigrations(databaseUrl?)` resolves `DATABASE_URL` only when called.
- `runMigrations(databaseUrl?)` uses an isolated client from `createDbClient()` rather than the global runtime singleton.
- The migration runner uses `drizzle-orm/node-postgres/migrator` and the generated `packages/db/migrations` folder.
- The package script `pnpm --filter @syrantis/db migrate` runs `tsx src/migrate-cli.ts`.
- No migration runs on import.
- The isolated pool is closed after migration success or failure.
- Migration logs `[migrate] Starting migrations...`, `[migrate] Done in Xms`, or `[migrate] Failed: <message>`.
- With no configured database URL, migration exits non-zero with a clear configuration error.

## Health Check Behavior

- `checkDatabaseHealth(databaseUrl?)` returns `{ ok: false, status: "missing_config" }` when no URL is configured.
- If a URL is provided or `DATABASE_URL` exists, it opens an isolated client, runs `select 1`, records latency, and calls `close()` in `finally`.
- Health checks do not read `.env` files or production env files.
- Health checks never use the global runtime singleton.

## Known Risks

- The migration script is explicit but still powerful; it should only be run by a human-approved process with the intended database URL in the calling environment.
- The global runtime singleton is ready for future API use but is not used by apps in this issue.
- No app-side DB usage is implemented in this issue.
- No RLS, tenant enforcement, auth, or business workflow logic is implemented.

## Rollback Notes

Remove the DB runtime files and restore the database package scripts and exports to the Issue 002 state. Re-run dependency installation if `pnpm-lock.yaml` must drop `tsx`.

## Next Steps

- Add approved API-side database wiring or a narrow DB-aware health integration in a future issue.
- Add tenant enforcement and auth only after explicit approval.
