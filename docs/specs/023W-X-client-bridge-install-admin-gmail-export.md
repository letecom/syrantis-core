# 023W-X - Client Bridge Install Pack + Admin Gmail Export Ops Panel

## Summary

023W-X adds client installation assets and two minimal admin UI surfaces for the existing Gmail
bridge:

- `/app/client-install` shows the install guide, required Script Properties, and copyable Apps
  Script template.
- `/app/gmail-export` lets an admin/founder load one draft's safe Gmail export status, request
  export, cancel before lease, and refresh.

No backend behavior is changed by this issue.

## Approved Scope

- Documentation/templates for the combined Gmail intake and Gmail draft export Apps Script.
- Client loop validation runbook.
- Admin UI routes and navigation links.
- Centralized frontend API-client helpers for existing session-authenticated Gmail export routes.
- Frontend tests for rendering, copy behavior, safe DTO display, request/cancel/refresh behavior,
  and no unsafe request bodies.

## Safety Requirements

- The frontend must use the centralized API client with `credentials: "include"`.
- The frontend must not send `workspaceId` or any tenant material.
- The Gmail export UI must not render draft subject, body text, HTML body, recipient email, contact
  name, contact ID, workspace ID, raw metadata, raw `gmailExport`, lease token, provider IDs,
  prompt/output, or API key material.
- The Apps Script must keep API keys in Script Properties only.
- The Apps Script must not log API keys, authorization headers, body text, full response bodies, or
  lease tokens.
- The Apps Script must never call Gmail send APIs.

## Non-Goals

No backend routes, migrations, DB schema changes, Gmail OAuth, Apps Script web app receiver, Google
Sheet Draft Outbox, client dashboard, automatic sending, `email_sends`, approvals, provider calls,
worker changes, scoring/draft-generation changes, draft list endpoint, inbox view, bulk export, or
admin draft preview are approved.
