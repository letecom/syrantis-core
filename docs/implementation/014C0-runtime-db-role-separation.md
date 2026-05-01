# Issue 014C0 Implementation: Runtime DB Role Separation

## Files Changed

- `packages/db/src/migrate.ts`
- `packages/db/drizzle.config.ts`
- `packages/db/migrations/0004_create_runtime_db_role.sql`
- `packages/db/migrations/meta/_journal.json`
- `docs/specs/014C0-runtime-db-role-separation.md`
- `docs/implementation/014C0-runtime-db-role-separation.md`

## Migration Name

- `0004_create_runtime_db_role.sql`

## Role And Grant Summary

The migration creates `syrantis_app` when it does not already exist:

- `LOGIN`
- `NOSUPERUSER`
- `NOBYPASSRLS`
- `NOCREATEDB`
- `NOCREATEROLE`

It grants:

- `CONNECT` on database `syrantis`
- `USAGE` on schema `public`
- `SELECT` on `users` and `workspaces`
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `sessions`
- `SELECT`, `INSERT`, `UPDATE` on `organizations`, `contacts`, `leads`, `tasks`, `approvals`, and `activity_logs`
- `USAGE`, `SELECT` on all public sequences
- default future table and sequence privileges for objects created by `syrantis` in schema `public`

The migration does not set a password and does not transfer table ownership.

If `syrantis_app` already exists, the migration normalizes the role attributes and fails fast if `syrantis_app` owns any public table.

## Migration URL Support

Migration execution now resolves its connection URL as:

```text
explicit runMigrations(databaseUrl) argument ?? MIGRATION_DATABASE_URL ?? DATABASE_URL
```

`packages/db/drizzle.config.ts` also uses:

```text
MIGRATION_DATABASE_URL ?? DATABASE_URL
```

The runtime API DB client was not changed and continues to use `DATABASE_URL`.

## Manual Production Steps Required

After the migration creates `syrantis_app`, an operator must set its password outside the repository:

```psql
\password syrantis_app
```

Then manually edit `/opt/syrantis/env/core.prod.env`:

- set `DATABASE_URL` to `syrantis_app` credentials
- add `MIGRATION_DATABASE_URL` with `syrantis` admin credentials

No password or secret value belongs in the repository, docs, shell output, or PR text.

## Rollback

If the API fails after switching `DATABASE_URL`:

- restore `DATABASE_URL` to the previous `syrantis` admin credentials in `/opt/syrantis/env/core.prod.env`
- restart the API

No data rollback is required. The role/grants can remain in place while the runtime switch is reverted.

## Checks Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`

## Confirmation

Not added or changed:

- RLS activation
- RLS policies
- `FORCE ROW LEVEL SECURITY`
- Auth
- `tenantGuard`
- `withWorkspaceDb`
- business route/service/repository logic
- table ownership
- data deletion
- Resend
- jobs
- AI
- drafts
- webhooks
- UI
