# 023AI-A Client Inbox Shared Components Preview Refactor Implementation

## Summary

023AI is one issue split across two PRs. This PR A extracts reusable client Inbox components and
refactors `/app/client-inbox-preview` to consume those shared components with mock UI ViewModels.
PR B will add the live route, API adapter, and live API integration later.

The preview remains the 023AE design harness. The Admin Client Inbox Lab remains separate and is
not reused.

## Files Changed

- `apps/web/src/features/client-inbox/types/ui.ts`
- `apps/web/src/features/client-inbox/data/mockInbox.ts`
- `apps/web/src/features/client-inbox/utils/formatters.ts`
- `apps/web/src/features/client-inbox/components/*`
- `apps/web/src/features/client-inbox/index.ts`
- `apps/web/src/pages/ClientInboxPreviewPage.tsx`
- `apps/web/src/styles/client-design-tokens.css`
- `apps/web/tests/app.test.tsx`
- `apps/web/tests/client-inbox-preview.test.tsx`
- `docs/specs/023AI-client-inbox-ui-live-shared-components.md`
- `docs/implementation/023AI-A-client-inbox-shared-components-preview-refactor.md`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Behavior

- `/app/client-inbox-preview` still renders outside the admin shell.
- The preview now uses `InboxLayout`, shared sidebar/topbar/filter/list/detail/right-panel
  components, and `mockClientInbox`.
- Shared components consume UI ViewModel types only; they do not import API DTOs or the web API
  client.
- User-facing display fields use `*Text` names in source so the existing `Lab` anti-scope grep does
  not match `Label` substrings inside the shared feature.
- List rows render `subjectPreview` and `snippetPreview` copy and do not receive body or email
  fields.
- The selected detail panel renders the approved detail context, including full body and email
  addresses.
- Mock data covers hot, warm, cold, ignored, draft-ready, no-draft, export-requested, existing,
  returning, and new contact states.
- Buttons remain inert mock controls for PR A.

## Safety Notes

- No backend route, service, repository, schema, migration, provider, Google Sheets, Resend,
  OpenRouter, Caddy, systemd, env, deployment, client RBAC, or `app.syrantis.fr` change was added.
- No live `/app/client/inbox` route or live API adapter was added.
- Admin Client Inbox Lab components are not imported or reused.
- Shared components do not show raw JSON, IDs, workspace identifiers, provider identifiers, lab
  wording, admin navigation, folders, checkboxes, compose, archive/delete/spam, inline reply, or
  direct send controls.

## Checks

Required checks passed:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web typecheck
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Safety checks:

```bash
git diff --name-only origin/main...HEAD | grep -E '^packages/db/migrations/.*\.sql$' || true
git diff --name-only origin/main...HEAD | grep -E '^apps/api/src/' || true
git diff --name-only origin/main...HEAD | grep -E '(^ops/systemd/|Caddyfile|\.env|core\.prod\.env|/etc/systemd)' || true
grep -RIn "console\.log\|JSON\.stringify" apps/web/src/features/client-inbox apps/web/src/pages/ClientInboxPreviewPage.tsx 2>/dev/null || true
grep -RIn "Ops\|API Keys\|Google Sheets\|Pushback\|Lab\|Validation interne\|Smoke form\|Data completeness\|workspaceId\|providerMessageId" apps/web/src/features/client-inbox apps/web/src/pages/ClientInboxPreviewPage.tsx 2>/dev/null || true
```

These safety checks returned no output. The broad provider grep over `apps packages docs` still
finds pre-existing provider references from prior approved issues; this PR adds no backend,
provider, or runtime provider behavior.

## Rollback

Rollback removes `apps/web/src/features/client-inbox/`, restores the former self-contained preview
page, removes the added preview tests, and reverts the 023AI-A docs. Because PR A is UI-only and
mock-only, rollback has no database or backend behavior impact.
