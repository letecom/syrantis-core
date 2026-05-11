# 023L - Real Client Gmail E2E Validation Pack

## Summary

Create a repeatable documentation and template pack for validating:

```txt
Gmail -> Apps Script -> Google Sheet Intake Log -> Syrantis public API
  -> lead -> score_lead job -> worker -> lead_scores
```

023L is documentation/templates/runbook only. It adds no backend, migration, UI, Gmail OAuth
backend, runtime configuration, worker behavior, or production deployment mechanism.

## Architecture

The client-owned Gmail account and Google Sheet run the external side of the validation:

```txt
Gmail label Syrantis/ToProcess
  -> Google Apps Script reads latest message in each labeled thread
  -> POST /api/intake/inbound-message with workspace API key
  -> Google Sheet Intake Log receives safe validation row
  -> Syrantis creates or replays public inbound message lead
  -> score_lead background job
  -> worker
  -> lead_scores
```

Syrantis continues to resolve workspace identity only through the 023J workspace API key lookup.
The Apps Script never sends `workspaceId`.

## Scope

023L adds:

- Apps Script template for Gmail-to-Syrantis public intake.
- Google Sheet header CSV template.
- Google Sheet schema and PII guidance.
- Client E2E runbook with safe SQL validation and leak checks.
- 023L spec and implementation report.
- README links to the validation pack.

## Anti-Scope

023L must not add or modify:

- `apps/api`
- `apps/web`
- `packages/db`
- `packages/shared`
- database migrations
- routes
- backend tests
- worker code or worker runtime
- Gmail/Outlook OAuth backend
- Caddy, systemd, Docker, or env files
- production secrets

The pack must not place API keys, `workspaceId`, body summaries, `bodyText`, HTML body,
attachments, raw payloads, or raw API responses in the Sheet template.

## Data Flow

For each Gmail thread labeled `Syrantis/ToProcess`, Apps Script:

1. Takes the latest message in the thread.
2. Builds `externalId = gmail:<messageId>`.
3. Extracts `fromEmail` from `message.getFrom()`.
4. Extracts `contactName` when a display name exists.
5. Truncates `subject` to 500 characters.
6. Reads plain text body and truncates to 10000 characters for the 023J request only.
7. Sets `receivedAt` from the Gmail message date.
8. Sends the 023J public inbound message request.
9. Appends only a safe Intake Log row.
10. Moves the thread to `Syrantis/Processed` or `Syrantis/Error`.

## PII Policy

The Google Sheet is client-side validation evidence, so it may contain bounded PII:

- sender email
- optional contact name
- subject
- Gmail IDs

The Sheet must not contain:

- API keys or tokens
- `bodyText`
- body summaries
- raw API request/response payloads
- raw Gmail/MIME payloads
- attachments or HTML body
- `workspaceId` or tenant context
- prompts, AI outputs, score rationale, provider payloads, or secret material

Apps Script must also avoid logging the API key and must keep it only in Script Properties.

## Gmail Labels Model

The template uses exactly:

- `Syrantis/ToProcess`
- `Syrantis/Processed`
- `Syrantis/Error`

Processing removes `Syrantis/ToProcess` from each attempted thread. A successful HTTP `200`/`201`
with `success = true` applies `Syrantis/Processed`; any failure applies `Syrantis/Error`.

## Apps Script Behavior

Required functions:

- `setupGmailLabels()`
- `setupIntakeLogHeader()`
- `processSyrantisInbox()`

Script Properties:

- `SYRANTIS_API_KEY`
- `SYRANTIS_INTAKE_URL`, default `https://api.syrantis.fr/api/intake/inbound-message`
- `SOURCE_TAG`, default `gmail_client`
- `INTAKE_LOG_SHEET_ID`
- `INTAKE_LOG_SHEET_NAME`, default `Intake Log`
- `MAX_EMAILS_PER_RUN`, default `5`

The script uses `LockService.getScriptLock()` to avoid concurrent runs, processes at most
`MAX_EMAILS_PER_RUN` threads, uses plain text only, and does not process attachments or HTML.

Retry behavior:

- retry HTTP `429` and `5xx` up to 2 times with short backoff
- do not retry HTTP `400`, `401`, or `422`

The script parses:

- `data.diagnosticTraceId`
- `data.lead.id`
- `data.scoringJob.id`
- `data.idempotency.isReplay`

## Sheet Schema

The Sheet header is exactly:

```csv
timestamp,source,gmailMessageId,gmailThreadId,fromEmail,contactName,subject,receivedAt,httpStatus,success,isReplay,diagnosticTraceId,leadId,scoringJobId,externalId,errorCode,errorMessageSafe,retryCount
```

Formula injection is mitigated by sanitizing text fields before appending rows.

## Idempotency

Apps Script sets:

```txt
externalId = gmail:<messageId>
```

023J behavior:

- first valid request for a new `externalId` creates a lead and returns HTTP `201`
- replay within the 24-hour idempotency window returns HTTP `200`
- replay response has `data.idempotency.isReplay = true`
- replay does not create a second lead, job, or `public_inbound_message.created` activity log

In the database, public inbound message leads use:

- `leads.source = email`
- `normalized_json->>'source' = public_inbound_message`

## Error Handling

The Sheet stores only generic safe error fields:

- HTTP status
- bounded error code
- generic safe error message
- retry count

It never stores raw API responses, raw Gmail payloads, body content, or authorization material.

Troubleshooting mapping:

- `401`: invalid, revoked, missing, or misconfigured API key.
- `422`: invalid payload.
- `429`: public intake rate limit.
- `5xx`: Syrantis API error.
- no rows: Sheet ID, tab name, Apps Script authorization, or trigger/run issue.
- no leads: endpoint or key issue, or failed API response.

## Validation Matrix

| Check | Expected |
| --- | --- |
| Gmail labeled threads | 5 `Syrantis/ToProcess` threads selected |
| Intake Log rows | 5 safe rows |
| New API responses | HTTP `201` |
| Replay API responses | HTTP `200`, `data.idempotency.isReplay = true` |
| Leads | 5 leads for 5 new messages |
| Lead DB source | `email` |
| Lead marker | `normalized_json->>'source' = public_inbound_message` |
| Jobs | 5 `score_lead` jobs joined by `payload_json->>'leadId'` |
| Worker result | 5 completed jobs after worker |
| Scores | 5 leads have `lead_scores` |
| Failed jobs | no new failed job |
| Activity logs | no PII keys |
| Job payloads | no PII keys |

The real client-like validation already succeeded with 5 Gmail emails, 5 Intake Log rows, 5 HTTP
`201`, 5 leads, 5 `score_lead` jobs, 5 completed jobs, 5 `lead_scores`, 0 new failed jobs, and no
PII leak in activity logs or background job payloads.

## Relationship To 023M, 023N, And 023V

- 023L packages the manual real Gmail validation path and preserves the current no-backend-OAuth
  stance.
- 023M may use this pack as evidence or input for the next client-readiness step, but 023L does
  not implement that future scope.
- 023N may use the runbook and leak checks as a baseline for broader operational hardening, but
  023L does not change runtime safety mechanisms.
- 023V does not exist yet. Worker validation in 023L remains manual; `worker:once` may be run by a
  human operator when needed, with no worker supervisor or deploy mechanism added here.
