# 023I Inbound Email Test Intake Implementation

## Summary

Implemented an admin-only inbound email test harness at:

- `POST /api/admin/intake/test-email`

The route creates a synthetic lead, enqueues one `score_lead` background job, writes one safe
activity log, and returns a safe diagnostic DTO. It does not call OpenRouter, Resend, Google, or any
provider from the intake route.

## Files Changed

- `packages/shared/src/contracts/admin-intake.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/admin-intake.ts`
- `apps/api/src/services/admin-intake.ts`
- `apps/api/src/routes/admin-intake.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/admin-intake.test.ts`
- `docs/specs/023I-inbound-email-test-intake.md`
- `docs/implementation/023I-inbound-email-test-intake.md`
- `docs/runbooks/inbound-email-test-intake.md`
- `README.md`

No migration files, DB schema files, web files, Caddy files, Docker files, systemd files, production
env files, webhook runtime, pushback runtime, email sending provider runtime, or worker runtime files
were changed.

## Backend

Added shared request and response schemas for the test harness.

The route:

- uses the existing session cookie
- runs through `tenantGuard`
- accepts only founder/admin roles
- rejects client-provided workspace IDs in query, body, or workspace headers
- validates JSON with Zod
- returns `201 Created` on success

The service:

- creates a fresh `diagnosticTraceId`
- maps repository output to a safe DTO
- exposes only booleans and IDs needed for the operator runbook

The repository performs one workspace-scoped transaction:

1. Counts failed jobs for the workspace using aggregate `count()` only.
2. Inserts a synthetic lead with DB `source = "email"` and test marker in `normalized_json`.
3. Enqueues one pending `score_lead` job via the existing enqueue helper.
4. Writes one `inbound_test.created` activity log with safe metadata.

## Source Marker Note

`leads.source` currently has a database check constraint that does not allow
`inbound_email_test`. Because 023I forbids migrations and schema changes, the lead row uses the
existing `email` source and stores the test marker in `normalized_json.source` and
`normalized_json.origin`.

The response still returns:

```json
{ "source": "inbound_email_test" }
```

This is a safe DTO marker, not the database enum value.

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
- `payload_json`

The activity log metadata excludes:

- sender email
- full subject text
- body text
- contact name
- workspace ID
- prompt data
- provider IDs
- scoring result
- background job payload

The background job payload is only:

```json
{ "leadId": "<uuid>" }
```

The failed worker baseline is count-only and does not inspect failed job payloads, IDs, raw errors,
locks, prompts, or AI output.

## Tests Added

`apps/api/src/tests/admin-intake.test.ts` covers:

- unauthenticated rejection
- non-admin rejection
- invalid and missing `fromEmail`
- subject/body length validation
- client workspace ID rejection
- minimal valid payload returning `201`
- full valid payload returning `201`
- diagnostic trace ID and worker baseline in response
- safe response DTO with no raw PII/content/workspace/payload fields
- lead creation in current workspace
- pending `score_lead` job creation
- safe minimal job payload
- exactly one activity log
- safe activity log metadata exclusions
- service-level safe DTO mapping

Worker integration is documented in the runbook rather than overbuilt into the route tests because
the existing worker performs the provider call in the normal worker path.

## Rollback

Rollback is code-only:

- remove the admin intake route registration
- remove the route, service, repository, contract, tests, and docs added for 023I
- remove the `inbound_test.created` activity log action from the shared contract

No DB rollback is required because no migration or schema change was added.
