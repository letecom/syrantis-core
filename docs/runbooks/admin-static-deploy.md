# Runbook - 023D Admin Static Deploy

## Purpose

Prepare the production-safe static deployment of the existing Syrantis Admin UI.

This runbook is for a human operator after approval. Agents must not deploy, reload Caddy,
restart the API, edit `/etc/caddy/Caddyfile`, or touch `/opt/syrantis/env/core.prod.env`.

023D doctrine:

- 023A = see
- 023B = act
- 023D = expose safely
- 023C = configure

## Architecture Decision

Use option A.

Caddy serves the built Vite admin UI from:

```txt
/opt/syrantis/repos/syrantis-core/apps/web/dist
```

The same Caddy site for `admin.syrantis.fr` reverse-proxies only:

- `/auth/*` to `127.0.0.1:8787`
- `/api/*` to `127.0.0.1:8787`

The existing `api.syrantis.fr` Caddy site remains unchanged for external API, webhooks, and health.

Do not proxy `/health` under `admin.syrantis.fr` unless a future approved issue deliberately adds it.
The required API health endpoint remains `https://api.syrantis.fr/health`.

The Resend webhook remains:

```txt
https://api.syrantis.fr/api/webhooks/resend
```

## Same-Origin Browser Flow

The browser loads:

```txt
https://admin.syrantis.fr
```

The admin frontend calls:

```txt
https://admin.syrantis.fr/auth/*
https://admin.syrantis.fr/api/*
```

No browser call should go directly to `https://api.syrantis.fr` from the admin UI.

No CORS change is required.

No `VITE_API_URL` or hardcoded API origin is required.

Auth remains the existing opaque server session cookie model.

## DNS Requirement

Before Caddy validation and reload, `admin.syrantis.fr` must resolve to the production server.

Example preflight:

```bash
dig +short admin.syrantis.fr
dig +short api.syrantis.fr
```

Confirm `admin.syrantis.fr` points to the same intended production server as the Caddy host.

## Caddy Snippet

Add this as a new site block without changing the existing `api.syrantis.fr` block.

Critical rule: use `handle`, not `handle_path`, for `/auth/*` and `/api/*`.

`handle_path` strips the matched prefix. That would break Hono routes because the API must receive
the full path:

- `/auth/login` remains `/auth/login`
- `/auth/me` remains `/auth/me`
- `/api/email-sends/:id/pushback-status` remains `/api/email-sends/:id/pushback-status`
- `/api/email-sends/:id/pushback-replay` remains `/api/email-sends/:id/pushback-replay`

```caddyfile
admin.syrantis.fr {
    root * /opt/syrantis/repos/syrantis-core/apps/web/dist
    encode zstd gzip

    header {
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Frame-Options "DENY"
        -Server
    }

    handle /auth/* {
        reverse_proxy 127.0.0.1:8787 {
            header_up Host {host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-For {remote_host}
        }
    }

    handle /api/* {
        reverse_proxy 127.0.0.1:8787 {
            header_up Host {host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-For {remote_host}
        }
    }

    handle /assets/* {
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }

    handle {
        try_files {path} /index.html
        header Cache-Control "no-store, no-cache, must-revalidate"
        file_server
    }
}
```

Ordering matters:

- `/auth/*` and `/api/*` handles must appear before the static SPA fallback.
- `/assets/*` may be cached because Vite emits hashed filenames.
- `index.html` must not be aggressively cached.

## Validation Gates

Run from the production repo after human-approved resync:

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
```

API import safety:

```bash
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Caddy must validate before reload. HTTP and browser smoke tests must pass before 023D is declared
complete.

## Deployment Procedure

### A. Production Resync

Human operator only:

```bash
cd /opt/syrantis/repos/syrantis-core
git checkout main
git pull origin main
git status --short
```

Confirm the checked-out commit is the approved commit.

### B. Build And Checks

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
```

Confirm `apps/web/dist/index.html` exists:

```bash
test -f /opt/syrantis/repos/syrantis-core/apps/web/dist/index.html
find /opt/syrantis/repos/syrantis-core/apps/web/dist/assets -maxdepth 1 -type f | sort | head
```

Capture one real built asset path for smoke tests:

```bash
find /opt/syrantis/repos/syrantis-core/apps/web/dist/assets -maxdepth 1 -type f -printf '%f\n' | sort | head -n 1
```

### C. DNS And Caddy Preflight

```bash
dig +short admin.syrantis.fr
dig +short api.syrantis.fr
curl -i https://api.syrantis.fr/health
```

Expected:

- `admin.syrantis.fr` resolves to the production server.
- `api.syrantis.fr/health` returns `200`.
- Existing `api.syrantis.fr` behavior is unchanged.

Review the Caddy config before editing:

```bash
sudo caddy fmt --diff /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
```

### D. Caddy Backup, Edit, Validate, Reload

Back up the live Caddyfile:

```bash
sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup.$(date -u +%Y%m%dT%H%M%SZ)"
```

Edit `/etc/caddy/Caddyfile` manually and add only the `admin.syrantis.fr` block from this runbook.

Do not change the existing `api.syrantis.fr` block.

Validate:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
```

