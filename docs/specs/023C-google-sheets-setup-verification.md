# 023C - Google Sheets Setup Verification Screen

## Summary

Add a read-only founder/admin screen that verifies the active env-backed Google Sheets setup from
the deployed admin UI.

This issue follows option A: no editable configuration, no OAuth, no Apps Script, no migration, and
no change to pushback, replay, webhook, Caddy, auth, or worker runtime behavior.

## Goals

- Show safe Google Sheets setup status in the admin UI.
- Let a founder/admin run one backend-only Google Sheets verification append.
- Return only safe diagnostics with a `diagnosticTraceId`.
- Write one safe activity log per setup test.

## Backend Routes

- `GET /api/integrations/google-sheets/setup-status`
- `POST /api/integrations/google-sheets/setup-test`

Both routes:

- use the existing opaque session cookie
- run behind `tenantGuard`
- require founder/admin role
- derive `workspaceId` from trusted server session context
- reject client-provided `workspaceId`
- return no credentials, raw Google responses, raw Google errors, or full spreadsheet IDs

Business Google outcomes from setup test return HTTP 200 with `result` set to `failed` or `skipped`.
Session and authorization failures remain HTTP 401/403.

## Safe DTOs

Setup status includes:

- enabled/configured booleans
- credential/spreadsheet/range configured booleans
- masked spreadsheet ID
- safe range labels
- latest setup test result from `activity_logs`

Setup test includes:

- result
- diagnostic trace ID
- tested timestamp
- safe `PUSHBACK_*` error code and summary when applicable
- verification range and appended row count on success

## Verification Append

The setup test appends one safe row to `GOOGLE_SHEETS_VERIFICATION_RANGE`:

```txt
SYRANTIS_SETUP_TEST | ISO timestamp | diagnosticTraceId | attempted
```

It never writes to `Pushback_Log`, never writes lead/contact/email content, and never calls Google
from the frontend.

## Activity Log

Each setup test writes one activity log:

- `entity_type = google_sheets_setup`
- `entity_id = null`
- type:
  - `google_sheets_setup.test_succeeded`
  - `google_sheets_setup.test_failed`
  - `google_sheets_setup.test_skipped`

Metadata is limited to:

- `source: "admin_ui"`
- `diagnosticTraceId`
- `result`
- `errorCode` when present
- `durationMs`
- `verificationRangeConfigured`
- `pushbackRangeConfigured`

## Non-Goals

- no config editing
- no OAuth
- no Apps Script
- no `external_connections`
- no migration or new table
- no dashboard
- no Caddy changes
- no auth rewrite
- no pushback/replay/webhook behavior changes
