# Issue 012: Organizations & Contacts Vertical Slice

## Goal

Create the minimal B2B data foundation for Syrantis Core:

- Organizations
- Contacts
- Tenant-isolated CRUD-style reads and mutations
- Transactional activity logs for all approved mutations
- Email normalization
- No physical deletes

## Schema Observed

`organizations` already exists with:

- `id`
- `workspaceId`
- `name`
- `sector`
- `websiteUrl`
- `phone`
- `email`
- `status`
- `configJson`
- `createdAt`
- `updatedAt`

Allowed organization statuses are:

- `prospect`
- `active_client`
- `inactive`
- `archived`

`contacts` already exists with:

- `id`
- `workspaceId`
- `organizationId`
- `firstName`
- `lastName`
- `email`
- `phone`
- `roleTitle`
- `optOut`
- `metadataJson`
- `createdAt`
- `updatedAt`

Contacts do not have a dedicated `status`, `archivedAt`, or equivalent archive field. Contact archive is therefore out of scope until a dedicated migration is approved. `optOut` is not archive, and `metadataJson.archivedAt` must not be used as archive.

`activityLogs` already exists with:

- `id`
- `workspaceId`
- `userId`
- `entityType`
- `entityId`
- `type`
- `severity`
- `message`
- `metadataJson`
- `createdAt`

## Routes

Organizations:

- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/organizations/:id`
- `PATCH /api/organizations/:id`
- `POST /api/organizations/:id/archive`

Contacts:

- `GET /api/contacts`
- `POST /api/contacts`
- `GET /api/contacts/:id`
- `PATCH /api/contacts/:id`

No contact archive route is approved in this issue.

## Security Rules

- All routes are protected by `tenantGuard`.
- `workspaceId` comes only from trusted server context.
- Client-provided `workspaceId` in body or query is rejected with `400`.
- Lists are always scoped by `workspaceId`.
- Detail, update, and archive reads/mutations filter by both `id` and `workspaceId`.
- Cross-workspace resources return `404`.
- Contacts linked to missing or cross-workspace organizations return `404`.
- No `DELETE` route or physical delete behavior is approved.

## Activity Logs

Approved events:

- `organization.created`
- `organization.updated`
- `organization.archived`
- `contact.created`
- `contact.updated`

`contact.archived` is not approved because the schema has no proper contact archive field.

All mutation logs must be written through `createActivityLog(tx, ...)` inside the same `withWorkspaceDb` transaction as the mutation.
