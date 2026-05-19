# 023AI Client Inbox UI v1 Live With Shared Preview Components

## Goal

023AI starts the final client Inbox UI work as one issue delivered in two PRs.

- PR A extracts reusable client Inbox UI components and refactors `/app/client-inbox-preview` to
  use them.
- PR B adds the live `/app/client/inbox` route, UI-to-API adapter, and live API integration.

PR A keeps the 023AE preview as the design harness. The preview must stay visually aligned with
`docs/implementation/UIInboxClient.png` and must remain separate from the Admin Client Inbox Lab.

## PR A Scope

- Add `apps/web/src/features/client-inbox/` as the client Inbox feature boundary.
- Define UI ViewModel types in `types/ui.ts`; shared components consume these types only.
- Add mock Inbox data in `data/mockInbox.ts` using `subjectPreview` and `snippetPreview` for list
  rows.
- Extract reusable layout, sidebar, topbar, filters, list, detail, analysis, contact context,
  company rules, draft, export controls, badges, and state components.
- Refactor `apps/web/src/pages/ClientInboxPreviewPage.tsx` into a thin design harness.
- Preserve isolated `client-design-tokens.css` usage.
- Add web tests for preview rendering, list/detail disclosure boundaries, no admin/debug language,
  ignored/no-draft/export-requested states, and isolated empty/loading/error states.
- Update docs for the 023AI split and PR A implementation boundary.

## PR A Non-Goals

- No live `/app/client/inbox` route.
- No live API adapter.
- No backend route, service, repository, schema, or migration change.
- No provider, Gmail API, Resend, OpenRouter, Google Sheets, Caddy, systemd, env, or deployment
  change.
- No client RBAC, domain split, or `app.syrantis.fr` foundation.
- No direct send, inline reply, compose, archive, delete, spam, folders, checkboxes, or Gmail clone
  behavior.

## UI Contract

Shared components consume UI ViewModel objects, not backend DTOs. PR B maps 023AF/023AH API DTOs
into those ViewModels through a live adapter before rendering.

List item ViewModels include semantic display fields for the requested list contract. PR A uses
`*Text` field names in code for user-facing text values so the feature source stays clean under the
existing `Lab` safety grep; PR B can map API DTO fields into the same ViewModels.

List item ViewModels include:

- `id`
- `initials`
- `contactName`
- `companyName`
- `receivedText`
- `subjectPreview`
- `snippetPreview`
- `score`
- `scoreBand`
- `categoryText`
- `contactStatusText`
- `draftStatus`
- `exportStatus`
- `attentionTexts`
- `selected`

Detail ViewModels include:

- `subject`
- `bodyText`
- `fromDisplay`
- `fromEmail`
- `toDisplay`
- `toEmail`
- `receivedText`
- `quickContext`
- `attachments`
- `analysis`
- `contactContext`
- `companyPolicyContext`
- `draft`
- `actions`

## Disclosure Rules

- List components must never render full `bodyText`, `fromEmail`, or `toEmail`.
- Detail components may render full `bodyText`, `fromEmail`, and `toEmail`.
- Shared components must not render IDs, raw JSON, provider fields, workspace identifiers, lab
  language, or admin/debug controls.
- No `console.log`, `JSON.stringify`, or unsafe `data-*` payloads are allowed in the shared feature
  components.

## Preview Data Requirements

The mock preview data must cover:

- hot lead
- warm lead
- cold lead
- ignored newsletter
- draft ready
- no draft
- export requested
- existing, returning, and new contact states

The preview remains a mock-only visual contract and must not call the live API.

## PR B Scope

PR B adds:

- `/app/client/inbox` as the live internal client Inbox route inside the current web app.
- A live adapter that reuses the existing 023AF/023AH API client helpers.
- Query/mutation hooks for list, selected detail, draft edit, Gmail export request, and Gmail
  export cancel.
- Selection handling that auto-selects the first loaded item and fetches selected detail with
  React Query abort signals to prevent stale detail responses from winning.
- Minimal route filters for `all`, `needs_review`, `hot`, `ready_draft`, and `ignored`, with
  `sort=newest` and `limit=20`.
- Draft edit controls only when `actions.canEditDraft` is true.
- Gmail export request controls only when `actions.canRequestGmailExport` is true, with explicit
  confirmation that Gmail remains the manual final-send surface.
- Gmail export cancel controls only when `actions.canCancelGmailExport` is true.
- Web tests for route rendering, list/detail disclosure, selection, no-draft/ignored/exported
  states, mutation refetching, loading/empty/error states, and forbidden admin/debug/send controls.

PR B keeps `/app/client-inbox-preview` as the mock design harness. The Admin Client Inbox Lab
remains separate and is not reused.

PR B does not add backend routes, migrations, provider calls, OpenRouter, GmailApp/googleapis,
Resend, Google Sheets, Caddy/env/systemd changes, `app.syrantis.fr`, client RBAC/domain split,
dashboard/config UI, AI rewrite, direct send, or Scout behavior.
