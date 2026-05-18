# 023AG Clean Gmail Pilot + Admin Inbox Runtime Harness

## Summary

023AG adds an internal founder/admin validation surface for the 023AF Client Inbox Domain before
the final client Inbox UI is built.

The page lives at:

```txt
/app/client-inbox-lab
```

It consumes the existing 023AF routes only:

```txt
GET /api/client/inbox/messages
GET /api/client/inbox/messages/:mailItemId
PATCH /api/client/inbox/messages/:mailItemId/draft
POST /api/client/inbox/messages/:mailItemId/gmail-export-request
POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel
```

The lab is not the final client UI and must not adopt the 023AE premium client app primitives.

## Goals

- Validate whether a fresh Gmail bridge sends enough data into Syrantis.
- Validate whether the 023AF list/detail/action routes expose enough safe data for the future
  client Inbox.
- Make missing or intentionally withheld fields obvious before final UI work.
- Smoke-test Inbox-context draft edit and Gmail export request/cancel wrappers.

## Admin Page Scope

The page must render inside the existing protected admin shell and show the banner:

```txt
Internal validation only · Not final client UI
```

It includes:

- filter/list controls for `tab`, `sort`, and `limit`
- a list of returned mail items with operational fields and `subject:null` / `snippet:null`
- a warning that list v1 intentionally omits subject and snippet
- a selected-message detail panel using the approved detail route
- a data completeness panel for final-UI gaps
- a draft edit smoke form enabled only by `actions.canEditDraft`
- Gmail export request/cancel smoke controls enabled only by detail action flags

The detail panel may render `bodyText`, `fromEmail`, and `toEmail` because those fields are
approved only for the dedicated detail route. The page must not persist them, log them, or expose
raw response panels.

## API Client Scope

Add typed web API-client helpers using the existing central API client pattern:

- `listClientInboxMessages`
- `getClientInboxMessage`
- `updateClientInboxDraft`
- `requestClientInboxGmailExport`
- `cancelClientInboxGmailExport`

All requests must use cookie credentials through the existing API client. The frontend must not send
tenant material, authorization headers, provider calls, or direct Gmail/App Script requests.

## Data Completeness Checks

The lab computes:

- `hasBodyText`
- `hasFromEmail`
- `hasToEmail`
- `hasSubject`
- `hasDraft`
- `canEditDraft`
- `canRequestGmailExport`
- `canCancelGmailExport`
- `hasThreadId` as `not exposed` unless the DTO later exposes it
- `hasAttachments`
- `missingForFinalUI`

`missingForFinalUI` should include:

- `listSubjectPreview`
- `listSnippetPreview`
- `senderDisplay` when list sender display is null
- `companyDisplay` when list company display is null
- `attachments` when empty or unsupported
- thread context when not exposed

## Documentation Scope

023AG adds:

- `docs/runbooks/clean-gmail-client-inbox-pilot.md`
- `docs/implementation/023AG-clean-gmail-pilot-admin-inbox-lab.md`
- this spec
- README/current-state updates

The runbook must describe a real clean Gmail pilot with a fresh test account, the existing bridge,
Script Properties for the temporary key, synthetic messages, and gap recording before final UI work.

## Non-Goals

No database migration, backend route, API service/repository change, intake behavior change, worker
change, provider call, Google Sheets behavior, Caddy/env/systemd change, deployment, `app.syrantis.fr`
app shell, client role/RBAC, AI rewrite, direct send, Scout, or final client UI implementation is
approved.

`ClientInboxPreviewPage` must not be changed.

## Acceptance

- Admin-only `/app/client-inbox-lab` exists inside the protected admin app.
- The page consumes only 023AF routes.
- List subject/snippet omission is visible and documented.
- Detail-only body/email exposure is visible for admin validation.
- Draft edit and Gmail export wrappers can be smoke-tested safely.
- No raw JSON panel or secret/API key input exists.
- The page does not render final client app sidebar/product primitives.
- Clean Gmail pilot docs record the subject/snippet disclosure gap before final UI work.
