# Public Inbound Message Intake Runbook

## Objective

Validate the public API-key inbound message path:

```txt
workspace API key -> public inbound message intake -> lead -> score_lead job -> worker -> lead_scores
```

This runbook does not approve MIME parsing, Resend inbound, Gmail/Outlook OAuth, IMAP, attachments,
HTML bodies, outbound email, auto-reply, worker runtime changes, deployment, Caddy, systemd, Docker,
migration, or production env changes.

Use placeholders only. Never paste a real workspace API key into docs, tickets, logs, screenshots,
or shared shell history.

## 1. Missing Authorization Should Return 401

```bash
curl -sS -o /tmp/023j-no-auth.json -w '%{http_code}\n' \
  -H 'content-type: application/json' \
  -X POST https://api.syrantis.fr/api/intake/inbound-message \
  --data '{
    "fromEmail": "test@example.com",
    "bodyText": "Need a heating quote follow-up."
  }'
```

Expected:

- HTTP `401`
- generic unauthorized response
- no token or workspace details

## 2. Invalid API Key Should Return 401

```bash
curl -sS -o /tmp/023j-invalid-key.json -w '%{http_code}\n' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer syr_live_INVALID_PLACEHOLDER' \
  -X POST https://api.syrantis.fr/api/intake/inbound-message \
  --data '{
    "fromEmail": "test@example.com",
    "bodyText": "Need a heating quote follow-up."
  }'
```

Expected:

- HTTP `401`
- generic unauthorized response
- no token, API key hash, or workspace details

## 3. Valid Public Intake Should Return 201

Set a local variable without printing it:

```bash
read -rsp 'Workspace API key: ' SYRANTIS_WORKSPACE_API_KEY
echo
```

Submit a minimal message:

```bash
curl -sS -o /tmp/023j-created.json -w '%{http_code}\n' \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${SYRANTIS_WORKSPACE_API_KEY}" \
  -X POST https://api.syrantis.fr/api/intake/inbound-message \
  --data '{
    "fromEmail": "test@example.com",
    "bodyText": "Need a heating quote follow-up.",
    "source": "runbook"
  }'
```

Expected:

- HTTP `201`
- `data.lead.source = public_inbound_message`
- `data.scoringJob.status = pending`
- `data.scoringJob.jobType = score_lead`
- response does not contain `workspaceId`, `fromEmail`, `bodyText`, full subject, contact name,
  token, API key, prompt, score, or raw payload

Save:

- `diagnosticTraceId`
- `lead.id`
- `scoringJob.id`

## 4. Idempotency Should Return 200 On Second Call

Use a synthetic `externalId`:

```bash
EXTERNAL_ID="023j-runbook-$(date -u +%Y%m%dT%H%M%SZ)"

curl -sS -o /tmp/023j-idempotent-first.json -w '%{http_code}\n' \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${SYRANTIS_WORKSPACE_API_KEY}" \
  -X POST https://api.syrantis.fr/api/intake/inbound-message \
  --data "{
    \"fromEmail\": \"test@example.com\",
    \"bodyText\": \"Need a heating quote follow-up.\",
    \"source\": \"runbook\",
    \"externalId\": \"${EXTERNAL_ID}\"
  }"

curl -sS -o /tmp/023j-idempotent-second.json -w '%{http_code}\n' \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${SYRANTIS_WORKSPACE_API_KEY}" \
  -X POST https://api.syrantis.fr/api/intake/inbound-message \
  --data "{
    \"fromEmail\": \"test@example.com\",
    \"bodyText\": \"Need a heating quote follow-up.\",
    \"source\": \"runbook\",
    \"externalId\": \"${EXTERNAL_ID}\"
  }"
```

Expected:

- first call HTTP `201`
- second call HTTP `200`
- second response has `idempotency.isReplay = true`
- second response returns the same lead ID
- no second `score_lead` job is created for the same lead

## 5. Run The Worker Once

If no continuous worker is running, run one worker pass manually from the production repo as the
runtime operator:

```bash
cd /opt/syrantis/repos/syrantis-core
set -a
source /opt/syrantis/env/core.prod.env
set +a
pnpm --filter @syrantis/api worker:once
```

Do not restart worker runtime as part of 023J.

## 6. Verify Job Status Safely

Use a status-only check for the returned `scoringJob.id`. Do not select `payload_json`, raw errors,
prompts, AI output, lead content, or provider data.

```sql
select type, status, completed_at, failed_at
from background_jobs
where id = 'RETURNED_SCORING_JOB_ID';
```

Expected:

- `type = score_lead`
- `status = completed` after a successful worker pass
- no new failed status for this job

## 7. Verify Failed Count Is Unchanged

Use the safe admin failed summary before and after the worker pass.

Expected:

- aggregate failed count does not increase because of the 023J runbook message
- historical failed `score_lead` jobs may remain
- do not inspect historical failed payloads

## 8. Safe DB SQL Without PII

Lead source marker:

```sql
select id, source, normalized_json->>'source' as intake_source, created_at
from leads
where id = 'RETURNED_LEAD_ID';
```

Expected:

- `source = email`
- `intake_source = public_inbound_message`

Safe job proof:

```sql
select id, type, status, created_at
from background_jobs
where id = 'RETURNED_SCORING_JOB_ID';
```

Safe activity metadata key review:

```sql
select type, entity_type, entity_id, jsonb_object_keys(metadata_json) as metadata_key
from activity_logs
where type = 'public_inbound_message.created'
  and metadata_json->>'diagnosticTraceId' = 'RETURNED_DIAGNOSTIC_TRACE_ID'
order by metadata_key;
```

Expected metadata keys:

- `source`
- `apiSource`
- `hasExternalId`
- `diagnosticTraceId`
- `leadId`
- `scoringJobId`
- `hasBody`
- `subjectLength`
- `bodyLength`

Forbidden metadata keys:

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

## 9. Cleanup Local Secret Variable

```bash
unset SYRANTIS_WORKSPACE_API_KEY
```

## Rollback

Rollback is code-only:

```bash
git revert <023J_COMMIT_SHA>
```

No database rollback is required because 023J adds no migration. Existing runbook-created leads,
jobs, scores, and activity logs may remain as audit evidence.
