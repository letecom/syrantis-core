# Issue 001: Monorepo Shell Implementation

## Objective

Create the initial pnpm TypeScript monorepo shell for Syrantis Core while keeping Issue 001 limited to structure and tooling.

## Files Created

- Root workspace and tooling files:
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - `eslint.config.js`
  - `prettier.config.js`
  - `.prettierignore`
  - `.gitignore`
  - `Makefile`
- VSCode workspace files:
  - `.vscode/settings.json`
  - `.vscode/extensions.json`
  - `.vscode/launch.json`
- Web placeholder:
  - `apps/web/package.json`
  - `apps/web/tsconfig.json`
  - `apps/web/vite.config.ts`
  - `apps/web/index.html`
  - `apps/web/src/main.tsx`
  - `apps/web/src/App.tsx`
  - `apps/web/src/pages/Pipeline.tsx`
  - `apps/web/src/pages/Tasks.tsx`
  - `apps/web/src/pages/Settings.tsx`
  - `apps/web/src/lib/api/index.ts`
  - `apps/web/src/styles.css`
- API placeholder:
  - `apps/api/package.json`
  - `apps/api/tsconfig.json`
  - `apps/api/src/index.ts`
  - `apps/api/src/routes/index.ts`
  - `apps/api/src/routes/health.ts`
  - `apps/api/src/middleware/error.ts`
  - `apps/api/src/middleware/tenant.ts`
- Shared package:
  - `packages/shared/package.json`
  - `packages/shared/tsconfig.json`
  - `packages/shared/src/index.ts`
  - `packages/shared/src/contracts/index.ts`
  - `packages/shared/src/contracts/health.ts`
- DB placeholder:
  - `packages/db/package.json`
  - `packages/db/tsconfig.json`
  - `packages/db/drizzle.config.ts`
  - `packages/db/src/index.ts`
  - `packages/db/src/schema.ts`
  - `packages/db/src/seed.ts`
- Future folders:
  - `skills/README.md`
  - `packs/README.md`
  - `ops/README.md`
  - `ops/docker/README.md`
- Documentation:
  - `docs/specs/001-monorepo-shell.md`
  - `docs/implementation/001-monorepo-shell.md`

## Commands Run

- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `find . -name '.env*' -o -name 'docker-compose.yml' -o -name 'Caddyfile'`
- `rg -n "trpc|@trpc|redis|bullmq|next|prisma|nestjs|@nestjs" package.json pnpm-lock.yaml apps packages docs ops skills packs .vscode`
- `pnpm why prisma`
- `pnpm list prisma --depth -1`
- `git status --short`

## Checks Result

- `pnpm install`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Forbidden runtime file audit: passed; no `.env`, Docker Compose, or `Caddyfile` files exist.
- Forbidden framework audit: no direct tRPC, Redis, BullMQ, Next.js, Prisma, NestJS, or related setup was added.
- `pnpm why prisma` and `pnpm list prisma --depth -1`: no installed Prisma dependency was reported.

## Risks

- Dependency versions will be locked by `pnpm install`.
- The DB package intentionally contains no schema until Issue 002.
- The tenant middleware is intentionally a protected placeholder and does not enforce tenancy.
- `pnpm-lock.yaml` contains Drizzle ORM optional peer metadata strings for Prisma because `drizzle-orm` declares many optional adapters. Prisma is not installed, imported, configured, or used by this issue.

## Next Steps

- Issue 002 should define the first approved database schema slice and any required migration process.

## Rollback Notes

Remove the Issue 001 scaffold files and generated lockfile to return to the Issue 000 documentation-only state.

## Business Value

The monorepo shell establishes clear package boundaries for future vertical slices and gives agents a predictable, typechecked workspace without adding product behavior prematurely.
