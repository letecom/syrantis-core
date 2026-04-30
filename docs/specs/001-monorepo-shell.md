# Issue 001: Monorepo Shell

## Objective

Create the initial pnpm TypeScript monorepo shell for Syrantis Core without implementing business workflows, production runtime, database schema, authentication, tenant logic, email delivery, or jobs.

## Business Value

The shell gives future agents a stable workspace structure for small vertical slices. It reduces architecture drift by making the intended app, API, shared contract, and database package boundaries explicit before product behavior is added.

## Scope

- Root pnpm workspace configuration.
- Strict TypeScript base configuration.
- ESLint flat config and Prettier configuration.
- Minimal React + Vite web placeholder.
- Minimal Hono API placeholder with `/health` and `/api/health`.
- Shared Zod health contract.
- Drizzle package placeholder with no business tables.
- VSCode settings and Makefile.
- Future folders for skills, packs, and ops notes.
- Issue 001 spec and implementation report.

## Allowed Files

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `eslint.config.js`
- `prettier.config.js`
- `.prettierignore`
- `.gitignore`
- `Makefile`
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `.vscode/launch.json`
- `apps/web/**`
- `apps/api/**`
- `packages/shared/**`
- `packages/db/**`
- `skills/README.md`
- `packs/README.md`
- `ops/README.md`
- `ops/docker/README.md`
- `docs/specs/001-monorepo-shell.md`
- `docs/implementation/001-monorepo-shell.md`

## Forbidden Files

- `.env`
- `.env.local`
- Any file under `/opt/syrantis/env`
- Any file under `/opt/syrantis/repos/syrantis-core`
- `docker-compose.yml`
- `Caddyfile`
- Production Docker runtime files
- Business workflow implementation
- Database business tables or migrations
- Auth, tenant enforcement, email sending, or job worker implementation
- Redis, BullMQ, tRPC, Next.js, Prisma, or NestJS setup

## Acceptance Criteria

- `pnpm install` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm lint` succeeds.
- `pnpm build` succeeds.
- No `.env` files are created.
- No Docker Compose runtime is created.
- API exposes only `GET /health` and `GET /api/health`.
- Health response uses the shared Zod contract.
- Web app has placeholder Pipeline, Tasks, and Settings pages.
- DB package contains no real business schema.
- Issue 001 spec and implementation report exist.
- `git status` shows only intended Issue 001 files changed.

## Rollback

Remove the Issue 001 scaffold files and delete the generated `pnpm-lock.yaml` if dependency installation has run. This returns the repository to the Issue 000 Build OS documentation state.
