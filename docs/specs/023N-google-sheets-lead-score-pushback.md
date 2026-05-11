# 023N - Google Sheets Lead Score Pushback

## Scope

023N adds an asynchronous Google Sheets pushback for successful lead scores.

When a `score_lead` worker run creates a `lead_scores` row, it best-effort enqueues a separate
`pushback_lead_score` background job after the scoring transaction commits. The scoring job remains
successful even if the enqueue fails.

The pushback job appends one safe row to the Google Sheets `Score_Log` tab using range
`Score_Log!A:P`.

## Migration

023N includes one minimal migration only:

- drop and recreate `background_jobs_type_check`
- add `pushback_lead_score` to the allowed job types

No table, column, RLS policy, runtime file, route, UI, or production env change is introduced.

## Job Payload

`pushback_lead_score` payload is IDs-only plus source:

```json
{
  "leadId": "uuid",
  "scoreId": "uuid",
  "diagnosticTraceId": "uuid-or-null",
  "source": "score_lead"
}
```

It must not contain `workspaceId`, email/body fields, raw payloads, prompts, AI outputs, provider
payloads, credentials, tokens, or API keys.

## Score_Log Row

Column order:

```txt
event_type
occurred_at
lead_id
external_id
source
from_email
contact_name
subject
score
score_band
intent
urgency
confidence
recommended_action
diagnostic_trace_id
synced_at
```

Allowed Sheet PII is limited to `from_email`, `contact_name`, and `subject`. These values are
truncated and protected against spreadsheet formula injection. Body text, summaries, HTML, raw
payloads, prompts, raw AI output, provider payloads, credentials, `workspaceId`, and secrets are
never appended.

023N is append-only. It does not update the existing Intake Log.

## Activity Logs

The worker writes compact safe activity logs:

- `lead_score_pushback.succeeded`
- `lead_score_pushback.failed`
- `lead_score_pushback.skipped`

Activity log metadata contains no PII, no raw Google response, no raw error message, no unmasked
spreadsheet ID, no credentials, and no `workspaceId`.

## Idempotence

Before append, the handler checks for an existing
`lead_score_pushback.succeeded` activity log in the same workspace where
`metadata_json->>'scoreId' = scoreId`.

If found, it writes/returns `skipped` with reason `ALREADY_PUSHED` and does not append.

Race limitation for v1: if Google Sheets append succeeds and the succeeded activity log write fails,
a retry can append a duplicate row. This is accepted for append-only v1 and can be improved by a
future durable idempotency marker if needed.

## Out Of Scope

- API routes
- UI
- new Google OAuth
- Caddy, Docker, systemd, or production env changes
- tables or columns
- RLS changes
- physical deletes
- Intake Log update
- replay/status UI; a future 023O may add controlled replay/status if needed
