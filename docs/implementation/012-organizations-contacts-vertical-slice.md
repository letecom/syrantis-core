# Issue 012 Implementation: Organizations & Contacts Vertical Slice

## Summary

Implemented organization and contact contracts, repositories, services, routes, tests, and documentation for the minimal B2B data foundation.

## Files Created

- `packages/shared/src/contracts/organizations.ts`
- `packages/shared/src/contracts/contacts.ts`
- `apps/api/src/repositories/organizations.ts`
- `apps/api/src/repositories/contacts.ts`
- `apps/api/src/services/organizations.ts`
- `apps/api/src/services/contacts.ts`
- `apps/api/src/routes/organizations.ts`
- `apps/api/src/routes/contacts.ts`
- `apps/api/src/tests/organizations.test.ts`
- `apps/api/src/tests/contacts.test.ts`
- `docs/specs/012-organizations-contacts-vertical-slice.md`
- `docs/implementation/012-organizations-contacts-vertical-slice.md`

## Files Modified

- `packages/shared/src/contracts/index.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/routes/index.ts`

## Schema Notes

No schema or migration changes were made.

`organizations.status` supports `archived`, so organization archive is implemented as a status transition.

`contacts` has no dedicated archive field. Contact archive is intentionally not implemented and no route was mounted.

Organization API maps `metadata` to `organizations.configJson`.

Contact API maps `metadata` to `contacts.metadataJson`.

## Routes Added

- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/organizations/:id`
- `PATCH /api/organizations/:id`
- `POST /api/organizations/:id/archive`
- `GET /api/contacts`
- `POST /api/contacts`
- `GET /api/contacts/:id`
- `PATCH /api/contacts/:id`

## Activity Logs Added

- `organization.created`
- `organization.updated`
- `organization.archived`
- `contact.created`
- `contact.updated`

`contact.archived` was not added because contact archive is out of scope without a schema-backed archive field.

## Tests Added

Organization tests cover:

- unauthorized access
- create
- `workspaceId` rejection
- tenant-scoped list
- detail
- update
- cross-workspace 404
- archive
- transactional activity log calls for create, update, and archive

Contact tests cover:

- unauthorized access
- create with normalized email
- create linked to organization
- missing or cross-workspace organization 404
- `workspaceId` rejection
- tenant-scoped list
- organization-filtered list
- detail
- update
- cross-workspace 404
- no contact archive route
- transactional activity log calls for create and update

## Risks

The contact archive workflow needs a future migration with a dedicated field such as `status` or `archivedAt` before it can be exposed safely.

## Rollback

Rollback can remove the new contracts, repositories, services, routes, tests, docs, and route mounts. No database rollback is required because no schema changes were made.
