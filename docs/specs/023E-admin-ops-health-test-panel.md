# 023E - Admin Ops Health & Test Panel

## Summary

Add a minimal founder/admin operations panel at `/app/ops` with bounded health checks only.

The panel is an internal diagnostic surface. It cannot restart services, execute shell commands,
run arbitrary SQL, inspect logs, run migrations, edit env, or expose raw provider/business data.

## Backend Routes

- `GET /api/admin/ops/health`
- `POST /api/admin/ops/checks/:checkId`
- `GET /api/admin/ops/checks/recent`

All routes:

- use the existing opaque session cookie
- run behind `tenantGuard`
- require founder/admin role
- derive tenant context from the trusted session
- reject client-provided workspace material in query/body/headers
- return safe DTOs only

Allowed check IDs:

- `api-health`
- `db-health`
- `google-sheets-status`
- `google-sheets-test`
- `worker-queue-summary`

No generic run-check route is approved.

## Health Summary

`GET /api/admin/ops/health` returns a lightweight summary for API uptime, DB health, Google Sheets
setup status, and worker queue counts.

It does not write activity logs and does not call Google.

## Check Runs

Each `POST /api/admin/ops/checks/:checkId` runs one whitelisted check and writes one
`admin_ops` activity log:

- `admin_ops.check_succeeded`
- `admin_ops.check_failed`
- `admin_ops.check_skipped`

`google-sheets-test` reuses the existing setup-test service and adds a 5 minute cooldown per
workspace. Cooldown returns `skipped` with `OPS_CHECK_COOLDOWN`.

## Recent Checks

`GET /api/admin/ops/checks/recent` maps recent `admin_ops` activity logs into a safe DTO. It never
returns activity log IDs, actor IDs, workspace IDs, or raw metadata.

## Frontend

Add `/app/ops` with:

- health cards for API, Database, Google Sheets, Worker Queue
- manual buttons for the five allowed checks
- a last-result panel with safe fields only
- a recent checks table

All requests go through `apps/web/src/lib/api-client.ts` with `credentials: "include"`.

## Non-Goals

- no restart
- no shell execution
- no arbitrary commands
- no arbitrary SQL
- no logs viewer
- no dashboard charts
- no migrations
- no new tables
- no Caddy, Docker, production env, webhook, replay, worker, or Google Sheets pushback runtime
  changes
