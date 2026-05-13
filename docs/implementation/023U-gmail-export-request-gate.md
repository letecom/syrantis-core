# 023U - Gmail Export Request Gate Implementation

## Files Changed

- `packages/shared/src/contracts/gmail-export.ts`
- `packages/shared/src/contracts/gmail-export-status.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/repositories/drafts-gmail-export.ts`
- `apps/api/src/services/gmail-export-request.ts`
- `apps/api/src/services/gmail-export-status.ts`
- `apps/api/src/routes/drafts-gmail-export-status.ts`
- `apps/api/src/tests/gmail-draft-export.test.ts`
- `apps/api/src/tests/gmail-export-status.test.ts`
- `docs/specs/023U-gmail-export-request-gate.md`
- `docs/implementation/023U-gmail-export-request-gate.md`
- `README.md`

## Behavior

023U adds session-only founder/admin request and cancel routes:

```txt
POST /api/drafts/:id/gmail-export-request
POST /api/drafts/:id/gmail-export-cancel
```

The request route validates readiness without exposing content, creates a 24-hour request in
`drafts.metadata_json.gmailExport`, and logs `draft.gmail_export_requested` with safe IDs and
timestamps only. An already-active request returns `already_requested` without mutating timestamps or
duplicating activity logs.

The cancel route cancels an active request that has not been leased or exported and logs
`draft.gmail_export_cancelled` with safe IDs and timestamp only.

`GET /api/drafts/gmail-export-pending` now requires an active request before leasing. Apps Script
does not change: pending still returns `draftId`, `leadId`, `toEmail`, `subject`, `bodyText`,
`leaseToken`, and `leaseExpiresAt`, and confirm still uses the existing lease token flow.

`GET /api/drafts/:id/gmail-export-status` now reports safe request state and blocks `canExport`
unless request status is `requested`.

## Safety Guarantees

023U does not:

- create a migration
- create a table
- create a UI
- change Apps Script
- call Gmail, Google Sheets, Resend, OpenRouter, or any provider
- create `email_sends`
- create approvals
- send email
- change AI draft generation, scoring, workers, Caddy, systemd, or env files

Activity logs never include subject, body, recipient email, contact identity, workspace ID, lease
token, raw metadata, provider IDs, prompt/output, API key material, authorization material, or
`syr_live_` material.

## Tests

`apps/api/src/tests/gmail-draft-export.test.ts` covers:

- unrequested drafts excluded from pending
- requested drafts returned
- expired and cancelled requests excluded
- exported drafts and active leases excluded
- expired leases with active requests re-leased
- pending response shape unchanged
- lease writes preserve request fields
- no cross-workspace leak
- no `email_sends` or approvals side effects

`apps/api/src/tests/gmail-export-status.test.ts` covers:

- request and cancel auth, UUID, not-found, cross-workspace, and conflict behavior
- request metadata writes
- idempotent active requests
- expired and cancelled request refresh
- cancel metadata writes
- safe activity logs
- request-aware status derivation and blocking reasons
- no PII/content/secret leaks
- no mutation on GET

## Migration Note

No migration was added. The existing migration file set is unchanged.
