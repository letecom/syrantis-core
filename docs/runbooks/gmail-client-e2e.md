# Gmail Client E2E Validation Runbook

## Objective

Validate the real client-like Gmail path:

```txt
Gmail -> Apps Script -> Google Sheet Intake Log -> Syrantis public API -> lead
  -> score_lead job -> worker -> lead_scores
```

This runbook is documentation/templates only. It does not approve backend changes, migrations, UI
changes, Gmail OAuth in Syrantis, worker changes, deployment, Caddy, Docker, systemd, or production
environment changes.

The public intake contract is 023J:

- `POST https://api.syrantis.fr/api/intake/inbound-message`
- `Authorization: Bearer <workspace_api_key>`
- request fields: `fromEmail`, `bodyText`, `source`, `externalId`, `contactName`, `subject`,
  `receivedAt`
- new lead returns HTTP `201`
- idempotency replay returns HTTP `200` with `data.idempotency.isReplay = true`
- response envelope is `{ success: true, data: { diagnosticTraceId, lead, scoringJob, idempotency } }`

Use placeholders only. Never paste real API keys into docs, tickets, screenshots, shell history, or
shared chats.

## Prerequisites

- Founder/admin access to Syrantis admin.
- Gmail account to run the client-like intake test.
- Google Sheet owned by the client/operator.
- Google Apps Script access for the Gmail account.
- Approved workspace API key created through Syrantis admin.
- Operator access for safe validation queries and optional manual worker execution.

## 1. Create A Workspace API Key

1. Open Syrantis admin at `/app/api-keys`.
2. Create a new key dedicated to this validation, for example `023L Gmail client validation`.
3. Copy the plaintext key once and store it only in the Google Apps Script Script Properties.
4. Do not paste the key into the Apps Script source, Google Sheet, docs, issue comments, logs, or
   screenshots.

After validation, revoke this key unless it is explicitly approved for continued client intake use.

## 2. Create The Google Sheet

1. Create a new Google Sheet.
2. Name the first tab `Intake Log`.
3. Import or paste the exact header from:

```txt
docs/templates/google-sheet-intake-log.csv
```

Header:

```csv
timestamp,source,gmailMessageId,gmailThreadId,fromEmail,contactName,subject,receivedAt,httpStatus,success,isReplay,diagnosticTraceId,leadId,scoringJobId,externalId,errorCode,errorMessageSafe,retryCount
```

Keep sharing restricted to the minimum validation group. The Sheet contains bounded client-side PII
such as sender email and subject. It must never contain API keys, email bodies, body summaries, raw
payloads, or raw API responses.

## 3. Create The Apps Script

1. In the Google Sheet, open `Extensions -> Apps Script`.
2. Create or replace the script source with:

```txt
docs/templates/gmail-to-syrantis-intake.gs
```

3. Save the project.

The template intentionally does not handle attachments, HTML body, MIME parsing, OAuth callback
logic inside Syrantis, or body logging.

## 4. Configure Script Properties

In Apps Script, open `Project Settings -> Script Properties` and set:

- `SYRANTIS_API_KEY`: the workspace API key created from `/app/api-keys`.
- `INTAKE_LOG_SHEET_ID`: the Google Sheet ID from the Sheet URL.

Optional properties:

- `SYRANTIS_INTAKE_URL`: default `https://api.syrantis.fr/api/intake/inbound-message`.
- `SOURCE_TAG`: default `gmail_client`.
- `INTAKE_LOG_SHEET_NAME`: default `Intake Log`.
- `MAX_EMAILS_PER_RUN`: default `5`.

Security rules:

- The API key must stay in Script Properties.
- The API key must not be printed, logged, appended to the Sheet, or committed.
- Do not add `workspaceId` to the script, payload, or Sheet.
- Do not add raw Gmail payloads, attachments, HTML body, or body summaries.

## 5. Create Gmail Labels

Run `setupGmailLabels()` manually from Apps Script once. It creates:

- `Syrantis/ToProcess`
- `Syrantis/Processed`
- `Syrantis/Error`

Run `setupIntakeLogHeader()` if the Sheet header was not pasted manually.

## 6. Prepare 5 Test Emails

Choose five Gmail messages that are acceptable for a client-like validation. Apply the label:

```txt
Syrantis/ToProcess
```

The script processes at most `MAX_EMAILS_PER_RUN` labeled threads per run and uses the last message
in each thread.

## 7. Run The Intake

Run `processSyrantisInbox()` manually from Apps Script.

Expected Gmail label behavior:

- successful threads move from `Syrantis/ToProcess` to `Syrantis/Processed`
- failed threads move from `Syrantis/ToProcess` to `Syrantis/Error`

Retry behavior:

- HTTP `429` and `5xx` retry up to 2 times with short backoff.
- HTTP `400`, `401`, and `422` do not retry.

## 8. Read The Intake Log

For the five test emails, expect five Sheet rows with:

- HTTP `201` for new lead creation, or HTTP `200` for replay.
- `success = true`.
- `isReplay = false` for new leads, or `true` for replayed `externalId`.
- populated `diagnosticTraceId`, `leadId`, `scoringJobId`, and `externalId`.
- no API key, no `bodyText`, no body summary, and no raw API response.

