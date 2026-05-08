# Inbound Email Test Intake Runbook

## Objective

Validate the controlled inbound email test path:

```txt
admin-only test intake -> lead -> score_lead job -> worker -> lead_scores
```

This runbook does not approve public intake, API-key intake, webhooks, outbound email, auto-reply,
job retry/delete/archive, worker restart, deployment, Caddy, systemd, Docker, migration, or
production env changes.

## 1. Create A Login Cookie

Use an existing founder/admin account. Do not print or store secrets in shell history.

```bash
curl -sS -c /tmp/syrantis-admin-cookie.txt \
  -H 'content-type: application/json' \
  -X POST https://api.syrantis.fr/auth/login \
  --data '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}'
```

Confirm the session is valid:

```bash
curl -sS -b /tmp/syrantis-admin-cookie.txt \
  https://api.syrantis.fr/auth/me
```

## 2. Baseline Worker Failed Summary

Run the safe aggregate admin check before creating a test lead:

```bash
curl -sS -b /tmp/syrantis-admin-cookie.txt \
  -H 'content-type: application/json' \
  -X POST https://api.syrantis.fr/api/admin/ops/checks/worker-failed-summary \
  --data '{}'
```

Record only the aggregate failed count and summary. Do not inspect failed job payloads, raw errors,
locks, prompts, AI output, or job IDs.

## 3. Create The Test Intake Lead

```bash
curl -sS -b /tmp/syrantis-admin-cookie.txt \
  -H 'content-type: application/json' \
  -X POST https://api.syrantis.fr/api/admin/intake/test-email \
  --data '{
    "fromEmail": "test@example.com",
    "subject": "023I smoke test",
    "bodyText": "Need a heating quote follow-up.",
    "contactName": "Test Contact",
    "testLabel": "023I-prod-validation"
  }'
```

Save the returned:

- `diagnosticTraceId`
- `lead.id`
- `scoringJob.id`
- `workerBaseline.failedJobsBefore`

The response must not contain `workspaceId`, `fromEmail`, `bodyText`, full subject text, full
contact name, prompts, AI output, provider IDs, raw payloads, or `payload_json`.

## 4. Run The Worker Once

If no continuous worker is running, run one worker pass manually from the production repo as the
runtime operator:

```bash
cd /opt/syrantis/repos/syrantis-core
set -a
source /opt/syrantis/env/core.prod.env
set +a
pnpm --filter @syrantis/api worker:once
```

Do not restart the worker service as part of 023I.

## 5. Verify Job Status Safely

Use a safe status-only database check for the returned `scoringJob.id`. Do not select
`payload_json`, raw errors, prompts, AI output, lead content, or provider data.

```sql
select type, status, completed_at, failed_at
from background_jobs
where id = 'RETURNED_SCORING_JOB_ID';
```

Expected:

- `type = score_lead`
- `status = completed` after a successful worker pass
- no new failed status for this job

## 6. Verify `lead_scores`

Use the returned `lead.id`:

```sql
select count(*) as score_count
from lead_scores
where lead_id = 'RETURNED_LEAD_ID';
```

Expected:

- `score_count >= 1`

Do not select score rationale, prompt JSON, AI output JSON, or raw payloads for this validation.

## 7. Verify Failed Summary Did Not Increase

Run the safe aggregate check again:

```bash
curl -sS -b /tmp/syrantis-admin-cookie.txt \
  -H 'content-type: application/json' \
  -X POST https://api.syrantis.fr/api/admin/ops/checks/worker-failed-summary \
  --data '{}'
```

Expected:

- aggregate failed count did not increase because of the 023I test
- no fresh/recent `score_lead` failure appears

Historical failures may still exist. Do not inspect their payloads.

## 8. Verify Activity Log Metadata Safety

Use the returned `diagnosticTraceId` and a metadata-key-only review. Do not print full
`metadata_json::text`.

```sql
select type, entity_type, entity_id, jsonb_object_keys(metadata_json) as metadata_key
from activity_logs
where type = 'inbound_test.created'
  and metadata_json->>'diagnosticTraceId' = 'RETURNED_DIAGNOSTIC_TRACE_ID'
order by metadata_key;
```

Expected metadata keys:

- `source`
- `testLabel`
- `diagnosticTraceId`
- `hasBody`
- `subjectLength`
- `bodyLength`

Forbidden metadata keys:

- `fromEmail`
- `subject`
- `bodyText`
- `contactName`
- `workspaceId`
- `prompt`
- `providerMessageId`
- `payload_json`

## 9. Non-Regression Checks

Run these existing safe checks:

```bash
curl -sS https://api.syrantis.fr/health

curl -sS -b /tmp/syrantis-admin-cookie.txt \
  https://api.syrantis.fr/api/admin/ops/health

curl -sS -b /tmp/syrantis-admin-cookie.txt \
  https://api.syrantis.fr/api/integrations/google-sheets/setup-status
```

For pushback status, use a known safe email-send or draft ID from an approved validation record:

```bash
curl -sS -b /tmp/syrantis-admin-cookie.txt \
  https://api.syrantis.fr/api/email-sends/KNOWN_EMAIL_SEND_ID/pushback-status

curl -sS -b /tmp/syrantis-admin-cookie.txt \
  https://api.syrantis.fr/api/drafts/KNOWN_DRAFT_ID/pushback-status
```

For webhook route non-regression, verify the route still rejects unauthenticated/invalid webhook
traffic safely:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'content-type: application/json' \
  -X POST https://api.syrantis.fr/api/webhooks/resend \
  --data '{}'
```

Expected: a non-2xx rejection, not a server crash.

## Rollback

Rollback is code-only:

```bash
git revert <023I_COMMIT_SHA>
```

No database rollback is required. Existing test leads, jobs, scores, and activity logs may remain
as audit evidence.
