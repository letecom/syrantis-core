# 022D - Pushback Observability & Diagnostics Implementation

## What Was Implemented

Added safe Google Sheets push-back diagnostics using existing `activity_logs`.

The pushback path now records:

- `crm_pushback.skipped` for disabled or missing configuration paths.
- `crm_pushback.succeeded` after a successful 17-column append.
- `crm_pushback.failed` for auth, spreadsheet, range, timeout, append, and unknown failures.

No database migration, table, route, replay endpoint, UI, OAuth flow, outbox, CRM adapter, or Dolibarr integration was added.

## Files Touched

- `apps/api/src/services/pushback/google-sheets.ts`
- `apps/api/src/services/pushback/diagnostics.ts`
- `apps/api/src/tests/google-sheets-pushback.test.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `docs/diagnostics/022D-pushback-observability.md`
- `docs/specs/022D-pushback-observability-diagnostics.md`
- `docs/implementation/022D-pushback-observability-diagnostics.md`
- `README.md`

## Implementation Details

- Added `PushbackErrorCode` and defensive `classifyPushbackError`.
- Added deterministic spreadsheet masking with `maskSpreadsheetId`.
- Added metadata builders for skipped, succeeded, and failed diagnostics.
- Added `logPushbackDiagnosticActivity`, which uses `withWorkspaceDb` and `createActivityLog`.
- Kept logging failure non-fatal.
- Kept pushback failure non-fatal to Resend webhook processing.
- Preserved the exact 17-column Google Sheets append row from 022C.

## Safety Notes

Diagnostic metadata excludes credentials, provider message IDs, email subjects and bodies, raw webhook payloads, raw Google error bodies, contact email, lead labels, and `workspaceId`.

`workspaceId` remains available through `activity_logs.workspace_id`, not duplicated inside metadata.

`draftId` and `leadId` are included only when already present in the existing pushback repository result.

## Verification

Focused verification was added for:

- disabled pushback
- missing credentials
- missing spreadsheet ID
- missing range
- successful append diagnostics
- Google 403 auth classification
- spreadsheet-like 404 classification
- range-like 400 classification
- timeout classification
- unknown thrown error classification
- append/logging failures resolving without throwing
- webhook behavior remaining non-blocking

Commands run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/api exec vitest run src/tests/google-sheets-pushback.test.ts src/tests/resend-webhook.test.ts
pnpm --filter @syrantis/shared build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Results:

- `verify-migration-files`: `sql_files=19 journal_entries=19 drift=0`
- DB tests: 46 passed
- Focused pushback/webhook tests: 31 passed
- Full API tests: 27 files / 432 tests passed
- Typecheck, lint, build, import safety, and diff whitespace checks passed
- No migration files, env files, production env files, Google JSON files, service-account JSON files, web app files, Caddyfile, or Dockerfile were changed

No `*.hostile-env.test.ts` files exist in the current API test tree, so no hostile-env command target was available for this issue.

## Rollback

To rollback 022D:

- Remove diagnostic logging from `pushDeliveryProofToGoogleSheets`.
- Remove `apps/api/src/services/pushback/diagnostics.ts`.
- Remove the three `crm_pushback.*` values from the shared activity log action contract.
- Remove the 022D diagnostic/spec/implementation docs.

No database rollback is required because no migration was introduced.
