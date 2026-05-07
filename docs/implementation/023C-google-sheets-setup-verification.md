# 023C Google Sheets Setup Verification Implementation

## Summary

Implemented the read-only Google Sheets setup verification screen for `admin.syrantis.fr`.

Configuration remains server env-backed. The UI can inspect safe setup status and trigger one
backend-only setup test append to `GOOGLE_SHEETS_VERIFICATION_RANGE`; it cannot edit configuration.

## Files Changed

- `packages/shared/src/contracts/google-sheets-setup.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/repositories/google-sheets-setup.ts`
- `apps/api/src/services/google-sheets-setup.ts`
- `apps/api/src/services/pushback/google-sheets.ts`
- `apps/api/src/routes/integrations.ts`
- `apps/api/src/tests/google-sheets-setup.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/GoogleSheetsPage.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/src/App.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023C-google-sheets-setup-verification.md`
- `docs/implementation/023C-google-sheets-setup-verification.md`
- `README.md`

No migrations, Caddy files, Docker files, production env files, worker code, webhook code, replay
runtime code, or pushback runtime behavior were changed.

## Backend

Added:

- `GET /api/integrations/google-sheets/setup-status`
- `POST /api/integrations/google-sheets/setup-test`

Both routes use the existing integrations router, opaque session cookie, `tenantGuard`, trusted
server `workspaceId`, and founder/admin authorization. Client-provided `workspaceId` in query/body
is rejected.

`setup-status` reads env-backed setup booleans and the latest safe setup test activity log. It does
not write activity logs, mutate tables, or call Google.

`setup-test` validates effective env config, appends a safe verification row through the backend
Google Sheets API path, maps Google failures to existing safe `PUSHBACK_*` codes, bounds the test
with a timeout, and writes one safe activity log.

## Frontend

Added `/app/google-sheets` and the sidebar link `Google Sheets`.

The page shows:

- Pushback enabled
- Credentials configured
- Spreadsheet configured
- Masked spreadsheet ID
- Pushback range configured
- Verification range configured
- Last test
- Test connection action with locked loading state
- Safe result area with `diagnosticTraceId`
- Help copy stating env-backed configuration and active production verification

All requests go through `apps/web/src/lib/api-client.ts` with `credentials: "include"`. The
frontend sends no bearer token, no `workspaceId`, and makes no direct Google calls.

## Data Safety

Responses and logs never include:

- `GOOGLE_SHEETS_CREDENTIALS_JSON`
- credential JSON
- `private_key`
- `client_email`
- full spreadsheet ID
- raw Google response or raw Google error
- provider IDs
- subject/body/contact/lead content
- raw metadata or payload dumps

Setup test activity metadata is limited to source, diagnostic trace ID, result, optional safe error
code, duration, and range-configured booleans.

## Checks

Targeted checks added:

- API route auth/admin/status/test behavior
- safe spreadsheet masking and credential leak checks
- skipped and failed setup-test safe code mapping
- one safe activity log per POST setup-test
- no activity log write or Google call from GET setup-status
- sidebar and page rendering
- masked spreadsheet ID only
- POST through api-client
- locked test button
- success/failure rendering with diagnostic trace ID
- forbidden frontend strings not rendered
- direct frontend `fetch` remains confined to `api-client`

## Rollback

Rollback is code-only:

- remove the two integration routes and service/repository files
- remove the admin UI route/link/page and api-client methods
- remove the shared setup contracts and activity-log enum additions

No database rollback is required because 023C adds no migration or table.
