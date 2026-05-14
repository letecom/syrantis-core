# 023Y - Client Cockpit + Bridge Status Read Models

## Summary

023Y adds a minimal read-only client cockpit foundation. It provides one backend aggregate read model
and one frontend page so an admin/founder can see safe pipeline and bridge status without exposing
PII, raw draft content, raw provider data, or operational internals.

## Approved Scope

- Add `GET /api/client/cockpit-summary`.
- Add `/app/client-dashboard`.
- Add a strict shared Zod contract for the response DTO.
- Aggregate from existing `leads`, `lead_scores`, `drafts`, and `background_jobs` tables only.
- Add backend and frontend tests for auth, tenant isolation, aggregate correctness, empty/error
  states, safe rendering, and zero write behavior.
- Update README and implementation documentation.

## Backend Contract

The route returns `ClientCockpitSummaryResponseSchema` with:

- 24-hour generated window.
- Pipeline counts: leads, scored leads, generated drafts, pending drafts.
- Gmail export aggregate status from `drafts.metadata_json.gmailExport`.
- Gmail intake activity derived from lead creation timestamps.
- Google Sheets status as `unknown` for this issue.
- Worker queue aggregate status from background jobs.
- Static safe action links only.

## Auth And Tenant Boundary

- Session cookie authentication only.
- Admin/founder only for now.
- `tenantGuard` resolves `workspaceId` server-side.
- API-key authentication is not accepted.
- No client role is added in this issue.
- Client-provided workspace identity in query, headers, body, URL params, or state is ignored.

## Safety Requirements

- Route is read-only.
- No migration or schema change.
- No Apps Script change.
- No Gmail OAuth or provider call.
- No Google Sheets setup test, append, or external API call.
- No settings storage, classifier, intake pause, export pause, or draft queue.
- No worker, scoring, draft generation, send, approval, or email send behavior change.
- No activity log on GET.
- Response must contain only aggregate numbers, timestamps, enums, nulls, and safe hrefs.
- Response must not contain PII, emails, names, subject/body content, raw metadata, raw payloads,
  prompts, outputs, provider IDs, lease tokens, API keys, workspace IDs, or secrets.

## Frontend

`/app/client-dashboard` renders:

- Read-only title/subtext and generated/window timestamps.
- Pipeline metric cards.
- Gmail intake, Gmail export, Google Sheets, and system status cards.
- Static action links to `/app/gmail-export` and `/app/client-install`.
- A disabled future draft queue action.

It does not render charts, raw JSON, email/lead/draft tables, draft ID paste inputs, workspace IDs,
provider IDs, lease tokens, subject/body content, API keys, prompts, outputs, or raw metadata.

## Non-Goals

No migration, schema change, Apps Script edit, Gmail OAuth, inbox clone, CRM dashboard, bulk action,
recent-activity route, bridge-status route, client role, draft queue, settings, classifier,
provider call, send behavior, approvals creation, `email_sends` creation, activity logging, or raw
logs are approved.

## Follow-On Preparation

This read model prepares 023Z, 023AA, and 023AC by creating the safe client cockpit namespace and
DTO surface without granting broader client access or adding mutating workflows.
