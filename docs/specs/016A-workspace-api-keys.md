# 016A - Workspace API Keys Foundation

## Objective

Create workspace-scoped API key management foundations for future public endpoints.

This issue does not create any public business endpoint and does not allow API keys to authenticate requests yet. It only lets authenticated internal users create, list, inspect, and revoke key records for the current workspace.

## Table

### workspace_api_keys

Fields:

- `id`
- `workspace_id`
- `name`
- `key_hash`
- `key_prefix`
- `last4`
- `status`
- `last_used_at`
- `revoked_at`
- `created_at`
- `updated_at`

Checks:

- `status in ('active', 'revoked')`

Indexes:

- `workspace_api_keys_workspace_id_idx`
- `workspace_api_keys_status_idx`
- `workspace_api_keys_created_at_idx`
- `workspace_api_keys_key_hash_idx` unique

## Key handling

Keys are generated with Node `crypto` only:

- generate 32 random bytes
- base64url encode the random bytes
- plaintext format is `syr_live_<random>`
- store only the SHA-256 hash of the plaintext key
- store `keyPrefix = "syr_live"`
- store `last4`
- return the plaintext key once on creation

Plaintext API keys and key hashes must never be returned by list/detail routes, stored in activity log metadata, documented as real values, or logged.

## Routes

The protected router mounts at:

- `/api/workspace-api-keys`

Routes:

- `GET /api/workspace-api-keys`
- `POST /api/workspace-api-keys`
- `GET /api/workspace-api-keys/:id`
- `POST /api/workspace-api-keys/:id/revoke`

All routes are protected by `tenantGuard`.

All routes reject client-provided `workspaceId` in request body or query string. `workspaceId` comes only from trusted server context.

## Responses

Summary fields:

- `id`
- `workspaceId`
- `name`
- `keyPrefix`
- `last4`
- `status`
- `lastUsedAt`
- `revokedAt`
- `createdAt`
- `updatedAt`

Create responses add:

- `plaintextApiKey`

The plaintext value is returned once only by `POST /api/workspace-api-keys`. A fake documentation-only example may look like `syr_live_xxx`.

## Revocation

Revocation is a status transition:

- active key revocation returns `200`
- already revoked keys return `409`
- missing or cross-workspace keys return `404`

No physical delete behavior is introduced.

## Activity logs

The foundation extends activity logs with:

- `workspace_api_key.created`
- `workspace_api_key.revoked`

Activity logs are written in the same transaction as the key mutation. Metadata may include:

- `name`
- `keyPrefix`
- `last4`

Metadata must not include:

- plaintext API key
- key hash

## RLS

`workspace_api_keys` is created with:

- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- `tenant_isolation_workspace_api_keys`

The tenant policy uses `app.current_workspace_id`:

```sql
workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
```

DB/RLS proof required after migration:

- direct runtime `SELECT` as `syrantis_app` without `app.current_workspace_id` returns 0 rows
- `pg_class.relrowsecurity` is `true`
- `pg_class.relforcerowsecurity` is `true`

## Anti-scope

This issue explicitly excludes:

- public lead intake
- `POST /api/public/leads`
- API key authentication middleware
- OAuth
- idempotency
- external calls
- email sending
- new dependencies
- auth, tenant guard, or DB helper changes
- application code outside the internal key management foundation

## Validation plan

- run `pnpm test`
- run `pnpm typecheck`
- run `pnpm lint`
- run `pnpm build`
- verify API app imports without `DATABASE_URL`
- run `git diff --check`
- inspect migration RLS, force RLS, policy, indexes, and trigger
- confirm list/detail responses contain no plaintext API key and no key hash