The real client-like validation already succeeded with:

- 5 Gmail emails
- 5 Google Sheet Intake Log rows
- 5 HTTP `201`
- 5 leads
- 5 `score_lead` jobs
- 5 completed jobs after worker
- 5 `lead_scores`
- 0 new failed job
- 0 PII leak in `activity_logs`
- 0 PII leak in `background_jobs` payload

## 9. Validate In Syrantis

Use safe IDs from the Sheet. Do not select email bodies, raw lead content, prompt JSON, AI output,
raw payloads, or full activity metadata.

Lead source marker:

```sql
select id, source, normalized_json->>'source' as intake_source, created_at
from leads
where id in ('LEAD_ID_1', 'LEAD_ID_2', 'LEAD_ID_3', 'LEAD_ID_4', 'LEAD_ID_5')
order by created_at;
```

Expected:

- `source = email`
- `intake_source = public_inbound_message`

Background jobs joined by safe payload lead ID:

```sql
select j.id, j.type, j.status, j.created_at, j.completed_at, j.failed_at
from background_jobs j
join leads l on l.id::text = j.payload_json->>'leadId'
where l.id in ('LEAD_ID_1', 'LEAD_ID_2', 'LEAD_ID_3', 'LEAD_ID_4', 'LEAD_ID_5')
  and j.type = 'score_lead'
order by j.created_at;
```

Important: join `background_jobs` via `payload_json->>'leadId'`. Do not use
`background_jobs.entity_id`.

Lead score count:

```sql
select lead_id, count(*) as score_count
from lead_scores
where lead_id in ('LEAD_ID_1', 'LEAD_ID_2', 'LEAD_ID_3', 'LEAD_ID_4', 'LEAD_ID_5')
group by lead_id
order by lead_id;
```

Expected:

- one or more `lead_scores` rows per lead after worker completion.

## 10. Worker Validation

023V does not exist yet, so no worker supervisor validation is approved by this issue. If no
continuous worker is running, an operator may run one manual pass from the production repo:

```bash
cd /opt/syrantis/repos/syrantis-core
set -a
source /opt/syrantis/env/core.prod.env
set +a
pnpm --filter @syrantis/api worker:once
```

Do not make Codex run production worker commands. Do not restart services as part of 023L.

After the worker pass, the `score_lead` jobs for the Sheet lead IDs should be `completed`.

## 11. Leak Checks

Activity log metadata keys only:

```sql
select jsonb_object_keys(metadata_json) as metadata_key, count(*) as occurrences
from activity_logs
where type = 'public_inbound_message.created'
  and metadata_json->>'diagnosticTraceId' in (
    'TRACE_ID_1',
    'TRACE_ID_2',
    'TRACE_ID_3',
    'TRACE_ID_4',
    'TRACE_ID_5'
  )
group by metadata_key
order by metadata_key;
```

Expected allowed keys:

- `source`
- `apiSource`
- `hasExternalId`
- `diagnosticTraceId`
- `leadId`
- `scoringJobId`
- `hasBody`
- `subjectLength`
- `bodyLength`

Forbidden keys:

- `fromEmail`
- `contactEmail`
- `bodyText`
- `subject`
- `contactName`
- `workspaceId`
- `apiKey`
- `token`
- `Authorization`
- `prompt`
- `score`
- `rawPayload`
- `provider_message_id`

Background job payload key check:

```sql
select jsonb_object_keys(j.payload_json) as payload_key, count(*) as occurrences
from background_jobs j
join leads l on l.id::text = j.payload_json->>'leadId'
where l.id in ('LEAD_ID_1', 'LEAD_ID_2', 'LEAD_ID_3', 'LEAD_ID_4', 'LEAD_ID_5')
  and j.type = 'score_lead'
group by payload_key
order by payload_key;
```

Expected allowed keys:

- `leadId`
- `diagnosticTraceId`
- `source`

Forbidden keys:

- `fromEmail`
- `contactEmail`
- `bodyText`
- `subject`
- `contactName`
- `workspaceId`
- `apiKey`
- `token`
- `Authorization`
- `prompt`
- `score`
- `rawPayload`
- `provider_message_id`

Failed job count should not increase because of this validation. Use the existing safe admin
worker failed summary before and after if available.

## Troubleshooting

- `401`: API key is invalid, revoked, missing, or was not copied into Script Properties correctly.
- `422`: payload is invalid; check `fromEmail`, `bodyText` length, `subject` length, and date format.
- `429`: public intake rate limit; wait and rerun remaining `Syrantis/Error` messages after review.
- `5xx`: Syrantis API error; retry later and preserve the safe Intake Log row.
- No Sheet rows: wrong `INTAKE_LOG_SHEET_ID`, wrong tab name, Apps Script authorization missing, or
  `processSyrantisInbox()` did not run.
- No leads: check API key status, endpoint URL, and whether the Sheet row has `success = true`.

## Cleanup

After validation:

1. Revoke the dedicated API key in `/app/api-keys`.
2. Delete the Apps Script project or remove the Syrantis source.
3. Remove the Gmail labels if they are no longer needed.
4. Restrict or delete the Google Sheet.
5. Remove any test emails from the validation mailbox if the client policy requires it.

Do not delete Syrantis audit records or database rows as part of 023L.
