# 023T - Gmail Draft Export Status Read Model Implementation

## Files Changed

- `packages/shared/src/contracts/gmail-export-status.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/drafts-gmail-export-status.ts`
- `apps/api/src/services/gmail-export-status.ts`
- `apps/api/src/routes/drafts-gmail-export-status.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/gmail-export-status.test.ts`
- `docs/specs/023T-gmail-draft-export-status-read-model.md`
- `docs/implementation/023T-gmail-draft-export-status-read-model.md`
- `README.md`

## Behavior

023T adds:

```txt
GET /api/drafts/:id/gmail-export-status
```

The route is session-cookie authenticated, `admin`/`founder` only, tenant-scoped by `tenantGuard`,
and mounted under `/api/drafts`. Invalid UUIDs return `400`; unknown and cross-workspace drafts
return `404`; API keys do not authenticate the route.

The service derives a stable DTO from `drafts.metadata_json.gmailExport` plus safe relational state:

- draft readiness from `drafts.status`, `drafts.subject`, and `drafts.text_body`
- recipient status from `draft.lead_id -> leads.contact_id -> contacts.email`
- export and lease status from `metadata_json.gmailExport`
- aggregate diagnostics from counts of `email_sends` and `approvals`

The response does not include recipient email, contact ID, workspace ID, subject, body, raw metadata,
raw `gmailExport`, lease token, provider IDs, prompt, output, API key material, or authorization
material.

## Read-Only Guarantees

The route only reads from `drafts`, `leads`, `contacts`, `email_sends`, and `approvals`.

It does not:

- mutate `drafts.updated_at`
- mutate `drafts.metadata_json`
- create `activity_logs`
- create `background_jobs`
- create `email_sends`
- create `approvals`
- call Gmail, Google Sheets, Resend, OpenRouter, or any provider

## Tests

`apps/api/src/tests/gmail-export-status.test.ts` covers:

- 401 without session
- 403 for non-admin/non-founder users
- 400 invalid UUID
- 404 unknown and cross-workspace draft
- API-key-only access rejected
- read-only mutation guards
- all required export, lease, recipient, and exportability derivations
- approval count as diagnostic only
- PII/content/secret leak guards
- no fallback to `leads.normalized_json`
- source guard against provider, Gmail, Sheets, send, activity log, worker, and mutation behavior

## Migration Note

No migration was added. Migration SQL file count remains 21.
