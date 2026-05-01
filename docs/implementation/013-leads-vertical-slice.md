# Issue 013 Implementation: Leads Vertical Slice

## Summary

Implemented leads contracts, repository, service, routes, tests, and documentation.

## Files Created

- `packages/shared/src/contracts/leads.ts`
- `apps/api/src/repositories/leads.ts`
- `apps/api/src/services/leads.ts`
- `apps/api/src/routes/leads.ts`
- `apps/api/src/tests/leads.test.ts`
- `docs/specs/013-leads-vertical-slice.md`
- `docs/implementation/013-leads-vertical-slice.md`

## Files Modified

- `packages/shared/src/contracts/index.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/routes/index.ts`

## Schema Leads Observed

Columns:

- `id`
- `workspaceId`
- `organizationId`
- `contactId`
- `source`
- `status`
- `rawContent`
- `normalizedJson`
- `score`
- `scoreReason`
- `receivedAt`
- `createdAt`
- `updatedAt`

Statuses:

- `new`
- `scored`
- `drafted`
- `responded`
- `lost`
- `won`

Sources:

- `email`
- `form`
- `phone`
- `manual`
- `import`

Relations:

- `organizationId`
- `contactId`

No `opportunityId` exists on `leads`.

JSON:

- `normalizedJson`, mapped to API `metadata`

Archive:

- No `archived` status and no dedicated archive field. Lead archive is not implemented.

## Routes Created

- `GET /api/leads`
- `POST /api/leads`
- `GET /api/leads/:id`
- `PATCH /api/leads/:id`

## Activity Logs Added

- `lead.created`
- `lead.updated`

Both are written through `createActivityLog(tx, ...)` inside the same `withWorkspaceDb` transaction as the mutation.

## Tests Added

Lead tests cover:

- unauthorized access
- create
- `workspaceId` rejection
- tenant-scoped list
- detail
- cross-workspace detail 404
- update
- cross-workspace update 404
- contact ownership failure
- organization ownership failure
- transactional activity log calls for create and update
- empty update body 400
- invalid status 400

## Deviations

No archive route or `lead.archived` event was added because the database schema does not support lead archive safely.

No AI, scoring mutation, draft, Resend, job, webhook, automatic task, automatic approval, automatic opportunity, or inline organization/contact creation was implemented.

## Production Validation Curl

```bash
curl -i -b "syrantis_session=<SESSION_COOKIE>" \
  https://<API_HOST>/api/leads

curl -i -X POST -b "syrantis_session=<SESSION_COOKIE>" \
  -H "content-type: application/json" \
  https://<API_HOST>/api/leads \
  -d '{"source":"manual","rawContent":"Client demande un devis chauffage.","organizationId":"<ORG_ID>","contactId":"<CONTACT_ID>"}'

curl -i -X PATCH -b "syrantis_session=<SESSION_COOKIE>" \
  -H "content-type: application/json" \
  https://<API_HOST>/api/leads/<LEAD_ID> \
  -d '{"status":"responded"}'
```

## Rollback

Remove the new lead contracts, repository, service, route, tests, docs, activity-log contract entries, route mount, and contracts export. No database rollback is required.
