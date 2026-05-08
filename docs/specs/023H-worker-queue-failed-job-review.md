# 023H - Worker Queue Failed Job Review

## Summary

Add a minimal safe failed-job review check to the existing Ops Panel.

023H makes worker queue debt interpretable without adding a worker dashboard, retry endpoint,
delete/archive action, migration, logs viewer, arbitrary SQL, shell access, or payload inspection.

## Route

No new route is added.

The new whitelisted check ID is run through the existing route:

- `POST /api/admin/ops/checks/worker-failed-summary`

The route remains session-cookie authenticated, tenant guarded, founder/admin only, and rejects
client-provided workspace material in query, body, or headers.

## Check ID

Add:

- `worker-failed-summary`

Existing checks remain unchanged:

- `api-health`
- `db-health`
- `google-sheets-status`
- `google-sheets-test`
- `worker-queue-summary`

## Safe Data

The check returns only aggregate failed-job data:

- total failed count
- grouped counts by job type
- min/max attempts by type
- oldest created timestamp by type
- latest updated timestamp by type
- age bucket by type
- interpretation summary and next action

Allowed source columns from `background_jobs`:

- `type`
- `status`
- `attempts`
- `created_at`
- `updated_at`
- aggregate counts

Forbidden response data:

- job IDs
- `workspace_id`
- `locked_by`
- `locked_at`
- `payload_json`
- raw payloads
- raw errors
- stack traces
- prompts or AI output
- lead, contact, email, provider, or raw metadata content

## Interpretation

Age buckets:

- `fresh`: latest update within 24 hours
- `recent`: latest update within 7 days
- `historical`: latest update older than 7 days
- `unknown`: no timestamp

Interpretation:

- `totalFailed = 0`: status `ok`, next action `none`
- historical-only failures: status `degraded`, next action `review_historical_failures`
- fresh or recent failures: status `degraded`, next action `investigate_recent_failures`

## Activity Log

Each POST writes exactly one `admin_ops` activity log.

For `worker-failed-summary`, metadata is limited to:

- source
- checkId
- result
- diagnosticTraceId
- durationMs
- totalFailed
- groupCount
- hasFreshFailures
- hasOnlyHistoricalFailures
- recommendedNextAction
- errorCode when applicable

No job IDs, payloads, raw errors, stack traces, workspace IDs, provider IDs, prompts, AI output, or
business content may be stored.

## Frontend

`/app/ops` adds one manual check button:

- Worker Failed Summary

The last result renders:

- total failed
- status
- recommended next action
- freshness flags
- groups by type with count, attempt range, oldest/latest timestamps, and age bucket

No dedicated worker page, dashboard, polling, auto-refresh, local storage, bearer token,
client-provided workspace ID, raw JSON panel, or direct fetch outside the API client is added.

## Non-Goals

- no migration
- no new table
- no retry endpoint
- no automatic retry
- no delete or archive action
- no worker restart
- no admin restart button
- no shell execution
- no arbitrary SQL execution
- no logs viewer
- no provider or AI model changes
- no Caddy, Docker, systemd, production env, webhook, pushback, or email runtime changes
