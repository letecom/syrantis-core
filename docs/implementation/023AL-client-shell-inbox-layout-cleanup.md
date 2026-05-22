# 023AL - Client Shell + Inbox Layout Cleanup Implementation

## Summary

023AL is frontend-only. The live `/inbox` route now uses `ClientShell` as the only app chrome and
renders an embedded Inbox work area without the old preview-oriented internal sidebar, lowercase
brand, account picker, workspace card, or user shell card.

The mock `/app/client-inbox-preview` route remains a mock design harness with its visual shell and
mock data. It does not call the live API.

## Files Changed

- `apps/web/src/components/ClientShell.tsx`
- `apps/web/src/features/client-inbox/components/InboxWorkArea.tsx`
- `apps/web/src/features/client-inbox/components/InboxPanels.tsx`
- `apps/web/src/features/client-inbox/components/InboxLayout.tsx`
- `apps/web/src/features/client-inbox/components/CompanyPolicyContext.tsx`
- `apps/web/src/features/client-inbox/pages/ClientInboxLivePage.tsx`
- `apps/web/src/features/client-inbox/utils/mapApiToUi.ts`
- `apps/web/src/features/client-inbox/data/mockInbox.ts`
- `apps/web/src/features/client-inbox/index.ts`
- `apps/web/src/features/client-inbox/types/ui.ts`
- `apps/web/src/styles/client-design-tokens.css`
- `apps/web/tests/app.test.tsx`
- `apps/web/tests/client-inbox-live.test.tsx`
- `apps/web/tests/client-inbox-preview.test.tsx`
- `README.md`
- `docs/architecture/current-state.md`
- `docs/specs/023AL-client-shell-inbox-layout-cleanup.md`
- `docs/implementation/023AL-client-shell-inbox-layout-cleanup.md`
- `DECISIONS.md`

## Behavior

- `ClientShell` owns the live client navigation and exposes only Tableau de bord, Boîte de
  réception, and Configuration.
- `ClientInboxLivePage` now renders `InboxWorkArea`, a pure Inbox content surface.
- `InboxWorkArea` renders title/search/filter controls plus the list, detail, and right panel.
- `InboxPanels` centralizes list/detail/right-panel state rendering so preview and live routes keep
  shared behavior without duplicating live hooks or mutation logic.
- `InboxLayout` remains the preview frame and keeps the mock visual shell for
  `/app/client-inbox-preview`.
- The right configuration card is labelled `Configuration utilisée`, shows configured/incomplete
  status, and avoids the old raw-feeling `Règles entreprise` heading.
- Display mappings keep enum values backend-owned while French client labels stay in the UI layer.

## Safety Notes

- No backend/API source changed.
- No shared API contracts changed.
- No DB schema, migration, or migration journal file changed.
- No auth, role, tenant, provider, worker, Google Sheets, Gmail, Resend, Caddy, systemd, env, or
  deployment behavior changed.
- No raw JSON/debug panel was added.
- No AdminShell is rendered inside ClientShell.
- Config/personas/response profiles/Draft Generation v2 remain future work.

## Checks

Focused checks run during implementation:

```bash
pnpm --filter @syrantis/web typecheck
pnpm --filter @syrantis/web test -- tests/client-inbox-live.test.tsx tests/client-inbox-preview.test.tsx
```

Full required checks run and passed:

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

Safety greps were run for protected source paths, migrations, admin/lab/debug/raw terms, logging and
stringification, provider SDK names, and production env/Caddy paths. Protected backend/db/shared
contract, migration, infra, production Caddy, and production env greps returned no changed files.
The live client shell and `apps/web/src/features/client-inbox` returned no admin/lab/debug/raw term
matches; broader page/provider greps showed only pre-existing admin pages, provider modules/tests,
templates, and historical docs.
