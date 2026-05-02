# 015 - External Integration Foundation

## Objective

Create the internal foundation for future external CRM and tool integrations without implementing any real connector.

## Strategic positioning

Syrantis is designed to sit above existing CRM and business tools as an AI action layer. The integration foundation must support:

- receiving external leads and objects later
- mapping external objects to Syrantis canonical objects
- preparing AI actions later
- requiring human approvals later
- executing actions later
- writing proof and logs back later

This foundation must not turn Syrantis into a CRM competitor or implement any real external connector.

## Tables

### external_connections

Fields:

- `id`
- `workspace_id`
- `provider`
- `name`
- `status`
- `auth_type`
- `external_account_id`
- `external_account_label`
- `config_json`
- `metadata_json`
- `last_sync_at`
- `created_at`
- `updated_at`

Indexes:

- `workspace_id`
- `provider`
- `status`
- `created_at`

### external_object_mappings

Fields:

- `id`
- `workspace_id`
- `connection_id`
- `external_object_type`
- `external_object_id`
- `syrantis_entity_type`
- `syrantis_entity_id`
- `sync_direction`
- `sync_status`
- `external_url`
- `external_updated_at`
- `last_seen_at`
- `metadata_json`
- `created_at`
- `updated_at`

Indexes:

- `workspace_id`
- `connection_id`
- `syrantis_entity_type, syrantis_entity_id`
- `external_object_type, external_object_id`
- `created_at`

Unique index:

- `workspace_id, connection_id, external_object_type, external_object_id, syrantis_entity_type`

### integration_events

Fields:

- `id`
- `workspace_id`
- `connection_id`
- `mapping_id`
- `direction`
- `event_type`
- `status`
- `external_object_type`
- `external_object_id`
- `syrantis_entity_type`
- `syrantis_entity_id`
- `message`
- `payload_hash`
- `metadata_json`
- `created_at`

Indexes:

- `workspace_id`
- `connection_id`
- `mapping_id`
- `event_type`
- `status`
- `created_at`

## Routes

The new protected router mounts at:

- `/api/integrations`

Routes:

- `GET /api/integrations/connections`
- `POST /api/integrations/connections`
- `GET /api/integrations/connections/:id`
- `PATCH /api/integrations/connections/:id`
- `POST /api/integrations/connections/:id/archive`
- `GET /api/integrations/mappings`
- `POST /api/integrations/mappings`
- `GET /api/integrations/mappings/:id`
- `PATCH /api/integrations/mappings/:id`
- `POST /api/integrations/mappings/:id/archive`
- `GET /api/integrations/events`

## Anti-scope

This issue explicitly excludes:

- any real external connector implementation
- HubSpot, Pipedrive, Odoo, Zoho, Sellsy, Google Sheets, Airtable, Notion, Make, Zapier integrations
- OAuth
- secret/API key/token storage
- public webhook routes
- AI/draft/job/UI implementation
- authentication changes
- tenant guard changes
- modifying existing business behavior

## RLS

All three new tables are created with:

- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- `tenant_isolation_<table>` policies

The tenant policy uses `app.current_workspace_id` and enforces workspace-scoped access.

## Secret policy

Client payloads are rejected when `config_json` or `metadata_json` contain secret-like keys such as:

- `apiKey`, `api_key`
- `token`, `accessToken`, `access_token`, `refreshToken`, `refresh_token`
- `password`
- `secret`, `clientSecret`, `client_secret`
- `bearer`, `authorization`
- `privateKey`, `private_key`

## Mapping validation

Mapping creation and update validate:

- the target connection belongs to the current workspace and is not archived
- the target canonical entity exists in the same workspace
- `syrantis_entity_type` is only one of `organization`, `contact`, `lead`, `task`, `approval`
- `organization` target treats archived organizations as not found
- duplicates for the same external object, connection, and entity type return `409`

## Integration events behavior

Repository mutations create internal integration event records for:

- `external_connection.created`
- `external_connection.updated`
- `external_connection.archived`
- `external_object_mapping.created`
- `external_object_mapping.updated`
- `external_object_mapping.archived`

These events are internal observability records. No public route creates events directly.

## Activity logs

The foundation extends activity logs to support actions:

- `external_connection.created`
- `external_connection.updated`
- `external_connection.archived`
- `external_object_mapping.created`
- `external_object_mapping.updated`
- `external_object_mapping.archived`

Activity logs are written transactionally during connection and mapping mutations.

## Rollback

If this feature needs rollback, revert:

- `packages/db/migrations/0006_external_integration_foundation.sql`
- updates to `packages/db/src/schema.ts`
- route, service, repository, and contract files for integrations
- activity log schema extension
- docs and tests

## Validation plan

- lint and typecheck the repo
- run `pnpm test`
- verify API app imports without `DATABASE_URL`
- inspect the migration and schema definitions
- confirm no new public webhook or external connector routes exist
