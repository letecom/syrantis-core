# 023AA Client Draft Review Queue Spec

## Goal

Create a read-only admin/founder review queue for AI-generated client drafts so operators can inspect draft quality and context without pasting UUIDs.

This is not an inbox, CRM surface, approval workflow, export workflow, send workflow, or agent execution surface.

## Backend Scope

- Add shared DTO contract for the draft queue.
- Add session-cookie-only, tenant-guarded, admin/founder-only routes:
  - `GET /api/client/draft-queue`
  - `GET /api/client/draft-queue/:draftId`
- Use existing tables only. No migration.
- Return list preview only in the list route.
- Return full generated draft subject/body only in the detail route.
- Never return raw inbound lead body, raw metadata, provider payloads, provider IDs, lease tokens, workspace IDs, contact email/name, prompts, outputs, API keys, or secret material.
- Derive safe queue signals:
  - score band, score, confidence, recommended action, urgency, intent
  - safe workspace/contact context summary
  - Gmail export status
  - review status
  - attention flags

## Frontend Scope

- Add `/app/draft-queue`.
- Add `Draft Queue` nav link.
- Show:
  - read-only warning banner
  - summary cards
  - score/export/attention filters
  - card-based draft list
  - detail drawer with full generated draft

## Explicit Non-Goals

- No send, approve, reject, edit, mark reviewed, dismiss, export, checkbox, bulk action, thread view, contact search, raw JSON view, or provider call.
- No `POST`, `PUT`, `PATCH`, or `DELETE` route.
- No mutation, activity log, background job, email send, approval, provider call, or external fetch on queue reads.
- No client-provided tenant or workspace selection.

## Tenant Boundary

All reads are scoped by trusted session context through `tenantGuard`. Cross-workspace detail reads must behave as missing and return `404`.
