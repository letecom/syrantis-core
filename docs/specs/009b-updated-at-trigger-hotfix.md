# Issue 009B: Updated At Trigger Hotfix

## Objective

Guarantee `updated_at` maintenance at the PostgreSQL layer for tables that currently expose an `updatedAt` column mapped to `updated_at` in `packages/db/src/schema.ts`.

## Business Value

Reliable update timestamps are required for operational confidence, API validation, debugging, future sync workflows, and customer-facing activity timelines. Maintaining them in PostgreSQL avoids per-repository drift and fixes the observed task PATCH behavior without changing API code.

## Tables Detected

Detected from the current schema via the shared `timestamps` object and `...timestamps` usage:

- `workspaces`
- `users`
- `organizations`
- `contacts`
- `leads`
- `opportunities`
- `tasks`
- `drafts`
- `approvals`
- `templates`

Tables with only `created_at` are intentionally not covered.

## Authorized Files

- `packages/db/migrations/0002_updated_at_triggers.sql`
- `packages/db/migrations/meta/_journal.json`
- `docs/specs/009b-updated-at-trigger-hotfix.md`
- `docs/implementation/009b-updated-at-trigger-hotfix.md`
- `docs/runbooks/updated-at-validation.md`
- `AGENTS.md`
- `DECISIONS.md`

## Forbidden Files

- `packages/db/src/schema.ts`
- `packages/db/src/migrate.ts`
- repositories, services, routes, auth, tenantGuard
- `ops/docker/*`
- `apps/web/*`
- `.env*`
- `Caddyfile`
- `Dockerfile`

## Acceptance Criteria

- A Drizzle-applicable migration creates `syrantis_set_updated_at()`.
- The function uses `now()`.
- The function uses `NEW IS DISTINCT FROM OLD`.
- The function returns `NEW`.
- Each detected `updated_at` table has a `BEFORE UPDATE` trigger.
- No trigger is created on tables without `updated_at`.
- No RLS policy is created.
- No schema TypeScript file is modified.
- No application repository, service, route, auth, tenant, Docker, or UI code is modified.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and import safety pass.

## Rollback

Drop each trigger:

```sql
DROP TRIGGER IF EXISTS workspaces_set_updated_at_trg ON workspaces;
DROP TRIGGER IF EXISTS users_set_updated_at_trg ON users;
DROP TRIGGER IF EXISTS organizations_set_updated_at_trg ON organizations;
DROP TRIGGER IF EXISTS contacts_set_updated_at_trg ON contacts;
DROP TRIGGER IF EXISTS leads_set_updated_at_trg ON leads;
DROP TRIGGER IF EXISTS opportunities_set_updated_at_trg ON opportunities;
DROP TRIGGER IF EXISTS tasks_set_updated_at_trg ON tasks;
DROP TRIGGER IF EXISTS drafts_set_updated_at_trg ON drafts;
DROP TRIGGER IF EXISTS approvals_set_updated_at_trg ON approvals;
DROP TRIGGER IF EXISTS templates_set_updated_at_trg ON templates;
DROP FUNCTION IF EXISTS syrantis_set_updated_at();
```
