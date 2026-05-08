# 023H Worker Queue Failed Job Review Implementation

## Summary

Implemented `worker-failed-summary` as a minimal extension to the existing Admin Ops Panel.

The check helps distinguish historical worker debt from active failed-job risk without exposing job
payloads, raw errors, locks, job IDs, provider details, prompts, AI output, or business content.

## Files Changed

- `packages/shared/src/contracts/admin-ops.ts`
- `apps/api/src/repositories/admin-ops.ts`
- `apps/api/src/services/admin-ops.ts`
- `apps/api/src/tests/admin-ops.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/OpsPage.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023H-worker-queue-failed-job-review.md`
- `docs/implementation/023H-worker-queue-failed-job-review.md`
- `docs/runbooks/worker-failed-jobs-review.md`
- `README.md`

No migration files, Caddy files, Docker files, systemd files, production env files, webhook routes,
pushback services, or email runtime files were changed.

## Backend

Added `worker-failed-summary` to the Admin Ops check whitelist.

The check runs through the existing endpoint:

- `POST /api/admin/ops/checks/worker-failed-summary`

The repository reads only aggregate safe data from `background_jobs` where `status = failed`:

- type
- count
- min attempts
- max attempts
- oldest created timestamp
- latest updated timestamp

The service maps those aggregates into:

- total failed
- status `ok` or `degraded`
- groups by type
- age bucket
- interpretation and recommended next action

Each POST writes exactly one `admin_ops` activity log. For this check, metadata is restricted to
the safe aggregate fields documented in the spec.

## Frontend

Added a `Worker Failed Summary` button to `/app/ops`.

The last-result panel renders safe aggregate rows and compact group cards by type:

- count
- attempt range
- oldest created timestamp
- latest updated timestamp
- age bucket

The UI does not add a worker dashboard, polling, auto-refresh, raw JSON view, token storage,
client-provided workspace ID, or direct provider/API fetch outside `api-client`.

## Safety

The implementation does not expose or store:

- job IDs
- payloads or `payload_json`
- locks
- raw errors or stack traces
- prompts or AI output
- lead, contact, email, or provider content
- workspace IDs in client DTOs or exposed metadata

## Tests

API tests cover:

- whitelist acceptance for `worker-failed-summary`
- unknown check rejection
- zero failed jobs
- historical failed jobs
- fresh/recent failed jobs
- unsafe worker fields staying out of responses and metadata
- exactly one `admin_ops` activity log
- safe activity log metadata
- recent checks mapping
- existing check coverage

Web tests cover:

- the new Ops check button
- api-client POST path
- disabled state while running through the shared check flow
- rendering total failed, status, type groups, and next action
- forbidden string non-rendering
- recent checks continuity

## Rollback

Rollback is code-only:

- remove `worker-failed-summary` from shared/web check ID schemas
- remove the worker failed aggregate repository method
- remove the service interpretation branch and metadata mapping
- remove the Ops button/group rendering
- remove 023H tests and docs

No database rollback is required.