Reload only after validation passes:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

### E. HTTP Smoke Tests

Set a real hashed asset name from `apps/web/dist/assets`:

```bash
ADMIN_ASSET="<real-built-asset-from-dist-assets>"
```

Run:

```bash
curl -i https://admin.syrantis.fr/
curl -i "https://admin.syrantis.fr/assets/${ADMIN_ASSET}"
curl -i https://admin.syrantis.fr/app/pushback
curl -i https://admin.syrantis.fr/auth/me
curl -i https://api.syrantis.fr/health
```

Expected:

- `/` returns the admin `index.html`.
- `/assets/<real-built-asset>` returns `200` with immutable cache headers.
- `/app/pushback` returns the SPA fallback `index.html`.
- `/auth/me` returns `401` without a session cookie.
- `https://api.syrantis.fr/health` still returns `200`.

Do not claim `/admin` or admin-domain `/health` unless a future Caddy config explicitly adds them.

### F. Browser Smoke Tests

Open:

```txt
https://admin.syrantis.fr
```

Checklist:

- TLS is valid.
- Login works.
- `/auth/me` session restore works after refresh.
- Pushback lookup works.
- Replay action works if a replayable `emailSendId` is available.
- Replay requires confirmation.
- Replay UI locks while the replay request is in flight.
- Replay result displays only safe `result` and `diagnosticTraceId` values.
- Pushback status refetches after replay.
- Logout works.
- DevTools Network shows all admin calls are same-origin `admin.syrantis.fr`.
- DevTools shows no browser calls to `api.syrantis.fr` from the admin UI.
- No CORS errors appear.
- The session cookie is `HttpOnly`, `Secure`, and has the expected `SameSite` attribute.
- No auth token is stored in `localStorage` or `sessionStorage`.

### G. Safety Greps

Source checks:

```bash
rg -n "localStorage|sessionStorage|document\\.cookie|Authorization|Bearer" apps/web/src
rg -n "provider_message_id|providerMessageId|metadata_json|payload_json|rawPayload|rawGoogle|rawProvider|workspaceId|workspace_id" apps/web/src
rg -n "private_key|client_email|subject|htmlBody|textBody|contactEmail|contact_email|leadLabel|lead_label" apps/web/src
rg -n "\\bfetch\\(" apps/web/src
rg -n "@syrantis/shared" apps/web/src
```

Expected:

- No token storage, cookie access, `Authorization`, or `Bearer` usage.
- No forbidden provider IDs, raw payload fields, tenant IDs, credential markers, email body fields,
  contact email fields, or lead labels.
- `fetch(` appears only in `apps/web/src/lib/api-client.ts`.
- Runtime shared imports do not appear in `apps/web/src`.

Dist checks:

```bash
rg -n "RESEND_API_KEY|RESEND_WEBHOOK_SECRET|GOOGLE_SHEETS_CREDENTIALS_JSON|OPENROUTER_API_KEY|DATABASE_URL|MIGRATION_DATABASE_URL|private_key|client_email" apps/web/dist
rg -n "provider_message_id|providerMessageId|metadata_json|payload_json|rawPayload|rawGoogle|rawProvider|workspaceId|workspace_id" apps/web/dist
rg -n "subject|htmlBody|textBody|contactEmail|contact_email|leadLabel|lead_label" apps/web/dist
rg -n "api\\.syrantis\\.fr|VITE_API_URL" apps/web/dist
```

Expected:

- No production secret names or credential markers.
- No forbidden provider IDs, raw payload fields, tenant IDs, email body fields, contact email fields,
  or lead labels.
- No hardcoded `api.syrantis.fr`.
- No `VITE_API_URL`.

### H. Rollback

If Caddy validation fails before reload:

```bash
sudo cp /etc/caddy/Caddyfile.backup.<timestamp> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
```

If reload succeeds but admin smoke tests fail:

```bash
sudo cp /etc/caddy/Caddyfile.backup.<timestamp> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -i https://api.syrantis.fr/health
```

Then confirm:

- `https://api.syrantis.fr/health` is still `200`.
- Existing API/webhook behavior is unchanged.
- The failed admin deployment is recorded in the production report or incident notes.

No database rollback is required for 023D because it adds no schema or data migration.

## Non-Goals

023D does not:

- deploy by an agent
- edit production env
- modify backend routes, services, repositories, auth, tenant guard, providers, workers, or webhooks
- introduce CORS
- add `VITE_API_URL`
- add hardcoded `api.syrantis.fr` frontend calls
- add Google Sheets setup UI
- add dashboard features
- add an `email_sends` global list
- add DB schema or migrations
- change the existing `api.syrantis.fr` Caddy block
- serve `/health` from `admin.syrantis.fr`
