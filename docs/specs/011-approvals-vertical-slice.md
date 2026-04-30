# Issue 011: Approvals Vertical Slice

## Objective

Create a minimal task-bound approvals layer for Syrantis Core.

Approval v1 is intentionally tied to an existing task and establishes the human decision barrier needed before future drafts, emails, or jobs.

## Schema Audit

The existing `approvals` table in `packages/db/src/schema.ts` is usable without migration.

Observed shape:

- `id`
- `workspaceId` mapped to `workspace_id`, not null
- `taskId` mapped to `task_id`, nullable
- `status`, default `pending`
- `approvedBy` mapped to `approved_by`, nullable
- `approvedAt` mapped to `approved_at`, nullable
- `rejectedBy` mapped to `rejected_by`, nullable
- `rejectedAt` mapped to `rejected_at`, nullable
- `rejectionReason` mapped to `rejection_reason`, nullable
- `metadataJson` mapped to `metadata_json`
- `createdAt` mapped to `created_at`
- `updatedAt` mapped to `updated_at`

Visible status check constraint:

- `pending`
- `approved`
- `rejected`
- `expired`
- `revoked`

## Business Value

Approvals add the first explicit human barrier in the business backend. This supports the wedge principle that generated work must be human-approved before any future external side effects.

## Scope

- Add shared approval contracts.
- Add protected `/api/approvals` routes.
- Add approvals repository and service.
- Validate that approvals are task-bound.
- Create approvals only for tasks in the current workspace.
- Support status transitions:
  - `pending -> approved`
  - `pending -> rejected`
- Write transactional activity logs for:
  - `approval.created`
  - `approval.approved`
  - `approval.rejected`

## Non-Scope

- No schema change.
- No migration.
- No task status mutation.
- No drafts.
- No email.
- No jobs.
- No RLS.
- No UI.
- No permissions model.
- No `PATCH /api/approvals/:id`.
- No generic `resourceType/resourceId` abstraction.

## Routes

All routes are mounted under `/api/approvals` and protected by `tenantGuard`.

- `GET /`
  - Query: `taskId`, `status`, `limit`, `offset`
- `POST /`
  - Body: `taskId`, optional `metadata`
  - Rejects client `workspaceId`
  - Returns `201`
- `GET /:id`
  - UUID id required
  - Cross-workspace returns `404`
- `POST /:id/approve`
  - Empty body tolerated
  - Non-pending approval returns `409 APPROVAL_NOT_PENDING`
- `POST /:id/reject`
  - Body: optional `reason`
  - Returns `rejectionReason` as a top-level output field when present
  - Non-pending approval returns `409 APPROVAL_NOT_PENDING`

## Output Shape

`ApprovalOutput` returns `rejectionReason` as a first-class nullable field from `approvals.rejection_reason`.

Rejection reasons are not stored inside `metadata`.

## Tenant Invariants

- `workspaceId` comes only from `tenantGuard` context.
- Repositories receive `workspaceId` explicitly.
- Repositories do not import Hono `Context`.
- Reads and updates by id filter by `id + workspaceId`.
- Cross-workspace approvals are invisible and return `404`.
- Client-provided `workspaceId` is rejected.

## Transaction Invariants

- `createApproval` checks the task exists in the same workspace inside the same transaction.
- `approval.created`, `approval.approved`, and `approval.rejected` logs are written with the same transaction as the approval mutation.
- If the activity log insert fails, the approval mutation rolls back.
- No fire-and-forget or best-effort logging.

## Acceptance Criteria

- Approval contracts are exported.
- Approval routes are protected by `tenantGuard`.
- Create/list/get/approve/reject routes exist.
- No `PATCH /api/approvals/:id`.
- No schema or migration changes.
- No RLS.
- No drafts, emails, jobs, or UI.
- Activity log contracts include approval actions and entity type.
- Tests cover auth, create, missing task, workspace isolation, filters, detail, approve, reject, and conflicts.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and import safety pass.

## Manual Production Validation

```sh
# Login and keep syrantis_session.
curl -i -X POST http://127.0.0.1:8787/api/approvals \
  --cookie 'syrantis_session=<token>' \
  -H 'content-type: application/json' \
  --data '{"taskId":"<task_id>"}'

curl -i http://127.0.0.1:8787/api/approvals \
  --cookie 'syrantis_session=<token>'

curl -i -X POST http://127.0.0.1:8787/api/approvals/<approval_id>/approve \
  --cookie 'syrantis_session=<token>'

curl -i -X POST http://127.0.0.1:8787/api/approvals/<approval_id>/reject \
  --cookie 'syrantis_session=<token>' \
  -H 'content-type: application/json' \
  --data '{"reason":"Not ready"}'

curl -i "http://127.0.0.1:8787/api/activity-logs?entityType=approval&entityId=<approval_id>" \
  --cookie 'syrantis_session=<token>'
```
