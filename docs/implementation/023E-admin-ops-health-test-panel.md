# 023E Admin Ops Health & Test Panel Implementation

## Summary

Implemented a bounded founder/admin operations panel at `/app/ops`.

The feature adds safe health and diagnostic checks only. It does not provide restart, shell
execution, arbitrary SQL, logs, migrations, charts, env editing, or runtime deployment controls.

## Files Changed

- `packages/shared/src/contracts/admin-ops.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/admin-ops.ts`
- `apps/api/src/services/admin-ops.ts`
- `apps/api/src/routes/admin-ops.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/admin-ops.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/OpsPage.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/src/App.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023E-admin-ops-health-test-panel.md`
- `docs/implementation/023E-admin-ops-health-test-panel.md`
- `README.md`

No migration files, new tables, Caddy files, Docker files, production env files, webhook runtime,
replay runtime, worker runtime, or Google Sheets pushback runtime files were changed.

## Backend

Added:

- `GET /api/admin/ops/health`
- `POST /api/admin/ops/checks/:checkId`
- `GET /api/admin/ops/checks/recent`

Allowed checks:

- `api-health`
- `db-health`
- `google-sheets-status`
- `google-sheets-test`
- `worker-queue-summary`

`GET /health` reads safe API, DB, Google Sheets setup, and worker queue status without writing an
activity log and without calling Google.

`POST /checks/:checkId` accepts only the route-path whitelist. Unknown checks return `400`.

Each POST writes one `admin_ops` activity log with safe metadata:

- source
- check ID
- result
- diagnostic trace ID
- duration
- optional safe error code/summary
- safe worker counts where applicable

`google-sheets-status` reuses the existing setup-status service directly.

`google-sheets-test` reuses the existing setup-test service directly and adds a 5 minute cooldown
that returns `skipped` with `OPS_CHECK_COOLDOWN`.

`worker-queue-summary` reads only aggregate counts and oldest pending age. It does not select job
IDs, payloads, locks, attempts, raw errors, or scheduled details.

## Frontend

Added `/app/ops` and the sidebar link `Ops`.

The page shows:

- API, Database, Google Sheets, and Worker Queue health cards
- five manual check buttons
- last result panel
- recent checks table

All calls go through `apps/web/src/lib/api-client.ts` using `credentials: "include"`. The frontend
sends no bearer token, tenant identifier, or provider call.

## Safety

The implementation does not expose:

- credentials or Google credential JSON
- `private_key` or `client_email`
- full spreadsheet IDs
- raw Google/provider errors
- raw metadata or payload dumps
- provider message IDs
- subject/body/contact/lead fields
- activity log IDs, actor IDs, or tenant IDs

## Checks Added

API tests cover session/admin enforcement, safe health DTOs, all allowed checks, unknown checks,
cooldown, exactly one admin ops activity log per POST, safe metadata, worker queue payload safety,
recent checks mapping, limit cap, and invalid check ID rejection.

Web tests cover `/app/ops`, sidebar link, health cards, check buttons, button locking, success and
skipped/failure rendering, recent checks table, and forbidden string non-rendering.

## Rollback

Rollback is code-only:

- remove the admin ops route registration, service, repository, and shared contracts
- remove the `/app/ops` page, sidebar link, and api-client methods
- remove the added tests and docs

No database rollback is required.
