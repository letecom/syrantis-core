# app.syrantis.fr Client Domain Runbook

## Context

Operator DNS verification is already complete:

- `app.syrantis.fr` is a CNAME to `admin.syrantis.fr`.
- `app.syrantis.fr` resolves to `178.105.0.89`.
- `admin.syrantis.fr` resolves to `178.105.0.89`.

Before 023AJ deployment/configuration, `https://app.syrantis.fr/` and
`https://app.syrantis.fr/inbox` fail with a TLS internal error because production Caddy has no
`app.syrantis.fr` site block/certificate yet.

Codex must not edit production Caddy directly, deploy, or reload services. The operator performs
the steps below on the server after the web build is deployed to the production runtime repo.

## Manual Caddy Patch

Add this site block to `/etc/caddy/Caddyfile`:

```caddyfile
app.syrantis.fr {
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
                }
        }

        handle /api/* {
                reverse_proxy 127.0.0.1:8787 {
                        header_up Host {host}
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

Do not add unnecessary `header_up X-Forwarded-Proto` or `header_up X-Forwarded-For`; current Caddy
validation warns those are redundant.

## Validate And Reload

Run:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Expected:

- validation succeeds
- reload succeeds
- Caddy obtains TLS automatically for `app.syrantis.fr` after reload

## Smoke Check

Run:

```bash
curl -I https://app.syrantis.fr/
curl -I https://app.syrantis.fr/inbox
```

Expected:

- HTTPS responds without the previous TLS internal error
- `/inbox` falls back to the web app `index.html`
- `/auth/*` and `/api/*` proxy to the API runtime

Then validate in a browser with a `role = client` test user:

- login works
- `/inbox` renders the live Inbox
- `/dashboard` renders the placeholder
- `/config` renders the placeholder
- admin-only pages are blocked or redirected away from client-visible admin surfaces
