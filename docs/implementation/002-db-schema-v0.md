# Issue 002: Database Schema v0 Implementation

## Objective

Create the first approved PostgreSQL and Drizzle schema slice for Syrantis Core.

## Business Value

The schema gives future implementation issues a stable source of truth for workspaces, controlled client records, lead response, devis relance, human approvals, immutable email send snapshots, provider events, AI run auditability, templates, notes, and activity history.

## Files Created or Modified

- `packages/db/src/schema.ts`
- `packages/db/src/index.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/package.json`
- `packages/db/migrations/*`
- `pnpm-lock.yaml`
- `docs/specs/002-db-schema-v0.md`
- `docs/implementation/002-db-schema-v0.md`

## Commands Run

- `pnpm install`
- `pnpm --filter @syrantis/db generate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `find . -name '.env*' -o -name 'docker-compose.yml' -o -name 'Caddyfile'`
- `rg -n "pgEnum|sent|trpc|@trpc|redis|bullmq|next|prisma|nestjs|@nestjs|docker-compose|Caddyfile|DATABASE_URL|/opt/syrantis/env" packages/db/src/schema.ts packages/db/migrations docs/specs/002-db-schema-v0.md docs/implementation/002-db-schema-v0.md packages/db/package.json pnpm-lock.yaml`
- `pnpm list prisma --depth -1`
- `pnpm why prisma`
- `git status --short`

## Checks Result

- `pnpm install`: passed; added `drizzle-kit` to the database package dev dependencies.
- `pnpm --filter @syrantis/db generate`: passed; generated the initial migration without requiring a live database URL.
- `pnpm typecheck`: passed.
- `pnpm lint`: initially failed on an unused `uniqueIndex` import, then passed after removing that import.
- `pnpm build`: passed.
- Forbidden runtime file audit: passed; no `.env`, Docker Compose, or `Caddyfile` files were created.
- Forbidden framework audit: no tRPC, Redis, BullMQ, Next.js, Prisma, NestJS, or related setup was added. `pnpm-lock.yaml` still includes Drizzle ORM optional peer metadata for Prisma, but `pnpm list prisma --depth -1` and `pnpm why prisma` returned no installed Prisma dependency.
- Schema audit: no `pgEnum` usage; `approvals.status` check contains only `pending`, `approved`, `rejected`, `expired`, and `revoked`.

## Migration Generated

- `packages/db/migrations/0000_early_blonde_phantom.sql`
- `packages/db/migrations/meta/0000_snapshot.json`
- `packages/db/migrations/meta/_journal.json`

## Risks

- The schema is intentionally structural only; no RLS, policies, auth, routes, email sending, workers, or tenant middleware are implemented in this issue.
- Polymorphic references such as `entity_type` plus `entity_id` are index-backed but not foreign-key enforced.
- `updated_at` defaults are defined, but automatic update triggers are not added in this issue.
- The `migrate` script is intentionally a placeholder until approved database wiring exists.

## Next Steps

- Add database client wiring and safe migration execution in a later issue.
- Add tenant access rules only after explicit approval.
- Add workflow logic for Lead Response and Devis Relance in scoped future issues.

## Rollback Notes

Remove the generated migration and Issue 002 schema/docs changes. Re-run dependency installation if `pnpm-lock.yaml` needs to be restored to the previous dependency graph.
