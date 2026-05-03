# Issue 021D: Draft Send Readiness and Request-Send Hardening

## Goal

Add a tenant-scoped read-only readiness model for draft email send:

`GET /api/drafts/:id/send-readiness`

The same readiness rules must gate:

`POST /api/drafts/:id/request-send`

This keeps request-send behind an explicit readiness proof. No migration, provider call, worker execution, direct email send, UI behavior, or new operational deploy path is introduced.

## Contract

Success response:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "status": "ready",
    "canRequestSend": true,
    "blockerCount": 0,
    "warningCount": 0,
    "checks": [],
    "context": {
      "draftStatus": "approved",
      "channel": "email",
      "hasSubject": true,
      "hasBody": true,
      "hasContact": true,
      "contactHasEmail": true,
      "contactOptOut": false,
      "hasApprovedApproval": true,
      "latestEmailSendStatus": null
    }
  }
}
```

Readiness status is:

- `blocked` when any blocker exists.
- `ready_with_warnings` when warnings exist and blockers do not.
- `ready` when neither blockers nor warnings exist.

## Blockers

- `DRAFT_NOT_APPROVED`: draft status is not `approved`.
- `UNSUPPORTED_CHANNEL`: draft channel is not `email`.
- `EMPTY_SUBJECT`: subject is null or trim-empty.
- `EMPTY_BODY`: both text and HTML bodies are null or trim-empty.
- `NO_CONTACT`: draft has no linked contact.
- `INVALID_CONTACT`: linked contact is not visible in the workspace.
- `CONTACT_NO_EMAIL`: linked contact has no email address.
- `CONTACT_OPTED_OUT`: linked contact has opted out.
- `APPROVAL_NOT_CONFIRMED`: no approved approval exists for the draft.
- `EMAIL_SEND_ALREADY_PENDING`: latest email send is pending.
- `EMAIL_SEND_ALREADY_QUEUED`: latest email send is queued.
- `EMAIL_ALREADY_SENT`: latest email send is sent.

## Warnings

- `PREVIOUS_SEND_FAILED`: latest email send failed; retry is allowed.
- `PREVIOUS_SEND_CANCELLED`: latest email send was cancelled; retry is allowed.
- `NO_HTML_BODY`: text body exists but HTML body is missing.
- `NO_TEXT_BODY`: HTML body exists but text body is missing.

## Request Send

`POST /api/drafts/:id/request-send` computes readiness before the existing email-send mutation.

If blockers exist, it returns `409` with code `SEND_READINESS_BLOCKED` and does not:

- create an `email_sends` row
- create a `background_jobs` row
- create an `activity_logs` row
- call an email provider
- run a worker
- expose raw draft body, subject, contact email, provider identifiers, or AI payload fields

Warnings only do not block the existing request-send success behavior.

## Security

The route uses `tenantGuard` and derives `workspaceId` only from trusted server context via `getWorkspaceId(c)`.

Missing, archived, or cross-workspace drafts return `404`.

The readiness service may read draft subject/body and contact email internally to compute booleans and checks. The DTO and route response must not expose those raw values.
