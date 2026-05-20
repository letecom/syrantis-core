# 023AJ Client App Foundation + Access Boundary v0

## Goal

Create the first real client app foundation while keeping the founder/admin validation app intact.
After deploy and operator Caddy configuration, `app.syrantis.fr` should serve the web app, a
`role = client` user should be able to log in, open `/inbox`, and see only the client shell.

## Scope

- Support `role = client` in TypeScript/Zod/shared role handling.
- Allow existing cookie login/session restore for client users.
- Add a `ClientShell` separate from `AdminShell`.
- Mount client app routes:
  - `/` redirects authenticated client users to `/inbox`.
  - `/inbox` renders the existing live Client Inbox page.
  - `/dashboard` renders a safe placeholder.
  - `/config` renders a safe placeholder.
- Keep `/app/client/inbox` available as the internal validation live route.
- Keep `/app/client-inbox-preview` as the mock design harness.
- Allow `client`, `admin`, and `founder` only on the approved Client Inbox API routes:
  - `GET /api/client/inbox/messages`
  - `GET /api/client/inbox/messages/:mailItemId`
  - `PATCH /api/client/inbox/messages/:mailItemId/draft`
  - `POST /api/client/inbox/messages/:mailItemId/gmail-export-request`
  - `POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel`
- Keep other admin/founder validation APIs blocked for client users.
- Add operator runbooks for `app.syrantis.fr` Caddy configuration and client test account setup.

## Access Boundary

Client Inbox APIs remain protected by `tenantGuard`. Routes must continue to extract `workspaceId`
from trusted session context only. Client-provided workspace or tenant identity in query strings,
headers, or bodies remains invalid.

This issue does not make every `/api/client/*` route client-safe. Mail Queue, Draft Queue,
Response Policy, cockpit summary, Google Sheets setup/test, workspace context, workspace API key
management, ops, and admin routes remain admin/founder-only for now.

## Database

The current `users.role` schema already allows `client`, and shared/web auth schemas already include
`client`. No migration is required for 023AJ.

## Web Contract

Client shell navigation is limited to:

- Tableau de bord
- Boîte de réception
- Configuration

Client shell must not render Ops, API Keys, Google Sheets, Pushback, Mail Queue, Draft Queue, Gmail
Export admin, Client Inbox Lab, Response Policy admin, raw JSON/debug labels, or send/reply/forward
controls.

## Caddy Foundation

023AJ does not edit `/etc/caddy/Caddyfile`, production env, systemd files, or deploy. The tracked
runbook documents the manual operator patch for `app.syrantis.fr`. DNS is already created by the
operator as `app.syrantis.fr` CNAME to `admin.syrantis.fr`; the pre-issue production symptom is a
TLS internal error because Caddy has no `app.syrantis.fr` site block/certificate yet.

## Non-Goals

- No full Dashboard.
- No full Config.
- No user management UI.
- No Integration Pilot Environment.
- No response policy rewrite UI.
- No industry context pilot.
- No impersonation.
- No direct send.
- No AI rewrite.
- No backend Gmail OAuth.
- No Apps Script change.
- No provider/OpenRouter behavior.
- No Resend behavior.
- No Google Sheets behavior.
- No worker behavior.
- No Scout.
- No production `/etc/Caddyfile` or `/etc/caddy/Caddyfile` edit.
- No production env edit.
- No deploy, merge, or PR merge.

## Required Verification

- API tests for client access to approved Client Inbox routes.
- API tests for client denial on ops, workspace API keys, Google Sheets setup/test, and workspace
  context admin routes.
- Web tests for client shell navigation, `/inbox`, `/dashboard`, `/config`, login, internal
  validation route preservation, preview preservation, and absence of admin/debug/send controls.
- Full repo checks listed in the implementation report.
