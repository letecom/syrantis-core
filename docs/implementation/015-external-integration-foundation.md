# 015 - External Integration Foundation Implementation

## Changed files

- `packages/db/src/schema.ts`
- `packages/db/migrations/0006_external_integration_foundation.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/shared/src/contracts/integrations.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/integrations.ts`
- `apps/api/src/services/integrations.ts`
- `apps/api/src/routes/integrations.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/integrations.test.ts`
- `docs/specs/015-external-integration-foundation.md`
- `docs/implementation/015-external-integration-foundation.md`

## Migration name

`0006_external_integration_foundation`

## Tables created

- `external_connections`
- `external_object_mappings`
- `integration_events`

## Policies created

- `tenant_isolation_external_connections`
- `tenant_isolation_external_object_mappings`
- `tenant_isolation_integration_events`

## Routes created

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

## Activity log actions

- `external_connection.created`
- `external_connection.updated`
- `external_connection.archived`
- `external_object_mapping.created`
- `external_object_mapping.updated`
- `external_object_mapping.archived`

## Integration events behavior

Integration mutations now emit internal `integration_events` records for connection and mapping create/update/archive actions. These events are not exposed as public mutation endpoints.

## Tests passed

- pending validation

## Audit results

- pending validation

## Risks / non-goals

- no external API or connector implementation
- no OAuth or token storage
- no public webhooks
- no change to tenant guard or auth behavior
- no AI/draft/job/UI implementation

## Production validation plan

- run `pnpm test`
- run `pnpm typecheck`
- run `pnpm lint`
- run `pnpm build`
- verify `node -e "import('./apps/api/dist/index.js')..."` imports without `DATABASE_URL`
- review migration file and RLS policies
- confirm no SSH or webhook routes were added
