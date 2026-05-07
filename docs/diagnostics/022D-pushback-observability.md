# 022D - Pushback Observability Diagnostics

## What 022D Adds

Issue 022D adds compact activity log diagnostics for the Google Sheets push-back path introduced in 022C.

It answers:

- Was push-back skipped?
- Did push-back succeed?
- Did push-back fail?
- If it failed, what compact safe error code explains the result?

022D uses the existing `activity_logs` table only. It adds no table, migration, API route, replay endpoint, read model, UI, OAuth flow, outbox, generic CRM adapter, or Dolibarr connector.

## Activity Log Types

- `crm_pushback.skipped`
- `crm_pushback.succeeded`
- `crm_pushback.failed`

There is intentionally no `crm_pushback.attempted` type in this issue.

The activity log entity is:

- `entity_type = 'email_send'`
- `entity_id = emailSendId`

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

## Safe Metadata

Skipped:

```json
{
  "diagnosticTraceId": "uuid",
  "emailSendId": "uuid",
  "draftId": "uuid-if-already-known",
  "leadId": "uuid-if-already-known",
  "errorCode": "PUSHBACK_DISABLED",
  "errorSummary": "Google Sheets push-back is disabled.",
  "durationMs": 0
}
```

Succeeded:

```json
{
  "diagnosticTraceId": "uuid",
  "emailSendId": "uuid",
  "draftId": "uuid-if-already-known",
  "leadId": "uuid-if-already-known",
  "maskedSpreadsheetId": "1tml...w7lc",
  "range": "Pushback_Log!A:Q",
  "columnsAppended": 17,
  "durationMs": 0
}
```

Failed:

```json
{
  "diagnosticTraceId": "uuid",
  "emailSendId": "uuid",
  "draftId": "uuid-if-already-known",
  "leadId": "uuid-if-already-known",
  "maskedSpreadsheetId": "1tml...w7lc",
  "range": "Pushback_Log!A:Q",
  "errorCode": "PUSHBACK_AUTH_FAILED",
  "errorSummary": "Google Sheets authentication or authorization failed.",
  "durationMs": 0
}
```

`workspaceId` is not included in metadata because `activity_logs.workspace_id` already stores it.

## Forbidden Fields

Pushback diagnostic metadata must not include:

- credentials or credential field values
- provider message IDs
- email subject, HTML body, or text body
- raw webhook payloads
- raw Google error bodies
- contact email
- lead labels
- workspace ID inside metadata

## Founder SQL Diagnostics

Recent pushback diagnostics:

```sql
SELECT
  created_at,
  workspace_id,
  entity_id AS email_send_id,
  type,
  metadata_json
FROM activity_logs
WHERE type IN (
  'crm_pushback.skipped',
  'crm_pushback.succeeded',
  'crm_pushback.failed'
)
ORDER BY created_at DESC
LIMIT 50;
```

Failed pushback by code:

```sql
SELECT
  metadata_json->>'errorCode' AS error_code,
  count(*) AS failures
FROM activity_logs
WHERE type = 'crm_pushback.failed'
GROUP BY metadata_json->>'errorCode'
ORDER BY failures DESC, error_code ASC;
```

One email send diagnostic history:

```sql
SELECT
  created_at,
  type,
  metadata_json
FROM activity_logs
WHERE entity_type = 'email_send'
  AND entity_id = '<email_send_id>'
  AND type IN (
    'crm_pushback.skipped',
    'crm_pushback.succeeded',
    'crm_pushback.failed'
  )
ORDER BY created_at ASC;
```

## Failure Interpretation

`PUSHBACK_DISABLED`: push-back did not run because `GOOGLE_SHEETS_PUSH_ENABLED` was not exactly `true`.

`PUSHBACK_MISSING_CREDENTIALS`: credentials were absent or could not be parsed into the expected service-account shape.

`PUSHBACK_MISSING_SPREADSHEET_ID`: the spreadsheet ID configuration was absent.

`PUSHBACK_MISSING_RANGE`: the configured pushback range was absent or empty.

`PUSHBACK_AUTH_FAILED`: Google authentication or authorization failed, commonly because credentials are invalid or the Sheet is not shared with the service account.

`PUSHBACK_SPREADSHEET_NOT_FOUND`: Google returned a spreadsheet-like not-found response.

`PUSHBACK_RANGE_INVALID`: Google returned a range-like failure, usually an invalid tab name or A1 range.

`PUSHBACK_APPEND_FAILED`: Google returned an append failure that was not safely classified more specifically.

`PUSHBACK_TIMEOUT`: the request timed out or was aborted.

`PUSHBACK_UNKNOWN_ERROR`: an unexpected runtime error occurred and was intentionally reduced to a compact safe code.

## Future Work

Replay, status read models, manual operational controls, UI, and connector hardening remain future issues.
