# 016A - Workspace API Keys Foundation Implementation

## Changed files

- `packages/db/src/schema.ts`
- `packages/db/migrations/0007_workspace_api_keys.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/shared/src/contracts/workspace-api-keys.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/workspace-api-keys.ts`
- `apps/api/src/services/workspace-api-keys.ts`
- `apps/api/src/routes/workspace-api-keys.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/workspace-api-keys.test.ts`
- `docs/specs/016A-workspace-api-keys.md`
- `docs/implementation/016A-workspace-api-keys.md`

## Migration name

`0007_workspace_api_keys`

## Table created

- `workspace_api_keys`

## Policy created

- `tenant_isolation_workspace_api_keys`

## Routes created

- `GET /api/workspace-api-keys`
- `POST /api/workspace-api-keys`
- `GET /api/workspace-api-keys/:id`
- `POST /api/workspace-api-keys/:id/revoke`

## Activity log actions

- `workspace_api_key.created`
- `workspace_api_key.revoked`

## Security notes

- API key plaintext is generated with Node `crypto` using 32 random bytes and base64url encoding.
- API key plaintext format is `syr_live_<random>`.
- Only SHA-256 key hashes are persisted.
- List and detail outputs expose only non-secret summaries.
- Activity log metadata includes only `name`, `keyPrefix`, and `last4`.
- Activity log metadata does not include plaintext API keys or key hashes.
- All key routes reject client-provided `workspaceId` in body or query.
- Mutations run through `withWorkspaceDb(workspaceId, ...)`.
- Activity logs are written inside the same transaction as create/revoke mutations.
- Revocation is a status transition; no physical delete route was added.

## DB/RLS proof

The migration enables and forces RLS:

```sql
ALTER TABLE "workspace_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_api_keys" FORCE ROW LEVEL SECURITY;
```

The migration creates policy `tenant_isolation_workspace_api_keys` using `app.current_workspace_id`.

Required runtime proof after applying the migration:

```sql
SELECT count(*) FROM workspace_api_keys;
```

As `syrantis_app` without `app.current_workspace_id`, this returns `0` rows.

```sql
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'workspace_api_keys';
```

Expected result:

- `relrowsecurity = true`
- `relforcerowsecurity = true`

## Tests passed

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git diff --check`

## Audit results

- API import without `DATABASE_URL` returned `API_IMPORT_OK`.
- `git diff --check` returned no whitespace errors.
- Grep for long literal `syr_live_` API-key-like values returned no matches.
- No public lead intake or public API key authentication routes were added.
- No forbidden auth, tenant guard, DB helper, web, ops, env, Docker, Caddy, or lockfile edits were made.

## Risks / non-goals

- no API key authentication middleware
- no public lead intake
- no `POST /api/public/leads`
- no OAuth
- no external calls
- no idempotency
- no tenant guard, auth, or DB helper changes
- no UI changes

## Rollback

If this feature needs rollback, revert:

- `packages/db/migrations/0007_workspace_api_keys.sql`
- updates to `packages/db/src/schema.ts`
- workspace API key contract, repository, service, route, and tests
- activity log contract extensions
- docs for 016A

## Production validation plan

- run `pnpm test`
- run `pnpm typecheck`
- run `pnpm lint`
- run `pnpm build`
- verify `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- run `git diff --check`
- inspect migration file and RLS policy
