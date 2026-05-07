# 022E Manual Pushback Replay

## Goal

Add a manual admin API replay for Google Sheets pushback for an existing `email_send_id`.

Syrantis remains a backend-first controlled execution layer. This issue does not add a CLI, CRM workflow, chatbot behavior, uncontrolled agent action, migration, table, background job, or email resend path.

## API

`POST /api/email-sends/:id/pushback-replay`

The route:

- requires an authenticated tenant session
- allows only `admin` and `founder` roles
- reads `workspaceId` only from tenant context
- reads `emailSendId` only from the path parameter
- returns `400` for invalid UUID path parameters
- returns `404` for missing or cross-workspace email sends
- returns `200` for replay business outcomes: `succeeded`, `failed`, or `skipped`

Response body:

```json
{
  "success": true,
  "data": {
    "emailSendId": "uuid",
    "result": "succeeded",
    "diagnosticTraceId": "uuid"
  }
}
```

Failure or skipped business outcomes include a safe `PUSHBACK_...` `errorCode`.

## Eligibility

Replay is eligible only when:

- `email_sends.status` is `sent`
- `delivery_status` is `delivered`, `bounced`, or `complained`

Skipped outcomes:

- `delivery_status` is null: `PUSHBACK_DELIVERY_STATUS_MISSING`
- status is `pending`, `queued`, `cancelled`, or `failed`: `PUSHBACK_EMAIL_SEND_NOT_SENT`
- Google Sheets pushback is disabled: `PUSHBACK_DISABLED`

Google Sheets credential, auth, range, spreadsheet, append, timeout, or unknown failures return `200` with `result: "failed"` and the existing safe pushback error code.

## Pushback Behavior

Replay reuses `pushDeliveryProofToGoogleSheets`.

Replay:

- may append duplicate rows
- never resends email
- never calls Resend send
- never simulates a Resend webhook
- never creates `background_jobs`
- never mutates `email_sends.status`, `delivery_status`, delivery timestamps, or delivery error columns

Manual replay appends with `source: "manual_replay"` in diagnostic metadata and, when possible, replaces the safe summary column with a manual replay summary.

## Activity Logs

No new activity action is added.

Replay reuses:

- `crm_pushback.skipped`
- `crm_pushback.succeeded`
- `crm_pushback.failed`

Metadata includes compact safe fields only:

- `source: "manual_replay"`
- `diagnosticTraceId`
- `emailSendId`
- `draftId` when available
- `leadId` when available
- `maskedSpreadsheetId` when applicable
- `range` when applicable
- `columnsAppended` when applicable
- `durationMs`
- `errorCode` when failed or skipped
- `deliveryStatus`
- `sendStatus`

Metadata must not include provider message IDs, subject/body content, contact emails, raw provider or Google errors, credentials, secrets, or `workspaceId`.

## Tests

Targeted Vitest coverage covers auth, admin authorization, UUID validation, 404 behavior, replay eligibility, pushback path reuse for delivered/bounced/complained, disabled and failed Google Sheets outcomes, immutability, no background jobs, no provider send path, safe response shape, safe activity metadata, and duplicate replay.
