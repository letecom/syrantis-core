# Issue 016B - Public Lead Intake Foundation

## Goal

Create a controlled public backend intake endpoint for external lead sources:

`POST /api/public/leads`

The endpoint accepts leads from forms, Make/Zapier, Google Sheets, CRM automations, or future connectors. Syrantis remains a B2B AI orchestration backend above existing client tools, not a generic CRM.

## Auth

Clients authenticate with:

`Authorization: Bearer syr_live_<plaintext_api_key>`

The endpoint does not use `tenantGuard`. It hashes the plaintext API key with SHA-256, looks up an active workspace API key through the public RLS lookup policy, then runs every business read and write inside `withWorkspaceDb(workspaceId, tx => ...)`.

Plaintext API keys, key hashes, authorization headers, and raw idempotency keys must never be logged or stored by this flow.

## RLS Lookup

`workspace_api_keys` is under `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. A normal lookup by `key_hash` without `app.current_workspace_id` cannot see rows.

Issue 016B adds a permissive SELECT policy:

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

The API uses `withApiKeyLookupDb(apiKeyHash, fn)` to set `app.current_api_key_hash` transactionally. It never sets `app.current_workspace_id` during the lookup and never bypasses RLS.

## Request Contract

Payload is strict and may include:

- `email`
- `firstName`
- `lastName`
- `phone`
- `organizationName`
- `source`: `form`, `email`, `phone`, `manual`, or `import`, default `form`
- `message`, max 2000
- `externalConnectionId`
- `externalObjectType`, max 80
- `externalObjectId`, max 255
- `metadata`

The payload is accepted only when it contains at least one lead signal:

- `email`
- `phone`
- `message`
- `firstName` plus `organizationName`

`workspaceId` in body or query is rejected. `source = public_intake` is not accepted because the current DB enum does not include it.

## Secret Rejection

The route rejects payload or metadata keys containing:

`token`, `password`, `secret`, `api_key`, `apikey`, `private_key`, `authorization`, `bearer`, `client_secret`, `refresh_token`, `access_token`

The rejection is recursive and occurs before persistence.

## Lead Creation

Every accepted non-idempotent request creates a lead.

Minimal behavior:

- Create an organization when `organizationName` is present, with `status = prospect`.
- Create a contact when contact fields are present, linked to the organization if one was created.
- Create a lead linked to created organization/contact when available.
- Store `origin = public_lead_intake` in normalized metadata.

No deduplication, merge, AI, drafts, emails, jobs, OAuth, HMAC, or rate limiting are in scope.

## External Mapping

When `externalConnectionId`, `externalObjectType`, and `externalObjectId` are all present:

- Verify the external connection exists in the current workspace and is not archived.
- Return generic 404 when not found.
- Return 409 for duplicate mapping.
- Create an inbound active `external_object_mapping` linked to the new lead.

If only some mapping fields are provided, return invalid request.

## Integration Event

For every newly processed lead, create an `integration_event`:

- `direction = inbound`
- `eventType = public_lead.received`
- `status = processed`
- entity type/id for the lead
- mapping fields when available
- `payloadHash` when idempotency is used

Metadata is limited to `origin`, `apiKeyId`, and optional hashed idempotency information.

## Idempotency

When `Idempotency-Key` is present, compute:

`sha256(workspaceId + ":public_lead:" + idempotencyKey)`

Before writing a new lead, look for a processed `integration_event` with:

- `eventType = public_lead.received`
- `payloadHash = idempotencyHash`
- `syrantisEntityType = lead`
- `syrantisEntityId` present

If found, return `200` with `status = idempotent_replay` and the existing lead id.

This is best-effort idempotency. It does not add a unique DB constraint or new idempotency table, so it is not race-proof under concurrent identical requests.

## Activity Logs

Create `public_lead.received` for the new lead with limited metadata:

- `source = public_lead_intake`
- `apiKeyId`
- optional external mapping identifiers

Do not log raw payloads or secret-bearing values.

## Responses

Created:

```json
{
  "success": true,
  "data": {
    "id": "lead-id",
    "status": "created"
  }
}
```

Idempotent replay:

```json
{
  "success": true,
  "data": {
    "id": "lead-id",
    "status": "idempotent_replay"
  }
}
```

Errors use `ApiErrorSchema`.

## Production Validation

Run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git diff --check`

Audit:

- no public POST events route
- no external `fetch` or `axios`
- no business `.delete()`
- no secrets stored or logged
- no raw SQL outside DB setting helper and migration
- RLS policy `workspace_api_keys_public_lookup` exists
- no tenantGuard change
- no `withWorkspaceDb` behavior regression

## Rollback

Rollback removes the route, service, repository, shared contract, activity log action, docs, and migration policy. If migration rollback is needed manually:

```sql
DROP POLICY IF EXISTS "workspace_api_keys_public_lookup" ON "workspace_api_keys";
```
