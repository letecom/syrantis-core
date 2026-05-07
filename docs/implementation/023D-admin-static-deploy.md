# 023D Admin Static Deploy Implementation

## Summary

Prepared the production-safe static deployment plan for the existing Syrantis Admin UI.

This issue does not deploy the admin UI. It documents the approved option A Caddy shape for a human
operator:

- serve `apps/web/dist` from `https://admin.syrantis.fr`
- reverse-proxy `/auth/*` to `127.0.0.1:8787`
- reverse-proxy `/api/*` to `127.0.0.1:8787`
- keep `api.syrantis.fr` unchanged

The runbook explicitly requires Caddy `handle`, not `handle_path`, so Hono receives full paths.

## Files Changed

- `docs/runbooks/admin-static-deploy.md`
- `docs/implementation/023D-admin-static-deploy.md`
- `README.md`

No backend code, migrations, provider code, worker code, Docker runtime files, production env files,
or live Caddy files were changed.

## Static Serving Readiness

Confirmed from the existing web app configuration:

- Vite production build is suitable for root deployment at `/` because no custom `base` is set.
- Local development uses only Vite proxy entries for `/api` and `/auth`.
- The production API client uses relative `/auth/*` and `/api/*` paths.
- Every API client request uses `credentials: "include"`.
- No `VITE_API_URL` or hardcoded `api.syrantis.fr` frontend origin is needed.

## Runbook Coverage

The 023D runbook includes:

- architecture decision
- same-origin browser flow
- DNS requirement for `admin.syrantis.fr`
- exact Caddy block snippet
- warning to use `handle`, not `handle_path`
- security headers
- cache policy
- SPA fallback
- production validation gates
- production deployment command sections A through H
- HTTP smoke tests
- browser smoke checklist
- source and dist safety greps
- rollback plan
- non-goals

## Validation Required Before Public Completion

023D is not complete in production until a human operator performs:

- production resync
- production build/checks
- DNS/Caddy preflight
- Caddy backup/edit/validate/reload
- HTTP smoke tests
- browser smoke tests
- safety greps against source and dist

Public browser validation has not been claimed by this branch.

## Checks Run

Local branch checks:

```bash
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/web test
pnpm --filter @syrantis/web typecheck
pnpm --filter @syrantis/web lint
pnpm --filter @syrantis/web build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Results:

- `verify-migration-files`: `MIGRATION_FILES_OK`, 19 SQL files, 19 journal entries, `drift=0`
- DB tests: 46 passed
- web tests: 29 passed
- API tests through `pnpm test`: 477 passed
- API import safety: `API_IMPORT_OK`
- Vite build emitted hashed assets in `apps/web/dist/assets`

Safety checks:

```bash
rg -n "localStorage|sessionStorage|document\\.cookie|Authorization|Bearer" apps/web/src
rg -n "provider_message_id|providerMessageId|metadata_json|payload_json|rawPayload|rawGoogle|rawProvider|workspaceId|workspace_id" apps/web/src
rg -n "private_key|client_email|subject|htmlBody|textBody|contactEmail|contact_email|leadLabel|lead_label" apps/web/src
rg -n "\\bfetch\\(" apps/web/src
rg -n "@syrantis/shared" apps/web/src
rg -n "RESEND_API_KEY|RESEND_WEBHOOK_SECRET|GOOGLE_SHEETS_CREDENTIALS_JSON|OPENROUTER_API_KEY|DATABASE_URL|MIGRATION_DATABASE_URL|private_key|client_email" apps/web/dist
rg -n "provider_message_id|providerMessageId|metadata_json|payload_json|rawPayload|rawGoogle|rawProvider|workspaceId|workspace_id" apps/web/dist
rg -n "subject|htmlBody|textBody|contactEmail|contact_email|leadLabel|lead_label" apps/web/dist
rg -n "api\\.syrantis\\.fr|VITE_API_URL" apps/web/dist
```

Results:

- source token/cookie/header grep: no matches
- source forbidden field greps: no matches
- source direct fetch grep: only `apps/web/src/lib/api-client.ts`
- source runtime shared import grep: no matches
- dist secret and forbidden field greps: no matches
- dist hardcoded API origin grep: no matches

## Rollback

Rollback is Caddy-only:

- restore the previous `/etc/caddy/Caddyfile` backup
- validate Caddy
- reload Caddy
- verify `https://api.syrantis.fr/health`

No database rollback is required.
