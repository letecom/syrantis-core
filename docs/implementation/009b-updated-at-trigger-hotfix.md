# Issue 009B: Updated At Trigger Hotfix Implementation

## Files Changed

- `AGENTS.md`
- `DECISIONS.md`
- `packages/db/migrations/0002_updated_at_triggers.sql`
- `packages/db/migrations/meta/_journal.json`
- `docs/specs/009b-updated-at-trigger-hotfix.md`
- `docs/implementation/009b-updated-at-trigger-hotfix.md`
- `docs/runbooks/updated-at-validation.md`

## SQL Added

- `CREATE OR REPLACE FUNCTION syrantis_set_updated_at()`
- `BEFORE UPDATE` triggers for each table with `updated_at`.
- The trigger function uses `NEW IS DISTINCT FROM OLD`, sets `NEW.updated_at = now()`, and always returns `NEW`.

## Tables Covered

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

## Commands Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git status --short`
- `git status --short | grep -E 'apps/api/src/repositories/tasks.ts|apps/api/src/routes/tasks.ts|apps/api/src/middleware/tenant.ts|apps/api/src/routes/auth.ts|packages/db/src/schema.ts|packages/db/src/migrate.ts|ops/docker/|apps/web/|(^|/)\\.env|Caddyfile|Dockerfile' || true`
- `grep -R "syrantis_set_updated_at" packages/db/migrations docs AGENTS.md DECISIONS.md`
- `grep -R "clock_timestamp" packages/db/migrations || true`
- `grep -R "CREATE POLICY\\|ENABLE ROW LEVEL SECURITY\\|FORCE ROW LEVEL SECURITY" packages/db/migrations || true`

## Checks

- `pnpm test`: passed, 5 test files and 24 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Import safety without `DATABASE_URL`: passed with `API_IMPORT_OK`.
- Forbidden scope audit: passed with no output.
- `syrantis_set_updated_at` audit: found migration, docs, governance, and decision references.
- `clock_timestamp` audit: passed with no output.
- RLS audit: passed with no `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, or `FORCE ROW LEVEL SECURITY`.
- `_journal.json` was updated manually because no repo-specific custom migration command for handwritten SQL migrations was present.

## Risks Remaining

- The migration must be applied in production before API PATCH responses reflect DB-managed `updated_at`.
- Tables without `updated_at` are intentionally not covered.
- Future tables with `updated_at` need the same trigger pattern.

## Production Validation Expected

```sh
cd /opt/syrantis/repos/syrantis-core
git pull origin main
pnpm install
pnpm build
make db-health
make db-migrate
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "select proname from pg_proc where proname = 'syrantis_set_updated_at';"
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "select event_object_table, trigger_name from information_schema.triggers where trigger_name like '%set_updated_at%' order by event_object_table;"
```

API validation:

1. Login.
2. Create or reuse a task.
3. Note `updatedAt`.
4. `sleep 2`.
5. PATCH the task.
6. Verify `updatedAt` is strictly greater.

## Explicit Non-Scope

- No `packages/db/src/schema.ts` change.
- No `packages/db/src/migrate.ts` change.
- No repository, service, route, auth, tenantGuard, Docker, or UI change.
- No RLS.
- No audit logs.
- No rate limiting.
- No approvals.
