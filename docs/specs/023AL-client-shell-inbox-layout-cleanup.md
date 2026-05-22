# 023AL - Client Shell + Inbox Layout Cleanup

## Purpose

023AL removes the double-shell effect from the live client Inbox at `/inbox`.

The live client app must feel like one product surface: `ClientShell` owns global client chrome, and
the Inbox renders only its working content inside that shell. The mock preview remains a separate
design harness.

## Scope

- Frontend only.
- Keep `ClientShell` as the only live client chrome for `/inbox`.
- Keep `ClientShell` navigation limited to:
  - Tableau de bord
  - Boîte de réception
  - Configuration
- Refactor live Inbox rendering toward:
  - `ClientShell`
  - `ClientInboxLivePage`
  - embedded Inbox work area without internal sidebar, brand, account picker, workspace card, or
    user shell card.
- Preserve the 3-column Inbox work area: list, selected detail, right analysis/context/draft panel.
- Preserve live list loading, selection, detail loading, draft edit, Gmail export request, and
  Gmail export cancel behavior.
- Keep `/app/client/inbox` as the internal live validation route.
- Keep `/app/client-inbox-preview` as mock-only and free of live API calls.
- Add stable semantic test IDs where helpful:
  - `client-shell-sidebar`
  - `client-inbox-work-area`
  - `client-inbox-preview-shell`
- Clean obvious English or technical live client labels at the UI/ViewModel level only.
- Simplify the right configuration card without adding Config, personas, response profiles, or new
  API fields.

## Out Of Scope

- backend source changes
- API changes
- DB/schema/migration changes
- auth/role changes
- Caddy/env/systemd changes
- provider/OpenRouter behavior
- Resend behavior
- GmailApp/googleapis behavior
- Google Sheets behavior
- worker behavior
- direct send
- public signup
- full Config UI
- response profiles/personas
- services/offers config
- Draft Generation v2
- new integration pilot environment
- raw JSON/debug panels
- AdminShell inside ClientShell

## Acceptance

- `/inbox` renders inside `ClientShell`.
- `/inbox` has only one client navigation surface.
- `/inbox` does not render the internal preview sidebar/brand/chrome.
- `/inbox` does not render admin-only, lab, debug, raw JSON, workspace, or provider-message terms.
- `/inbox` still renders live mocked list/detail/draft/export states in tests.
- `/app/client/inbox` still renders the live internal validation route.
- `/app/client-inbox-preview` still renders the mock preview shell and makes no live API calls.
- No backend, DB, shared contract, migration, infra, provider, or deployment files are changed.
