# 022D - Pushback Observability & Diagnostics

## Purpose

Add safe observability around Google Sheets push-back without expanding product scope.

The system must answer whether push-back was skipped, succeeded, or failed, and must provide a compact safe error code when it fails.

## Scope

- Re-use the existing `activity_logs` table.
- Add activity log types:
  - `crm_pushback.skipped`
  - `crm_pushback.succeeded`
  - `crm_pushback.failed`
- Add defensive Google Sheets push-back error classification.
- Mask spreadsheet IDs in diagnostics.
- Keep the Resend webhook response independent from push-back failures.
- Document founder-facing diagnostics and common failure interpretation.

## Explicit Non-Scope

- No new table.
- No migration.
- No API route.
- No replay endpoint.
- No UI.
- No OAuth.
- No generic CRM adapter.
- No Dolibarr connector.
- No outbox framework.
- No `crm_pushback.attempted` activity log type.

## Error Codes

- `PUSHBACK_DISABLED`
- `PUSHBACK_MISSING_CREDENTIALS`
- `PUSHBACK_MISSING_SPREADSHEET_ID`
- `PUSHBACK_MISSING_RANGE`
- `PUSHBACK_AUTH_FAILED`
- `PUSHBACK_SPREADSHEET_NOT_FOUND`
- `PUSHBACK_RANGE_INVALID`
- `PUSHBACK_APPEND_FAILED`
- `PUSHBACK_TIMEOUT`
- `PUSHBACK_UNKNOWN_ERROR`

## Metadata Contract

Skipped metadata:

- `diagnosticTraceId`
- `emailSendId`
- `draftId`, only if already available safely
- `leadId`, only if already available safely
- `errorCode`
- `errorSummary`
- `durationMs`

Succeeded metadata:

- `diagnosticTraceId`
- `emailSendId`
- `draftId`, only if already available safely
- `leadId`, only if already available safely
- `maskedSpreadsheetId`
- `range`
- `columnsAppended = 17`
- `durationMs`

Failed metadata:

- `diagnosticTraceId`
- `emailSendId`
- `draftId`, only if already available safely
- `leadId`, only if already available safely
- `maskedSpreadsheetId`, when configured
- `range`, when configured
- `errorCode`
- `errorSummary`
- `durationMs`

The metadata must not include credentials, provider message IDs, email subject/body, raw webhook payloads, raw Google error bodies, contact email, lead labels, or `workspaceId`.

## Spreadsheet ID Masking

Masking is deterministic:

- IDs with length `<= 8` become `***`.
- Longer IDs become the first four characters, `...`, and the last four characters.

Example:

```txt
1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc
1tml...w7lc
```

## Behavior

- `pushDeliveryProofToGoogleSheets` must never throw to the Resend webhook caller.
- Push-back failure must not fail the webhook response.
- Diagnostic log failures must be swallowed and must not crash the pushback path.
- Existing 17-column Google Sheets append behavior must remain unchanged.
- The webhook must remain non-blocking and must not call provider HTTP APIs directly.
