# Issue 021C: Draft Approval Readiness and Request-Approval Hardening

## Goal

Add a tenant-scoped read-only readiness model for draft approval:

`GET /api/drafts/:id/approval-readiness`

The same readiness rules must gate:

`POST /api/drafts/:id/request-approval`

This keeps the route as intention/read-model, the database as proof, and human approval before send. No send, provider, worker, background job, migration, or UI behavior is introduced.

## Contract

Success response:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "status": "ready",
    "canRequestApproval": true,
    "blockerCount": 0,
    "warningCount": 0,
    "checks": [],
    "context": {
      "draftStatus": "draft",
      "channel": "email",
      "hasLead": true,
      "hasSubject": true,
      "hasBody": true,
      "hasContact": true,
      "contactHasEmail": true,
      "isAIGenerated": false
    }
  }
}
```

Readiness status is:

- `blocked` when any blocker exists.
- `ready_with_warnings` when warnings exist and blockers do not.
- `ready` when neither blockers nor warnings exist.

## Blockers

- `DRAFT_NOT_IN_DRAFT_STATE`: draft status is not `draft`.
- `UNSUPPORTED_CHANNEL`: draft channel is not `email`.
- `MISSING_LEAD`: draft has no lead or the linked lead is not visible in the workspace.
- `EMPTY_SUBJECT`: subject is null or trim-empty.
- `EMPTY_BODY`: both text and HTML bodies are null or trim-empty.
- `INVALID_CONTACT`: a linked contact is not visible in the workspace.
- `APPROVAL_ALREADY_PENDING`: a pending approval already exists for the draft.

## Warnings

- `NO_CONTACT_RECIPIENT`: no contact is linked.
- `CONTACT_NO_EMAIL`: linked contact exists but has no email address.
- `AI_RUN_NOT_FOUND`
- `AI_RUN_INVALID`
- `SOURCE_SCORE_NOT_FOUND`
- `AI_DRAFT_METADATA_INVALID`
- `AI_RUN_FINISH_REASON_WARNING`

AI audit warnings never block approval. Manual drafts are supported and do not require AI audit data or source scores.

## Request Approval

`POST /api/drafts/:id/request-approval` computes readiness before the existing approval mutation.

If blockers exist, it returns `409` with code `APPROVAL_READINESS_BLOCKED` and does not:

- update the draft
- create an approval
- create an activity log
- enqueue a job
- call an email provider
- call an AI provider

Warnings only do not block the existing request-approval success behavior.

## Security

The route uses `tenantGuard` and derives `workspaceId` only from trusted server context via `getWorkspaceId(c)`.

Missing, archived, or cross-workspace drafts return `404`.

The readiness response must not expose draft subject/body, raw draft metadata, contact PII, lead raw content, AI prompt/output/payload/error/cost/token fields, provider raw request/response, or secrets.
