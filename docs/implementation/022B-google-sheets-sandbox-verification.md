# 022B - Google Sheets Sandbox Setup & Verification Implementation

## What Was Implemented

Added a founder-facing French Google Sheets sandbox setup guide and a standalone manual verification script.

The script verifies that Syrantis can authenticate to Google Sheets with service-account sandbox credentials, append one verification row, read the configured range back, and find the generated verification id.

The script is intentionally manual. It is not imported by the application runtime.

## Files Touched

- `docs/guides/google-sheets-sandbox-setup.fr.md`
- `apps/api/src/scripts/verify-sheets-sandbox.ts`
- `apps/api/package.json`
- `pnpm-lock.yaml`
- `README.md`
- `docs/specs/022B-google-sheets-sandbox-verification.md`
- `docs/implementation/022B-google-sheets-sandbox-verification.md`

## Why No Migration

No migration was added because 022B does not create runtime state, tenant-scoped data, connector records, outbox records, delivery events, or configuration tables.

The issue proves external API readiness only. It does not change the database.

## Why No Route, Worker, Or Outbox

022B is a sandbox verification lane, not production push-back.

No route was added because no client or application workflow should trigger this verification.

No worker was added because there is no production background job or retry contract yet.

No outbox was added because there is no approved production CRM push-back behavior in this issue.

The script must stay outside the Syrantis runtime until a later issue approves a concrete Google Sheets push-back MVP.

## Checks Run

Automated checks run:

- `pnpm install --frozen-lockfile` - passed
- `pnpm --filter @syrantis/db verify-migration-files` - passed
- `pnpm --filter @syrantis/db test` - passed
- `pnpm test` - passed
- `pnpm typecheck` - passed
- `pnpm lint` - passed
- `pnpm build` - passed
- `git diff --check` - passed
- `git diff --name-only` - reviewed
- `git diff --stat` - reviewed

Safety checks run:

- Production import search for the verification script: no matches outside `package.json`.
- Credential-pattern search: no committed Google credential values found; output only showed existing redaction keyword references.
- Tracked JSON credential filename search: no matches.
- DB, tenant guard, background job, and `email_sends` import search in the verification script: no matches.

No automated check should call Google APIs or require real Google credentials.

## Manual Validation Plan

1. Create a dedicated sandbox Google Sheet.
2. Add columns `kind`, `timestamp`, `message`, `issue`, and `verification_id`.
3. Create a Google Cloud sandbox project.
4. Enable Google Sheets API.
5. Create a sandbox service account.
6. Generate a JSON key and store it outside Git.
7. Share the Sheet with the service account email.
8. Configure `GOOGLE_SHEETS_CREDENTIALS_JSON`, `GOOGLE_SHEETS_SPREADSHEET_ID`, and optionally `GOOGLE_SHEETS_RANGE` in the approved operational environment.
9. Run `pnpm --filter @syrantis/api verify:sheets-sandbox`.
10. Confirm the output contains `SHEETS_SANDBOX_VERIFY_OK`.
11. Confirm the verification row appears in the Sheet.

## Rollback

Rollback is limited to removing the sandbox verification artifacts:

- Remove `apps/api/src/scripts/verify-sheets-sandbox.ts`.
- Remove `verify:sheets-sandbox` from `apps/api/package.json`.
- Remove `google-auth-library` from `apps/api/package.json` and regenerate `pnpm-lock.yaml`.
- Remove the 022B guide, spec, implementation report, and README mention.

No database rollback, route rollback, worker rollback, CRM rollback, webhook rollback, or production data cleanup is required because none were added.
