# 023J - Public API-Key Inbound Message Intake

## Summary

Add a public machine-to-machine intake endpoint:

```txt
POST /api/intake/inbound-message
```

The endpoint lets Make, Zapier, scripts, future Resend adapters, future Gmail adapters, or future
Scout pipelines submit one structured plain-text inbound message to Syrantis.

Flow:

```txt
external system
  -> POST /api/intake/inbound-message
  -> workspace API key lookup
  -> workspaceId resolved server-side
  -> public inbound message lead marker
  -> pending score_lead job
  -> safe activity log
  -> safe response
```

## Auth

The route requires:

```txt
Authorization: Bearer <workspace_api_key>
```

It reuses the existing workspace API key primitive:

- bearer extraction for keys with the `syr_live_` prefix
- SHA-256 hash lookup
- `withApiKeyLookupDb`
- `workspace_api_keys.status = active`
- trusted `workspaceId` returned from the database row

The route must not accept workspace identity from request body, query params, URL params, custom
headers, or client-side state.

Missing, malformed, revoked, or invalid API keys return a generic `401`.

## Request

Shared contract:

- `packages/shared/src/contracts/inbound-message.ts`

Allowed JSON fields:

- `fromEmail`: required email, max 255
- `bodyText`: required plain text, min 1, max 10000
- `source`: optional string, max 100, default `api`
- `externalId`: optional nullable string, max 255
- `contactName`: optional nullable string, max 200
- `subject`: optional nullable string, max 500
- `receivedAt`: optional nullable ISO datetime

The schema is strict. Unknown fields are rejected.

Forbidden examples include:

- `workspaceId`, `workspace_id`, `tenantId`, `tenant_id`
- `htmlBody`, `html_body`, `attachments`, `files`
- `rawPayload`, `rawProvider`, `rawGoogle`, `rawMime`, `mime`, `headers`
- `providerMessageId`, `provider_message_id`
- `prompt`, `score`, `leadId`, `jobId`
- `apiKey`, `token`

## Response

The success response is safe only:

- `diagnosticTraceId`
- lead ID and boolean content flags
- source marker `public_inbound_message`
- `score_lead` job ID/status/type/enqueued timestamp
- idempotency replay flag and externalId
- created timestamp
- processing note

The response must not include workspace IDs, sender email, body text, full subject, contact name,
raw provider payloads, prompts, scores, provider IDs, API keys, or tokens.

## Lead Creation

No migration is allowed. Existing `leads.source` is constrained to:

- `email`
- `form`
- `phone`
- `manual`
- `import`

Therefore 023J follows the 023I pattern:

- database column `leads.source = "email"`
- public source marker in `normalized_json.source = "public_inbound_message"`
- public source marker in `normalized_json.origin = "public_inbound_message"`
- response exposes `lead.source = "public_inbound_message"`

The lead stores the plain-text message in the existing lead business content field so the existing
`score_lead` worker path can process it. Technical payloads remain safe.

Allowed safe normalized metadata:

- `source`
- `origin`
- `apiSource`
- `externalId` when provided
- `receivedAt` when provided
- `diagnosticTraceId`
- `hasBody`
- `subjectPresent`
- `contactNamePresent`
- `subjectLength`
- `bodyLength`

## Background Job

For a new message, enqueue one pending job:

- `type = score_lead`
- `status = pending`
- payload:

```json
{
  "leadId": "<uuid>",
  "diagnosticTraceId": "<uuid>",
  "source": "public_inbound_message"
}
```

The job payload must not contain sender email, contact email, body text, subject, contact name,
prompt, score, API key, token, or raw payload.

## Activity Log

For a new message, write one activity log:

- `type = public_inbound_message.created`
- `entity_type = lead`
- `entity_id = leadId`

Allowed metadata:

- `source`
- `apiSource`
- `hasExternalId`
- `diagnosticTraceId`
- `leadId`
- `scoringJobId`
- `hasBody`
- `subjectLength`
- `bodyLength`

The activity log metadata must not contain sender email, contact email, body text, raw subject,
contact name, API key, authorization header, token, prompt, score, raw payload, or provider message
IDs.

## Idempotency

If `externalId` is provided, idempotency is best-effort without migration:

- same workspace
- public inbound message source marker
- same `normalized_json.externalId`
- lead created in the last 24 hours

Replay behavior:

- return `200`
- return the existing lead and latest matching `score_lead` job
- do not create a second lead
- do not create a second job
- do not write another `public_inbound_message.created` activity log

If `externalId` is absent, every valid request creates a new lead and job.

## Rate Limit

Use an in-memory fixed-window limiter:

- 10 requests per minute
- keyed by API key ID, with workspace ID as fallback if a helper ever omits key ID
- `429` with `Retry-After` when exceeded

No Redis or database rate-limit table is added.

## Non-Goals

023J does not add:

- migrations
- frontend
- Caddy
- systemd
- Docker
- production env changes
- Resend inbound webhook
- Gmail or Outlook OAuth
- IMAP
- MIME parsing
- attachments
- HTML body
- outbound email
- auto-send or auto-reply
- AI calls inside the HTTP route
- worker runtime changes
- pushback, replay, webhook, or Google Sheets runtime changes
- cleanup of historical failed jobs
