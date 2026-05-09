# 023J Public API-Key Inbound Message Intake Implementation

## Summary

Implemented public machine-to-machine inbound message intake at:

- `POST /api/intake/inbound-message`

The route validates a workspace API key, resolves `workspaceId` from the existing API key lookup
primitive, creates a lead, enqueues a pending `score_lead` job, writes one safe activity log, and
returns a safe DTO. The HTTP route does not call OpenRouter, Resend, Google, or any outbound
provider.

## Files Changed

- `packages/shared/src/contracts/inbound-message.ts`
- `packages/shared/src/contracts/background-jobs.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/services/public-api-key-auth.ts`
- `apps/api/src/services/intake-shared.ts`
- `apps/api/src/services/public-lead-intake.ts`
- `apps/api/src/services/admin-intake.ts`
- `apps/api/src/services/inbound-message-intake.ts`
- `apps/api/src/repositories/background-jobs.ts`
- `apps/api/src/repositories/admin-intake.ts`
- `apps/api/src/repositories/inbound-message-intake.ts`
- `apps/api/src/routes/inbound-message-intake.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/inbound-message-intake.test.ts`
- `docs/specs/023J-public-api-key-inbound-message-intake.md`
- `docs/implementation/023J-public-api-key-inbound-message-intake.md`
- `docs/runbooks/public-inbound-message-intake.md`
- `README.md`

No migration files, DB schema files, web files, Caddy files, Docker files, systemd files,
production env files, webhook runtime, pushback runtime, Google Sheets runtime, or worker runtime
files were changed.

## Backend

Added a shared strict request schema and safe response schema for public inbound message intake.

The route:

- accepts only `POST /api/intake/inbound-message`
- rejects invalid JSON contracts with `422 INVALID_REQUEST`
- rejects client-supplied workspace/tenant material in query, body, or custom headers
- rejects credential material in query params
- delegates API key authentication to the existing workspace API key primitive
- returns `401` for missing, malformed, revoked, or invalid keys
- returns `429` with `Retry-After` after 10 requests per minute per API key ID
- returns `201` for new intake
- returns `200` for externalId replay

The service:

- generates a `diagnosticTraceId`
- applies the in-memory rate limiter after successful API key lookup
- passes only the trusted `workspaceId` and `apiKeyId` into the repository
- maps repository output to a safe DTO

The repository:

- updates API key `lastUsedAt`
- checks best-effort idempotency for `externalId` in the last 24 hours
- inserts the lead
- enqueues a pending `score_lead` job
- writes `public_inbound_message.created` activity metadata

Lead and job creation happen in one workspace transaction through `withWorkspaceDb`.

## Source Marker Note

`leads.source` currently has a database check constraint that does not allow
`public_inbound_message`. Because 023J forbids migrations and schema changes, the lead row uses the
existing `email` source and stores the public source marker in:

```json
{
  "source": "public_inbound_message",
  "origin": "public_inbound_message"
}
```

The response still returns:

```json
{ "source": "public_inbound_message" }
```

This follows the 023I pattern and is a DTO/business marker, not the constrained database enum
value.

## Idempotency

If `externalId` is present, replay lookup is:

- same workspace
- DB `leads.source = email`
- `normalized_json.source = public_inbound_message`
- `normalized_json.externalId = externalId`
- `created_at` within the last 24 hours

The JSON-field comparisons use Drizzle `sql` fragments because Drizzle does not expose a typed JSON
path equality helper for this expression in the current codebase. The timestamp window uses a
JavaScript cutoff date with Drizzle comparison instead of raw interval SQL.

On replay the repository returns the existing lead plus the latest matching `score_lead` job by
safe job payload `leadId`. It does not create another lead, job, or created activity log.

## Safety

The response excludes:

- `workspaceId`
- `fromEmail`
- `bodyText`
- full subject text
- full contact name
- prompts
- AI output
- provider IDs
- raw payloads
- API key or token material

The background job payload is limited to:

```json
{
  "leadId": "<uuid>",
  "diagnosticTraceId": "<uuid>",
  "source": "public_inbound_message"
}
```

The activity log metadata excludes sender email, full subject text, body text, contact name,
workspace ID, prompts, provider IDs, scoring output, authorization headers, tokens, API keys, and
raw payloads.

## Tests Added

`apps/api/src/tests/inbound-message-intake.test.ts` covers:

- missing Authorization returns `401`
- malformed Authorization returns `401`
- invalid Bearer key returns `401`
- workspaceId in body returns `422`
- `htmlBody` and `attachments` return `422`
- unknown fields return `422`
- missing/invalid `fromEmail` returns `422`
- missing/oversized `bodyText` returns `422`
- minimal valid payload returns `201`
- complete valid payload returns `201`
- lead source marker is `public_inbound_message`
- pending `score_lead` job creation
- response excludes PII and secrets
- job payload excludes PII
- activity metadata excludes PII
- duplicate `externalId` returns `200`
- replay does not create a second lead
- replay does not create a second job
- absent `externalId` creates separate leads
- rate limit returns `429`
- 023I admin intake route remains functional
- repository create path writes safe lead/job/activity metadata
- repository replay path does not insert lead/job/activity
- job enqueue failure propagates before activity metadata is written

The transaction rollback behavior is covered at repository boundary by asserting job enqueue
failure prevents the activity log write. Full database rollback is left to the existing
`withWorkspaceDb` transaction helper and should be validated with an integration DB harness if one
is introduced later.

## Rollback

Rollback is code-only:

- remove the route registration
- remove the route, service, repository, contract, tests, and docs added for 023J
- remove `public_inbound_message.created` from the shared activity log action contract
- remove optional `diagnosticTraceId` and `source` fields from the score lead job payload contract
  if no other issue has started relying on them

No DB rollback is required because no migration or schema change was added.
