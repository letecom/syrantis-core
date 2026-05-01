# Issue 012B: Hide Archived Organizations

## Goal

Archived organizations must be invisible by default from the organization API.

## Behavior

An organization archived through `POST /api/organizations/:id/archive` keeps using the existing schema-backed status transition:

- `status = 'archived'`

No physical delete is allowed.

After archive:

- `GET /api/organizations/:id` returns `404`.
- `GET /api/organizations` does not include the archived organization.
- `PATCH /api/organizations/:id` returns `404`.

The archive endpoint itself may find a non-archived organization, set `status = 'archived'`, write `organization.archived` in the same transaction, and return the archived object.

## Repository Rules

Organization repository reads and updates must filter out archived rows for:

- list organizations
- find organization by id
- update organization

Archive must also target only non-archived organizations so repeated archive calls behave as not found.

## Non-Goals

- No schema change.
- No migration.
- No RLS.
- No DELETE SQL.
- No contacts behavior change.
