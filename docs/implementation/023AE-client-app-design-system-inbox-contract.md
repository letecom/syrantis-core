# 023AE Client App Design System + Inbox Product Contract Implementation

## Summary

Implemented the 023AE design freeze for the future client app. The repo now has client Inbox
contract documentation, isolated client design tokens, and a mock-only `/app/client-inbox-preview`
route that visually approximates the authoritative Inbox reference without backend calls.

## Files Changed

- `docs/design/client-app-ui-contract.md`
- `docs/design/client-inbox-ui-reference.md`
- `docs/design/client-design-tokens.md`
- `docs/design/client-inbox-backend-contract.md`
- `docs/specs/023AE-client-app-design-system-inbox-contract.md`
- `docs/implementation/023AE-client-app-design-system-inbox-contract.md`
- `apps/web/src/styles/client-design-tokens.css`
- `apps/web/src/pages/ClientInboxPreviewPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/tests/app.test.tsx`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Behavior

- `/app/client-inbox-preview` renders an isolated mock preview with client-only navigation, mock
  mail list, selected mail reading panel, Syrantis AI analysis, context cards, draft reply, and
  static Valider/Exporter vers Gmail actions.
- The preview uses mock Lumière Services/Pierre Belanger data only.
- The preview copy is French-first for client-facing labels.
- The preview shell is viewport-height with internal column scrolling to keep the right AI/draft
  action panel visible on a normal desktop viewport.

## Polish Pass

- Client-facing preview copy now uses French labels such as `Boîte de réception`, `Analyse IA
Syrantis`, `Brouillon IA`, `Valider`, and `Exporter vers Gmail`.
- Filter chips, badges, card headings, search placeholder, sort control, context labels, and draft
  actions were localized.
- The preview layout now uses a fixed viewport-height shell with internal scrolling for the message
  list, reading panel, and AI panel, reducing full-page vertical scroll on desktop.
- The preview route is not mounted inside the current admin shell, so admin-only navigation does
  not appear in the mock client app.

## Safety Notes

- No migration was added.
- No API route, backend service, intake behavior, provider call, Gmail logic, or deployment file was
  added.
- The preview page imports no API client and performs no fetch.
- The preview has no bulk checkboxes, raw JSON/debug panels, admin-only client sidebar terms, or
  provider metadata.

## Checks

Required checks passed:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Required safety greps returned no output:

```bash
git diff --name-only origin/main...HEAD | grep -E '^packages/db/migrations/.*\.sql$' || true
git diff --name-only origin/main...HEAD | grep -E '^apps/api/src/routes/' || true
grep -RIn "fetch(\|apiClient\|OpenRouter\|openrouter\|Resend\|resend\|GmailApp\|googleapis\|gmail\.users" apps/web/src/pages/ClientInboxPreviewPage.tsx || true
grep -RIn "Ops\|API Keys\|Google Sheets\|Pushback" apps/web/src/pages/ClientInboxPreviewPage.tsx || true
```

Polish pass checks passed:

```bash
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

## Rollback

Rollback removes the preview page, client token CSS, route, tests, and 023AE docs. Because no
backend behavior or migration was added, rollback has no data impact.
