# 023AJ Client App Foundation + Access Boundary v0

## Summary

023AJ adds the first real client app foundation and access boundary.

- `role = client` can use the existing session-cookie login flow.
- Approved Client Inbox API routes now allow `client`, `admin`, and `founder`.
- Other admin/founder validation APIs remain blocked for client sessions.
- `/inbox`, `/dashboard`, and `/config` are mounted in a new `ClientShell`.
- `/app/client/inbox` remains available as the internal validation live route.
- `/app/client-inbox-preview` remains the mock design harness.
- Caddy and client test-account setup are documented for operators only.

The database schema and shared/web auth contracts already allowed `client`, so no migration was
added.

## Files Changed

- `apps/api/src/routes/client/inbox.ts`
- `apps/api/src/tests/client-inbox.test.ts`
- `apps/api/src/tests/client-access-boundary.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/ClientProtectedRoute.tsx`
- `apps/web/src/components/ClientShell.tsx`
- `apps/web/src/components/ProtectedRoute.tsx`
- `apps/web/src/lib/routing.ts`
- `apps/web/src/pages/ClientPlaceholderPage.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/tests/app.test.tsx`
- 023AJ spec, implementation report, and runbooks
- `README.md`
- `docs/architecture/current-state.md`
- `DECISIONS.md`

## Behavior

Client users are redirected from `/` and successful login to `/inbox`. If a client user attempts to
open `/app/*`, the protected admin shell redirects them to `/inbox` instead of rendering admin
navigation.

The client shell shows only:

- Tableau de bord
- Boîte de réception
- Configuration

`/dashboard` and `/config` are placeholders only. Full Dashboard and full Config remain future
issues. `/inbox` reuses `ClientInboxLivePage` and the existing shared 023AI components.

The Client Inbox route guard remains tenant-scoped through `tenantGuard`; `workspaceId` still comes
only from trusted session context. Query/header/body workspace or tenant injection is rejected.

## API Boundary

Allowed for `client`, `admin`, and `founder`:

- `GET /api/client/inbox/messages`
- `GET /api/client/inbox/messages/:mailItemId`
- `PATCH /api/client/inbox/messages/:mailItemId/draft`
- `POST /api/client/inbox/messages/:mailItemId/gmail-export-request`
- `POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel`

Still blocked for `client`:

- `/api/admin/*`
- ops routes
- workspace API key management
- Google Sheets setup/test
- workspace context admin routes
- Mail Queue, Draft Queue, Response Policy admin surfaces, and other admin validation APIs

## Operational Notes

DNS for `app.syrantis.fr` was already created by the operator as a CNAME to
`admin.syrantis.fr`. The pre-issue production symptom is a TLS internal error because Caddy has no
`app.syrantis.fr` site block/certificate yet.

023AJ does not edit production `/etc/caddy/Caddyfile`, production env, systemd files, or deploy.
`docs/runbooks/app-syrantis-client-domain.md` contains the exact operator Caddy patch and validation
steps.

`docs/runbooks/client-test-account.md` documents the current operator-only path for creating or
promoting a test user to `role = client`. It also records that a future User Manager/Admin Workspace
Control Plane is required.

## Non-Goals Preserved

No full Config, full Dashboard, Integration Pilot Environment, response policy rewrite UI,
industry context pilot, admin founder control plane, impersonation, direct send, AI rewrite, backend
Gmail OAuth, Apps Script change, provider/OpenRouter behavior, Resend behavior, Google Sheets
behavior, worker behavior, Scout, production Caddy edit, production env edit, deploy, merge, or PR
merge was added.

## Verification

Focused checks:

- `pnpm --filter @syrantis/api test -- client-inbox client-access-boundary`: passed.
- `pnpm --filter @syrantis/web test -- app client-inbox-live client-inbox-preview`: passed.

Full required checks:

- `pnpm --filter @syrantis/db verify-migration-files`: passed, `MIGRATION_FILES_OK`.
- `pnpm --filter @syrantis/db test`: passed.
- `pnpm --filter @syrantis/shared build`: passed.
- `pnpm --filter @syrantis/api test`: passed, 49 files / 813 tests.
- `pnpm --filter @syrantis/web test`: passed, 4 files / 117 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`:
  passed, printed `API_IMPORT_OK`.
- `git diff --check`: passed.

Safety greps:

- Migration SQL diff grep: no matches.
- Production env/systemd/Caddy direct-edit grep: no matches.
- Provider/App Script grep reports pre-existing provider/App Script code and docs plus 023AJ
  anti-scope documentation; 023AJ adds no provider, Gmail, Resend, OpenRouter, Google Sheets, Apps
  Script, worker, or direct-send behavior.
- Client Inbox/pages `console.log`/`console.table`/`JSON.stringify` grep reports existing
  `ResponsePolicyPage` dirty-state comparison only, not the Client Inbox feature or new client
  shell.
- Client Inbox/pages admin-label grep reports existing admin validation pages only; the new client
  shell and live `/inbox` tests assert that client users do not see admin navigation.
