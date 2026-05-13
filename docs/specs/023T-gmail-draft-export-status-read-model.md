# 023T - Gmail Draft Export Status Read Model

## Summary

023T adds a read-only founder/admin status route for one draft's Gmail export state:

```txt
GET /api/drafts/:id/gmail-export-status
```

The route is a safe read model facade over `drafts.metadata_json.gmailExport`. It does not expose
raw draft metadata, draft content, recipient email, Gmail lease token, provider identifiers, prompt
data, or output data.

## Auth And Tenancy

- Session cookie only.
- `admin` and `founder` only.
- Protected by `tenantGuard`.
- `workspaceId` comes only from trusted session context.
- Client-provided workspace or tenant identity in query parameters or headers is rejected.
- Unknown and cross-workspace drafts return `404`.
- Invalid draft UUIDs return `400`.
- Workspace API keys do not authenticate this route.

## Response Contract

The response is Zod-validated and returns:

- draft identity: `draftId`, `leadId`, `draftStatus`
- readiness flags: `hasSubject`, `hasBodyText`
- recipient state: `present`, `missing_lead`, `missing_contact`, `missing_email`, or `invalid_email`
- Gmail export state: `not_exported`, `leased`, `lease_expired`, or `exported`
- safe source and timestamps: `exportSource`, `exportedAt`, `leaseStatus`, `leaseExpiresAt`
- decision fields: `canExport`, ordered `blockingReasons`
- aggregate diagnostics: `sideEffects.emailSendsCount`, `sideEffects.approvalsCount`

## Derivation Rules

Recipient resolution uses only:

```txt
draft.lead_id -> leads.contact_id -> contacts.email
```

No fallback is allowed to `leads.normalized_json` or any email-like normalized lead key.

`gmailExport` state is read only from `drafts.metadata_json.gmailExport`; `activity_logs` is not a
source of truth. The route never returns `gmailExport` raw and never returns `leaseToken`.

`canExport` is true only when:

- draft status is `draft`
- subject and text body are non-blank
- recipient status is `present`
- export status is `not_exported` or `lease_expired`
- no active lease exists
- no `email_sends` rows exist for the draft

Approvals count is diagnostic only and does not block export.

## Non-Goals

023T does not add a migration, table, UI, Apps Script change, Gmail OAuth, Gmail API call, Google
Sheets change, provider call, worker change, scoring change, prompt change, approval creation,
`email_sends` creation, send behavior, activity log on GET, list endpoint, retry endpoint, reset
endpoint, or lease-expiry action.
