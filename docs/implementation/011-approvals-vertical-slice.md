# Issue 011: Approvals Vertical Slice Implementation

## Files Created/Modified

- `packages/shared/src/contracts/approvals.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/approvals.ts`
- `apps/api/src/services/approvals.ts`
- `apps/api/src/routes/approvals.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/approvals.test.ts`
- `docs/specs/011-approvals-vertical-slice.md`
- `docs/implementation/011-approvals-vertical-slice.md`

## Schema Approval Observed

The existing `approvals` table supports the slice without migration:

- `id`
- `workspaceId`
- `entityType`
- `entityId`
- `draftId`
- `taskId`
- `approvalType`
- `status`
- `requestedBy`
- `approvedBy`
- `approvedAt`
- `rejectedBy`
- `rejectedAt`
- `rejectionReason`
- `riskLevel`
- `metadataJson`
- `createdAt`
- `updatedAt`

Status check allows `pending`, `approved`, `rejected`, `expired`, and `revoked`.

## Routes Added

- `GET /api/approvals`
- `POST /api/approvals`
- `GET /api/approvals/:id`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

No `PATCH /api/approvals/:id` route was added.

## Output Shape

- `ApprovalOutput` exposes `rejectionReason` as a top-level nullable field.
- `mapApprovalRow` maps `approvals.rejectionReason` to that field.
- Rejection reasons are not returned inside `metadata`.

## Activity Log Events Added

- `approval.created`
- `approval.approved`
- `approval.rejected`

`ActivityLogEntityTypeSchema` now includes `approval`.

## Transactional Behavior

- `createApproval` verifies the task exists in the same workspace inside the `withWorkspaceDb` transaction.
- `createApproval` writes `approval.created` in the same transaction.
- `approveApproval` only transitions `pending -> approved` and writes `approval.approved` in the same transaction.
- `rejectApproval` only transitions `pending -> rejected` and writes `approval.rejected` in the same transaction.
- Non-pending approvals return conflict and do not mutate.

## Tests Added

- Unauthenticated list returns `401`.
- Create approval returns pending approval.
- Create rejects client `workspaceId`.
- Create with missing task returns `404`.
- List returns current workspace approvals only.
- List filters by `taskId`.
- Detail returns current workspace approval.
- Detail for another workspace returns `404`.
- Approve transitions pending to approved.
- Reject transitions pending to rejected.
- Approve already approved returns `409`.
- Reject already approved returns `409`.

## Commands Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git status --short`
- `git status --short | grep -E 'packages/db/src/schema.ts|packages/db/src/migrate.ts|packages/db/migrations|apps/api/src/middleware/tenant.ts|apps/api/src/routes/auth.ts|apps/api/src/routes/tasks.ts|apps/api/src/repositories/tasks.ts|ops/docker|apps/web|(^|/)\\.env|Caddyfile|Dockerfile' || true`
- `grep -R "password\\|token\\|cookie\\|secret" apps/api/src/repositories/approvals.ts apps/api/src/services/approvals.ts apps/api/src/routes/approvals.ts packages/shared/src/contracts/approvals.ts || true`
- `grep -R "ENABLE ROW LEVEL SECURITY\\|FORCE ROW LEVEL SECURITY\\|CREATE POLICY" apps/api/src packages/shared/src docs/specs/011-approvals-vertical-slice.md docs/implementation/011-approvals-vertical-slice.md || true`
- `git status --short | grep -E 'packages/db/migrations|packages/db/src/schema.ts' || true`
- `grep -R 'routes.route("/api/approvals"' apps/api/src/routes/index.ts`
- `grep -R "approval.created\\|approval.approved\\|approval.rejected" packages/shared/src/contracts/activity-logs.ts apps/api/src/repositories/approvals.ts docs/specs/011-approvals-vertical-slice.md docs/implementation/011-approvals-vertical-slice.md`
- `grep -R "workspaceId" packages/shared/src/contracts/approvals.ts apps/api/src/routes/approvals.ts apps/api/src/repositories/approvals.ts apps/api/src/services/approvals.ts`
- `grep -R "createActivityLog(tx" apps/api/src/repositories/approvals.ts`
- Direct DB/raw SQL/delete grep across `apps/api/src/repositories/approvals.ts`, `apps/api/src/services/approvals.ts`, and `apps/api/src/routes/approvals.ts`.

## Checks Result

- `pnpm test`: passed, 7 test files and 40 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Import safety without `DATABASE_URL`: passed with `API_IMPORT_OK`.

## Audits Result

- Forbidden scope audit: no output.
- Secret grep across approval route/service/repository/contracts: no output.
- RLS grep: no output.
- No migration/schema audit: no output.
- Approval route mount found in `apps/api/src/routes/index.ts`.
- Approval activity events found in shared contracts, repository, and docs.
- `workspaceId` audit: input contracts do not accept `workspaceId`; route rejects client `workspaceId`; services and repositories use server-passed `workspaceId`.
- `createActivityLog(tx, ...)` appears three times in approvals repository.
- Direct DB/raw SQL/delete audit in approvals route/service/repository: no output.

## Known Deviations

- Activity log transaction behavior is validated structurally by code path and grep, not with a real DB transaction test. This avoids introducing a DB-backed test suite for this issue.

## Risks Remaining

- Approval v1 is task-bound only.
- No permission model beyond authenticated tenant context.
- No draft/email/job integration exists yet.
- `expired` and `revoked` are exposed because the current DB constraint allows them, but routes only create `pending` and transition to `approved` or `rejected`.

## Manual Production Validation

```sh
# 1. Login and keep syrantis_session.
# 2. Create or reuse a task id.

curl -i -X POST http://127.0.0.1:8787/api/approvals \
  --cookie 'syrantis_session=<token>' \
  -H 'content-type: application/json' \
  --data '{"taskId":"<task_id>"}'

curl -i http://127.0.0.1:8787/api/approvals/<approval_id> \
  --cookie 'syrantis_session=<token>'

curl -i -X POST http://127.0.0.1:8787/api/approvals/<approval_id>/approve \
  --cookie 'syrantis_session=<token>'

curl -i "http://127.0.0.1:8787/api/activity-logs?entityType=approval&entityId=<approval_id>" \
  --cookie 'syrantis_session=<token>'
```
