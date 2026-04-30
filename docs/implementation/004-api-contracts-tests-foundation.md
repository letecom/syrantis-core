# Issue 004: API Contracts Tests Foundation Implementation

## Files Modified

- `package.json`
- `pnpm-lock.yaml`
- `apps/api/package.json`
- `apps/api/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/tests/health.test.ts`
- `apps/api/src/tests/import-safety.test.ts`
- `docs/specs/004-api-contracts-tests-foundation.md`
- `docs/implementation/004-api-contracts-tests-foundation.md`
- `packages/shared/src/index.ts`
- `packages/shared/src/contracts/index.ts`

## Dependency Changes

- Added `vitest` to `@syrantis/api` dev dependencies.

## Tests Added

- `GET /health` test through Hono `app.request()`.
- Shared `healthResponseSchema` validation for valid payloads and invalid status rejection.
- API app import safety test with `DATABASE_URL` absent.

## ESM Export Fix

- Updated shared package barrel exports to use explicit `.js` paths:
  - `packages/shared/src/index.ts` exports from `./contracts/index.js`
  - `packages/shared/src/contracts/index.ts` exports from `./health.js`
- This keeps the health schema shape unchanged while allowing compiled Node ESM imports to resolve.

## Commands Run

- `pnpm install`
- `env -u DATABASE_URL pnpm test`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/app.js').then((m) => { if (!m.app) process.exit(2); console.log('API_APP_IMPORT_OK'); })"`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git diff --name-only -- apps/web packages/db/src/schema.ts packages/db/migrations packages/db/src/client.ts packages/db/src/migrate.ts packages/db/src/health.ts ops`
- `find . -name '.env*' -o -name 'docker-compose.yml' -o -name 'Caddyfile'`
- `rg -n "trpc|@trpc|redis|bullmq|next|prisma|nestjs|@nestjs|resend|pg-boss|DATABASE_URL|createDbClient|getGlobalDbClient|runMigrations" package.json pnpm-lock.yaml apps/api packages/shared docs/specs/004-api-contracts-tests-foundation.md docs/implementation/004-api-contracts-tests-foundation.md`
- `pnpm list prisma --depth -1`
- `pnpm why prisma`
- `git status --short`

## Checks Result

- `pnpm install`: passed; installed Vitest for the API workspace and updated `pnpm-lock.yaml`.
- `env -u DATABASE_URL pnpm test`: passed; 2 test files and 3 tests passed.
- `pnpm test`: passed; 2 test files and 3 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Source-level API app import safety: passed through `apps/api/src/tests/import-safety.test.ts` with `DATABASE_URL` absent.
- Built artifact API app import check: passed after the shared package ESM export path fix.
- Forbidden path audit: passed; no `apps/web`, DB schema, DB migrations, DB client/migrate/health, or `ops` files changed.
- Forbidden runtime file audit: passed; no `.env`, Docker Compose, or `Caddyfile` files were created.
- Forbidden dependency audit: no tRPC, Redis, BullMQ, Next.js, Prisma, NestJS, Resend, or pg-boss dependencies were added. `pnpm-lock.yaml` still contains Drizzle ORM optional peer metadata for Prisma, but `pnpm list prisma --depth -1` and `pnpm why prisma` returned no installed Prisma dependency.
- DB live audit: no `createDbClient`, `getGlobalDbClient`, or `runMigrations` usage was added.

## Deviations

- Root `test` script uses `pnpm --filter @syrantis/api test` instead of `pnpm -r test` so packages without test scripts do not fail the root command.
- Shared package ESM export paths were fixed in this follow-up because compiled API runtime import was part of Issue 004 acceptance.
- Commands ran outside the sandbox because command startup still fails with `bwrap: loopback: Failed RTM_NEWADDR`.

## Risks Remaining

- The test harness covers only the health route and import safety.
- No database, auth, tenant enforcement, email, jobs, or business routes are covered because they are intentionally out of scope.

## Next Issue Recommendation

- Add the next narrow API foundation slice, such as a DB-aware readiness check or auth contract scaffolding, without enabling tenant enforcement until explicitly approved.
