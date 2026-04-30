# Issue 004: API Contracts Tests Foundation

## Objective

Add minimal API test tooling and health contract validation for Syrantis Core.

## Business Value

The API will soon receive auth, tenant guard, approval, email, and job behavior. This issue adds the first safety rail so future changes can validate API import safety and contract shape before business logic lands.

## Scope

- Add Vitest for the API workspace.
- Add a root test command that runs API tests from the monorepo root.
- Split the Hono app into an importable module that does not start a server.
- Test `GET /health` through `app.request()`.
- Validate the health response with the shared contract.
- Verify API app import safety without `DATABASE_URL`.

## Allowed Files

- `package.json`
- `pnpm-lock.yaml`
- `apps/api/package.json`
- `apps/api/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/tests/*`
- `docs/specs/004-api-contracts-tests-foundation.md`
- `docs/implementation/004-api-contracts-tests-foundation.md`

## Forbidden Files

- `apps/web/*`
- `packages/db/src/schema.ts`
- `packages/db/migrations/*`
- `packages/db/src/client.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/health.ts`
- API auth or tenant middleware implementation
- `ops/*`
- `.env*`
- Docker Compose or Caddy runtime files

## Acceptance Criteria

- Tests can run from the repository root.
- Health route is tested through Hono `app.request()`.
- Shared health response contract is validated.
- API app import does not require `DATABASE_URL`.
- No live database, migrations, or DB client are used.
- No business routes, auth, tenant guard, email, jobs, or UI behavior are added.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

## Rollback

Remove the Vitest dependency, test scripts, API app split, test files, and Issue 004 docs. Restore `apps/api/src/index.ts` to own app creation if rolling back to the Issue 003 state.

## Next Issue

Add the next narrow API foundation slice, such as a DB-aware readiness check or auth contract scaffolding, without implementing tenant enforcement until explicitly approved.
