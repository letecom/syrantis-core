# 023AC Client Mail Review Queue Spec

## Goal

Create a read-only admin/founder mail-centric review queue for AI-classified inbound messages.
The queue shows what Syrantis understood from inbound mail without becoming an inbox, Gmail clone,
CRM table, send workflow, approval workflow, or uncontrolled agent surface.

## Backend Scope

- Add shared DTO contract for the mail queue.
- Add session-cookie-only, tenant-guarded, admin/founder-only routes:
  - `GET /api/client/mail-queue`
  - `GET /api/client/mail-queue/:classificationId`
- Use `intake_classifications` as the source of truth.
- Use existing tables only. No migration.
- Return safe list/detail read models with:
  - classification category/action/confidence/reason
  - lead, score, draft preview, export, contact status, company context, pipeline state, attention
    flags, and next best action
- Detail identifier is `classificationId`.

## Frontend Scope

- Add `/app/mail-queue`.
- Add `Mail Queue` nav link near `Draft Queue`.
- Show:
  - non-inbox banner
  - summary cards
  - safe filters
  - compact cards/rows
  - detail drawer with classification, score, contact, draft preview, export, company context, and
    links to existing Draft Queue/Gmail Export screens

## Explicit Non-Goals

- No raw inbound body, thread view, reply, forward, archive, delete, read/unread state, checkbox,
  bulk action, contact search, full-text search, raw JSON panel, send, approve, reject, edit, or
  mark reviewed.
- No `POST`, `PUT`, `PATCH`, or `DELETE` route.
- No mutation, activity log, background job, email send, approval, draft generation, provider call,
  or external fetch on queue reads.
- No client-provided tenant or workspace selection.

## Safety Requirements

- Do not expose workspace IDs, raw metadata, provider payloads, provider IDs, lease tokens, contact
  email/name, prompt/output, API keys, or secret material.
- Cross-workspace detail reads must behave as missing and return `404`.
- API-key-only requests must not work.

## Tenant Boundary

All reads are scoped by trusted session context through `tenantGuard`. Routes extract workspace
identity only from server session context.
