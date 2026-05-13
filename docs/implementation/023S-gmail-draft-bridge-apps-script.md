# 023S - Gmail Draft Bridge via Apps Script Implementation

## Summary

023S adds a client-side Apps Script pull bridge for exporting existing Syrantis AI drafts into Gmail drafts.

The bridge uses existing workspace API keys, derives `workspaceId` from the key lookup, leases exportable drafts in `drafts.metadata_json.gmailExport`, and confirms export after `GmailApp.createDraft`.

No email is sent by Syrantis. No approval is created. No `email_sends` row is created. No migration was added.

## Files

- `packages/shared/src/contracts/gmail-export.ts`
- `packages/shared/src/contracts/index.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/repositories/drafts-gmail-export.ts`
- `apps/api/src/services/gmail-export-pending.ts`
- `apps/api/src/services/gmail-export-confirm.ts`
- `apps/api/src/routes/drafts-gmail-export.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/gmail-draft-export.test.ts`
- `docs/specs/023S-gmail-draft-bridge-apps-script.md`
- `docs/implementation/023S-gmail-draft-bridge-apps-script.md`
- `README.md`

## Behavior

`GET /api/drafts/gmail-export-pending`:

- authenticates with `Authorization: Bearer <workspace API key>`
- rejects client-provided workspace or tenant IDs
- returns only API-key workspace drafts
- filters to exportable draft rows
- resolves recipient through `draft.lead_id -> leads.contact_id -> contacts.email`
- writes a 10-minute lease into `metadata_json.gmailExport`
- returns only `draftId`, `leadId`, `toEmail`, `subject`, `bodyText`, `leaseToken`, and `leaseExpiresAt`

`POST /api/drafts/:id/gmail-export-confirmed`:

- authenticates with the same API-key mechanism
- validates draft ownership by API-key workspace
- returns already-exported drafts idempotently
- requires matching unexpired lease for first confirm
- sets `exportedAt`, clears lease fields, and preserves existing metadata keys
- writes a safe `draft.gmail_exported` activity log only on successful non-idempotent confirm

## Safety

Response payloads omit `workspaceId`, `contactId`, metadata, provider IDs, prompt/output, score, and API key material.

Activity logs include only:

- `draftId`
- `leadId`
- `source = "apps_script"`
- `exportedAt`

Activity logs exclude recipient email, subject, body, lease token, `workspaceId`, `contactId`, API key material, provider IDs, prompt/output, and raw metadata.

## Migration

No migration was added. The bridge uses existing `drafts.metadata_json`.

## Checks

Commands run during implementation:

- `pnpm --filter @syrantis/shared build`
- `pnpm --filter @syrantis/api test -- src/tests/gmail-draft-export.test.ts`
- `pnpm --filter @syrantis/api typecheck`

Full requested validation is run before handoff.

## Risks

If Apps Script creates a Gmail draft and crashes before confirm, the lease can expire and a duplicate Gmail draft can be created on a future pull. This is accepted for v1 and intentionally not solved with Gmail-side dedupe or backend Gmail state.

The route leases rows with row-level `FOR UPDATE SKIP LOCKED` behavior through Drizzle to reduce concurrent pull duplication. Exported drafts are never returned again after confirm.

## Rollback

Rollback is code-only. Revert the files listed above. No database rollback is required.
