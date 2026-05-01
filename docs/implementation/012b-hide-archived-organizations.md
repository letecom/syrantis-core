# Issue 012B Implementation: Hide Archived Organizations

## Summary

Archived organizations are now hidden from organization list, detail, and update operations at the repository layer.

## Files Changed

- `apps/api/src/repositories/organizations.ts`
- `apps/api/src/tests/organizations.test.ts`
- `docs/specs/012b-hide-archived-organizations.md`
- `docs/implementation/012b-hide-archived-organizations.md`

## Implementation

`organizationFilters` now includes `status != 'archived'`. This applies to:

- `listOrganizations`
- `findOrganizationById`
- `updateOrganization`
- `archiveOrganization` lookup

`archiveOrganization` still updates a non-archived organization to `status = 'archived'`, writes `organization.archived` through `createActivityLog(tx, ...)`, and returns the archived row.

## Tests

Added organization route regressions for:

- archive then detail returns `404`
- archive then list omits the organization
- patch archived organization returns `404`

Existing activity log coverage for `organization.archived` remains in place.

## Schema

No schema or migration changes were made.

## Rollback

Remove the archived-status filter from `organizationFilters` and remove the 012B regression tests/docs.
