# Issue 002: Database Schema v0

## Objective

Create the first approved PostgreSQL and Drizzle schema slice for Syrantis Core without adding runtime behavior.

## Business Value

The schema becomes the source of truth for controlled B2B delivery workflows. It gives future issues stable tables for lead response, devis relance, approvals, email auditability, AI run tracking, and workspace-scoped operations without letting data model drift start early.

## Scope

- Define the Drizzle PostgreSQL schema in `packages/db/src/schema.ts`.
- Add Drizzle Kit generation support for the database package.
- Generate an initial SQL migration under `packages/db/migrations`.
- Keep seed behavior as a placeholder that does not require a live database.
- Document the issue scope and implementation result.

## Tables

- `workspaces`
- `users`
- `sessions`
- `organizations`
- `contacts`
- `leads`
- `opportunities`
- `tasks`
- `drafts`
- `approvals`
- `email_sends`
- `email_events`
- `activity_logs`
- `ai_runs`
- `templates`
- `notes`

## Allowed Changes

- `packages/db/src/schema.ts`
- `packages/db/src/index.ts`
- `packages/db/src/seed.ts` if typecheck requires it
- `packages/db/drizzle.config.ts`
- `packages/db/package.json`
- `packages/db/migrations/**`
- `pnpm-lock.yaml`
- `docs/specs/002-db-schema-v0.md`
- `docs/implementation/002-db-schema-v0.md`

## Forbidden Changes

- No `.env` files or production environment access.
- No Docker, Docker Compose, Caddy, deployment, or production runtime files.
- No auth routes, tenant enforcement logic, email adapters, pg-boss workers, UI pages, tRPC, Redis, BullMQ, Prisma, Next.js, or NestJS.
- No RLS enablement, SQL policies, or real auth logic.
- No business workflows or autonomous outbound behavior.

## Acceptance Criteria

- `schema.ts` defines all 16 target tables.
- No `pgEnum` is used.
- Tenant-owned tables include `workspace_id` and workspace indexes.
- Status and type values use varchar columns with check constraints.
- `approvals.status` excludes `sent`.
- `email_sends` stores immutable content snapshots separately from `email_events`.
- `ai_runs` includes `prompt_hash` and `git_commit`.
- A migration is generated under `packages/db/migrations`.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- No secrets, forbidden runtime files, or forbidden dependencies are added.

## Rollback

Remove the Issue 002 schema, migration files, package script/dependency changes, and documentation files. Re-run `pnpm install` if dependency metadata needs to return to the Issue 001 state.
