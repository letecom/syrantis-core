# Issue 014B1 Implementation: Task Relationship Ownership Hardening

## Files Changed

- `packages/shared/src/contracts/tasks.ts`
- `apps/api/src/repositories/tasks.ts`
- `apps/api/src/services/tasks.ts`
- `apps/api/src/routes/tasks.ts`
- `apps/api/src/tests/mocks/tasks.ts`
- `apps/api/src/tests/tasks.test.ts`
- `docs/specs/014B1-task-relationship-ownership.md`
- `docs/implementation/014B1-task-relationship-ownership.md`

## Final Validation Strategy

Task relationship validation now happens in `apps/api/src/repositories/tasks.ts` inside the same `withWorkspaceDb` transaction as the create/update mutation.

Create:

- Builds the final relationship state from request input.
- Validates non-null `organizationId`, `contactId`, `leadId`, and `opportunityId`.
- Returns `not_found` for missing or cross-workspace relations.
- Returns `invalid_relation` for same-workspace inconsistency.
- Inserts and logs only after validation succeeds.

Update:

- Loads the existing task inside the mutation transaction.
- If no relationship fields are present, it does not re-run relationship validation.
- If any relationship field is present, it merges existing relationship values with provided values, including explicit `null`, validates that final state, then updates.
- Writes `task.updated` only after validation and mutation succeed.

The service maps repository results to task outputs or explicit mutation outcomes. The route maps:

- `not_found` -> `404 TASK_NOT_FOUND`
- `invalid_relation` -> `400 INVALID_REQUEST`

No `403` or `409` was added.

## Relationship Rules Implemented

- `contactId + organizationId`: `contact.organizationId` must match when both are non-null.
- `leadId + organizationId`: `lead.organizationId` must match when both are non-null and the lead has an organization.
- `leadId + contactId`: `lead.contactId` must match when both are non-null and the lead has a contact.
- `opportunityId + organizationId`: `opportunity.organizationId` must match when both are non-null and the opportunity has an organization.
- `opportunityId + contactId`: `opportunity.contactId` must match when both are non-null and the opportunity has a contact.
- `opportunityId + leadId`: `opportunity.leadId` must match when both are non-null and the opportunity has a lead.

Archived organizations are treated as not found for task relationship validation.

## Contract Updates

Task contracts now support:

- `organizationId` on create
- `organizationId`, `contactId`, `leadId`, and `opportunityId` as nullable optional PATCH fields
- `organizationId` in task output

This was necessary to support the required PATCH null-clearing semantics.

## Tests Added

Extended `apps/api/src/tests/tasks.test.ts` and task mocks to cover:

- POST task with cross-workspace `organizationId` returns `404`.
- POST task with cross-workspace `contactId` returns `404`.
- POST task with cross-workspace `leadId` returns `404`.
- POST task with cross-workspace `opportunityId` returns `404`.
- POST task with same-workspace mismatched `contactId + organizationId` returns `400`.
- POST task with same-workspace mismatched `leadId + organizationId` returns `400`.
- POST task with same-workspace mismatched `leadId + contactId` returns `400`.
- PATCH changing `organizationId` while existing `contactId` becomes inconsistent returns `400`.
- PATCH changing unrelated fields still works.
- PATCH setting relation field to `null` clears the relation.
- Failed create validation does not write `task.created`.
- Failed update validation does not write `task.updated`.

Existing task route behavior still passes.

## Checks Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`

## Risks And Non-Goals

Risks:

- Task outputs now include `organizationId`; API consumers should tolerate the additive field.
- Existing inconsistent task rows, if any already exist, are not backfilled by this issue. They are prevented on future relationship-changing create/update paths.

Non-goals:

- No migration or schema change.
- No RLS activation or policy creation.
- No activity log nullability fix.
- No new business workflow.

## Forbidden Scope Confirmation

Not touched:

- RLS activation
- Migrations
- Drizzle schema
- Auth
- `tenantGuard`
- `withWorkspaceDb`
- Resend
- Jobs
- AI
- Drafts
- Webhooks
- UI

No raw SQL or business `.delete()` was added.
