# 023AB Draft Queue Gmail Export Actions Spec

## Goal

Add the smallest safe action layer to the Draft Queue so an admin/founder can request Gmail draft
export for a generated draft, or cancel a pending request before it is leased/exported.

This bridges:

```txt
review generated draft -> request Gmail draft export -> edit/send in Gmail
```

Final sending remains inside Gmail.

## Backend Scope

- Reuse existing 023U mutation routes:
  - `POST /api/drafts/:id/gmail-export-request`
  - `POST /api/drafts/:id/gmail-export-cancel`
  - `GET /api/drafts/:id/gmail-export-status`
- Extend the draft queue DTO with safe action capabilities:
  - `canRequestGmailExport`
  - `canCancelGmailExportRequest`
  - `canViewGmailExportStatus`
- Harden list pagination to return:
  - `limit`
  - `offset`
  - `total`
- Keep list responses preview-only and detail responses limited to generated draft body.
- Do not expose workspace IDs, raw metadata, provider payloads, prompts/outputs, lease tokens, contact
  emails, API keys, or secret material.

## Frontend Scope

- Add controlled Draft Queue buttons:
  - `Request Gmail export`
  - `Cancel request`
- Show buttons only from safe DTO action flags.
- Confirm before request/cancel.
- Disable buttons while the mutation is in flight.
- Refetch queue and open detail after successful mutation.
- Show clear success/error messages.

## Explicit Non-Goals

- No new `/api/client` mutation route.
- No migration, table, provider call, Gmail backend call, send, approval, edit, reject, dismiss, bulk
  action, checkbox, thread view, contact search, or raw JSON panel.
- No optimistic exported status.
- No activity log, background job, email send, approval, or provider side effect from Draft Queue GETs.

## Tenant Boundary

All queue reads and reused action routes derive workspace context from trusted server/session context.
Client-provided workspace selection remains forbidden.
