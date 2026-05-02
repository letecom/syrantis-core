# Issue 016B - Public Lead Intake Foundation Implementation

## Summary

Implemented `POST /api/public/leads` as a public API-key-authenticated lead intake endpoint.

The endpoint does not use `tenantGuard`. It authenticates `Bearer syr_live_...`, resolves the owning workspace through a dedicated RLS-safe API key lookup setting, then performs lead creation and related writes inside `withWorkspaceDb(workspaceId, tx => ...)`.

## Files Changed

- `packages/db/migrations/0008_workspace_api_key_public_lookup_policy.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/shared/src/contracts/public-leads.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/lib/db.ts`
- `apps/api/src/repositories/public-lead-intake.ts`
- `apps/api/src/services/public-lead-intake.ts`
- `apps/api/src/routes/public-leads.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/public-leads.test.ts`
- `docs/specs/016B-public-lead-intake.md`
- `docs/implementation/016B-public-lead-intake.md`

## RLS API Key Lookup

Added policy `workspace_api_keys_public_lookup`:

```sql
CREATE POLICY "workspace_api_keys_public_lookup"
  ON "workspace_api_keys"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (
    status = 'active'
    AND key_hash = nullif(current_setting('app.current_api_key_hash', true), '')
  );
```

Added `withApiKeyLookupDb(apiKeyHash, fn)` in `apps/api/src/lib/db.ts`. It opens a transaction and sets only `app.current_api_key_hash`. It does not set `app.current_workspace_id`, change `tenantGuard`, disable RLS, remove FORCE RLS, or use an admin DB URL.

This setting is necessary because `workspace_api_keys` is protected by RLS and the public endpoint cannot know `workspaceId` until the API key has been looked up.

## Endpoint

`POST /api/public/leads`

Headers:

- `Authorization: Bearer syr_live_<plaintext_api_key>`
- optional `Idempotency-Key`

Successful creation returns `201`:

```json
{
  "success": true,
  "data": {
    "id": "lead-id",
    "status": "created"
  }
}
```

Idempotent replay returns `200`:

```json
{
  "success": true,
  "data": {
    "id": "lead-id",
    "status": "idempotent_replay"
  }
}
```

## Validation

The public shared contract is strict. It rejects empty payloads, `workspaceId`, partial external mapping fields, and recursive secret-like keys in payload/metadata.

Accepted source values match the existing leads DB enum:

- `form`
- `email`
- `phone`
- `manual`
- `import`

The endpoint does not accept `public_intake`.

## Persistence Behavior

Within the workspace transaction:

- updates `workspace_api_keys.last_used_at`
- checks best-effort idempotency against `integration_events.payload_hash`
- validates external connection and duplicate external mapping when mapping fields are present
- creates organization/contact when provided
- creates a lead with `origin = public_lead_intake`
- creates external object mapping when provided
- creates `integration_event` with `eventType = public_lead.received`
- creates `lead.created` and `public_lead.received` activity logs

The flow stores `apiKeyId`, never plaintext API keys, key hashes, authorization headers, or raw idempotency keys.

## Idempotency

Idempotency is best-effort without a new table:

`sha256(workspaceId + ":public_lead:" + idempotencyKey)`

The hash is stored in `integration_events.payload_hash`. A replay returns the original lead id when a processed `public_lead.received` event already exists.

This is not race-proof because there is no unique database constraint for the computed hash.

## Anti-Scope Confirmed

Not implemented:

- OAuth
- HMAC signatures
- rate limiting
- jobs
- Resend/email sending
- AI
- drafts
- connector-specific HubSpot/Pipedrive/Odoo logic
- external API calls
- tenantGuard changes
- RLS bypass
- plaintext API key storage
- new idempotency table
- business deletes

## Production Validation Commands

Run before release:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Audit commands:

```sh
rg -n "routes\\.post\\(.*/events|fetch\\(|axios|\\.delete\\(" apps packages
rg -n "workspace_api_keys_public_lookup|current_api_key_hash|tenantGuard|withWorkspaceDb" apps packages docs
```

## Rollback

Application rollback removes the new route, service, repository, tests, contracts, docs, and activity action.

Database rollback:

```sql
DROP POLICY IF EXISTS "workspace_api_keys_public_lookup" ON "workspace_api_keys";
```
