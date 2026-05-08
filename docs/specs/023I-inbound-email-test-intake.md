# 023I - Inbound Email Test Intake

## Summary

Add an admin-only test harness for the controlled inbound email pipeline:

```txt
POST /api/admin/intake/test-email
  -> synthetic lead
  -> pending score_lead background job
  -> one safe activity log
  -> safe diagnostic DTO
```

The goal is to validate the core `lead -> score_lead job -> worker -> lead_scores` path without
adding a public intake surface.

## Route

Add:

- `POST /api/admin/intake/test-email`

The route is:

- session-cookie authenticated
- protected by `tenantGuard`
- founder/admin only
- scoped to the workspace from trusted session context
- rejected if the client sends workspace material in query, body, or workspace headers

## Request

Shared contract:

- `packages/shared/src/contracts/admin-intake.ts`

Allowed fields:

- `fromEmail`: required valid email, max 255
- `subject`: optional string, max 500
- `bodyText`: optional string, max 10000
- `contactName`: optional string, max 200
- `testLabel`: optional string, max 200

Forbidden fields:

- `workspaceId`
- `workspace_id`
- `htmlBody`
- `attachments`
- `rawMime`
- `messageId`
- `providerMessageId`
- `payload_json`

## Response

The response is safe only:

- `diagnosticTraceId`
- `testLabel`
- lead ID and boolean content flags
- safe source marker `inbound_email_test`
- pending `score_lead` job ID/status/type/enqueued timestamp
- `workerBaseline.failedJobsBefore`
- created timestamp
- processing note

The response must not include workspace IDs, sender email, body text, full subject, full contact
name, prompts, AI output, provider IDs, raw payloads, or job payload JSON.

## Lead Creation

No migration is allowed. Existing `leads.source` is constrained to:

- `email`
- `form`
- `phone`
- `manual`
- `import`

Therefore 023I stores the database lead with:

- `source = "email"`
- `status = "new"`
- `raw_content` populated from the synthetic email content so the existing score worker can read it
- `normalized_json.source = "inbound_email_test"`
- `normalized_json.origin = "inbound_email_test"`

The public response exposes the test source marker `inbound_email_test`, not the database enum
value.

## Background Job

The route enqueues exactly one background job:

- `type = "score_lead"`
- `status = "pending"`
- payload: `{ "leadId": "<uuid>" }`

No email content, sender address, subject, contact name, prompt, provider ID, or raw payload is
stored in the job payload.

## Activity Log

The route writes exactly one activity log:

- action: `inbound_test.created`
- entity type: `lead`
- entity ID: created lead ID

Allowed metadata:

- `source`
- `testLabel`
- `diagnosticTraceId`
- `hasBody`
- `subjectLength`
- `bodyLength`

Forbidden metadata:

- sender email
- full subject
- body text
- contact name
- workspace ID
- prompt
- provider IDs
- raw payload
- scoring result
- background job payload

## Worker Baseline

Before creating the lead or job, the repository counts failed jobs in the current workspace with an
aggregate count only:

- `where background_jobs.status = 'failed'`

It does not inspect failed job IDs, payloads, raw errors, locks, prompts, provider data, or AI
output.

## Non-Goals

023I does not add:

- public API-key intake
- Resend inbound webhook
- MIME parser
- IMAP
- Gmail or Outlook OAuth
- React UI
- outbound email
- auto-reply
- retry/delete/archive failed jobs
- worker restart
- systemd, Caddy, Docker, production env, migration, or schema changes

Public/API-key inbound intake is reserved for future 023J after this test harness is validated.
