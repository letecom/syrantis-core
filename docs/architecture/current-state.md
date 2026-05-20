# Current State

Syrantis Core is currently a documentation and Build OS foundation repo. It is not an application yet.

## Current Repo State

Present:

- governance docs
- agent rules
- decision log
- daily log
- issue spec and implementation report structure
- architecture state document
- runbooks
- future-scope holding area

Not present:

- React app
- Hono API
- Drizzle schema
- Docker Compose runtime config
- package manager initialization
- `.env`
- business code

## Target Stack

The planned technical stack is:

- React + Vite
- Hono + Zod
- PostgreSQL + Drizzle
- pg-boss
- Resend
- Docker Compose
- Caddy
- pnpm monorepo

No part of this stack is initialized by Issue 000.

## Server Model

Target root: `/opt/syrantis`.

- `/opt/syrantis/repos`: production runtime repos
- `/opt/syrantis/repos/syrantis-core`: production runtime repo
- `/opt/syrantis/agent-workspaces`: development and agent workspaces
- `/opt/syrantis/agent-workspaces/codex/syrantis-core`: Codex workspace
- `/opt/syrantis/env/core.prod.env`: production runtime env file
- `/opt/syrantis/scripts`: server scripts
- `/opt/syrantis/reports`: server reports

Production runtime and development workspaces are separated by path and responsibility.

## Operational Rules

- Codex is used through VSCode Remote SSH.
- Codex is not installed as the primary server tool.
- Agents never deploy.
- Agents never read or modify production env.
- Agents never work directly in the production runtime repo.
- Production env lives outside Git at `/opt/syrantis/env/core.prod.env`.

## Product Boundary

The 90-day wedge is plumbers and heating contractors with Lead Response and Devis Relance.

All other feature ideas belong in `docs/future/` until approved.

## 023Z Intake Classification State

Public API-key Gmail intake now has a conservative deterministic classification gate before lead
creation. The gate stores only safe classification metadata in `intake_classifications` with
workspace RLS and FORCE RLS. Obvious machine noise can be ignored without creating leads or
`score_lead` jobs; human-looking and ambiguous mail still enters the normal review lead path.

The intake route remains backend-only and does not call Gmail, Google, Resend, OpenRouter, or
external providers. Gmail labeling remains in the client-owned Apps Script bridge.

## 023AC Client Mail Review Queue State

Admin/founder sessions now have a read-only mail-centric review queue backed by
`intake_classifications`:

- `GET /api/client/mail-queue` returns a safe paginated view of classifications and derived
  lead/scoring/draft/Gmail export state.
- `GET /api/client/mail-queue/:classificationId` returns safe detail for one classification.
- `/app/mail-queue` shows summary cards, filters, compact queue cards, and a detail drawer.

The queue does not expose raw inbound email bodies, raw metadata, provider payloads, contact
email/name, workspace IDs, prompts, outputs, lease tokens, API key material, or mutation actions.
It does not call Gmail, Google, Resend, or any provider and does not create activity logs,
background jobs, drafts, approvals, or sends.

## 023AD Client Response Policy Pack State

Admin/founder sessions now have a bounded client response policy configuration surface:

- `GET /api/client/response-policy` returns a safe empty/default policy or configured policy.
- `PUT /api/client/response-policy` stores policy under
  `workspace_context_profiles.context_json.responsePolicy`.
- `/app/response-policy` provides a compact form for language, tone, signature, response structure,
  business rules, forbidden claims, escalation rules, offer notes, catalog summary, and example
  replies.

No migration was added. Existing workspace context columns and unrelated `context_json` keys are
preserved. Policy activity logs contain only `policyConfigured`, `changedFields`, and `source`.

`generate_ai_draft` consumes configured response policy in prompt context and records
`contextUsed.responsePolicy`/`contextSourcesUsed.responsePolicy` as server-derived booleans. The
worker still blocks `prior_complaint` before provider calls, AI run creation, or draft creation.

The feature does not add provider calls from routes, Gmail/Google/Resend calls, send/export/approval
actions, file uploads, raw JSON panels, or prompt/output exposure.

## 023AE Client App Design System + Inbox Contract State

023AE freezes the first client-facing product contract before the live Inbox is built:

- `admin.syrantis.fr` remains founder/operator/admin/debug/ops.
- `app.syrantis.fr` is the future client-facing app with Dashboard, Inbox, and Config at first.
- Inbox is the primary client surface; Dashboard is summary and Config is setup/behavior.
- `/app/client-inbox-preview` is a mock-only visual preview aligned to
  `docs/implementation/UIInboxClient.png`.
- `docs/design/` now records the client UI contract, visual reference, client design tokens, and
  future Client Inbox backend contract.

023AE adds no migration, API route, backend service, intake behavior, provider call, Gmail logic,
client auth, deployment behavior, draft editing, or export mutation. The future live Inbox still
requires a dedicated Client Inbox Domain before it can display full client-visible mail bodies or
perform draft/export actions.

## 023AF Client Inbox Domain v1 State

023AF creates the first dedicated backend domain for the future live client Inbox:

- `client_mail_items` stores workspace-scoped client-visible mail items with RLS, FORCE RLS, tenant
  isolation, updated-at trigger, idempotent external id index, and links to classifications, leads,
  contacts, and drafts.
- Public inbound intake now writes one mail item per validated message under existing external id
  semantics.
- Ignored messages can be reviewed by a future Inbox without becoming leads or score jobs.
- Leadable/review messages link mail items to classification, lead, contact, and later draft state
  where available.
- `GET /api/client/inbox/messages` returns a safe summary-only list read model with bounded
  sanitized `subjectPreview` and `snippetPreview`; legacy `subject` and `snippet` values remain
  `null` in v1.
- `GET /api/client/inbox/messages/:mailItemId` is the dedicated detail context that may return the
  selected mail body and email addresses.
- Inbox draft edit and Gmail export request/cancel wrappers are available through
  `/api/client/inbox/messages/:mailItemId/*` and reuse existing draft/export rules.

Full inbound mail body is permitted only in `client_mail_items` and the dedicated Inbox detail DTO.
023AH list previews are approved only for the dedicated Client Inbox list route. Full body and
preview values remain forbidden in activity logs, background job payloads, public intake responses,
admin generic queues, Google Sheets, raw metadata, prompt/output logs, and provider payloads.

023AF adds no live UI, client role/RBAC, AI rewrite, direct send, provider call, Gmail backend call,
Resend behavior, Google Sheets change, Caddy/systemd/env change, or deployment behavior.

## 023AG Clean Gmail Pilot Admin Inbox Lab State

023AG adds an internal founder/admin runtime harness for validating clean Gmail pilot data before
the final client Inbox UI is built:

- `/app/client-inbox-lab` lives inside the existing protected admin app.
- The page is labelled `Internal validation only · Not final client UI`.
- It consumes only the existing 023AF Client Inbox list/detail/draft/edit/export wrapper routes.
- It supports list `tab`, `sort`, and `limit` controls for clean pilot validation.
- It makes the v1 list disclosure boundary explicit: `subject` and `snippet` remain `null` in list
  DTOs while `subjectPreview` and `snippetPreview` expose bounded sanitized list-only previews.
- It uses the approved detail route to validate selected-message `bodyText`, `fromEmail`, and
  `toEmail` presence.
- It computes data-completeness gaps before final UI work; list preview gaps disappear when the
  preview fields are present, while sender/company display, attachments, and thread context remain
  tracked.
- It smoke-tests Inbox draft edit and Gmail export request/cancel wrappers without direct provider
  calls.

023AG does not change `ClientInboxPreviewPage`, import client design tokens, create
`app.syrantis.fr`, add client RBAC, add backend routes, alter intake/worker/provider behavior,
create migrations, touch Google Sheets behavior, or change Caddy/systemd/env/deployment state.

## 023AH Client Inbox Safe Preview Policy State

023AH unlocks the future live Inbox left-list preview target without returning full list subject or
body fields:

- Shared Client Inbox list items include `subjectPreview` and `snippetPreview`.
- `subjectPreview` is derived from `client_mail_items.subject`, whitespace-collapsed, redacted, and
  capped at 140 characters.
- `snippetPreview` prefers a safe stored snippet and otherwise derives a bounded body preview,
  whitespace-collapsed, redacted, capped at 220 characters, and not equal to the full body.
- The list route still returns `subject:null` and `snippet:null` for v1 compatibility.
- The detail route remains the only response context that may return selected full `subject`,
  `bodyText`, `fromEmail`, and `toEmail`.
- Previews are forbidden in public intake responses, activity logs, background jobs, Google Sheets,
  admin generic queues, provider payloads, prompt/output logs, and raw metadata.

023AH adds no migration, backend route, intake behavior change, worker behavior change, provider
call, Gmail/App Script/googleapis behavior, Resend behavior, Google Sheets behavior,
Caddy/env/systemd change, final client UI, `app.syrantis.fr`, client RBAC, AI rewrite, direct send,
or Scout behavior.

## 023AI-A Client Inbox Shared Components Preview State

023AI is one issue split across two PRs:

- PR A extracts shared client Inbox components and refactors `/app/client-inbox-preview`.
- PR B adds the live `/app/client/inbox` route, API adapter, and live API integration.

023AI-A adds `apps/web/src/features/client-inbox/` as the client Inbox UI feature boundary. The
feature contains UI ViewModel types, mock preview data, formatters, reusable layout/list/detail/
analysis/contact/rules/draft/export components, badges, and empty/loading/error states.

The preview remains the 023AE design harness and keeps using isolated client design tokens. It is
not mounted in the admin shell and does not depend on admin navigation. The Admin Client Inbox Lab
remains a separate runtime validation surface and is not reused by the client UI components.

Shared list components render only `subjectPreview` and `snippetPreview` style copy and do not
receive full body or email fields. The selected detail component may render full body and email
fields because it represents detail context. Components consume UI ViewModels only; the future PR B
adapter is responsible for converting live API DTOs into those ViewModels.

023AI-A adds no backend route, service, repository, migration, provider behavior, Google Sheets,
Resend, OpenRouter, Caddy/env/systemd/deployment change, `app.syrantis.fr` foundation, client RBAC,
live API adapter, live route, AI rewrite, direct send, or Gmail clone behavior.

## 023AI-B Client Inbox Live Route State

023AI-B adds `/app/client/inbox` as the live internal client Inbox route inside the current web
app. The route is protected by the existing session route but is not mounted inside the admin shell,
so it does not render admin navigation. It is not `app.syrantis.fr` and does not introduce client
RBAC or a domain split.

The live route reuses the shared 023AI-A client Inbox components and maps 023AF/023AH API DTOs into
UI ViewModels through `apps/web/src/features/client-inbox/` adapter and mapper code. The preview
route remains a mock design harness, and the Admin Client Inbox Lab remains a separate founder/admin
validation surface.

Live behavior is limited to existing backend routes:

- `GET /api/client/inbox/messages?tab=all&limit=20&sort=newest` and the same route with the minimal
  supported tabs for list refresh.
- `GET /api/client/inbox/messages/:mailItemId` for selected-message detail.
- `PATCH /api/client/inbox/messages/:mailItemId/draft` for draft edits when allowed.
- `POST /api/client/inbox/messages/:mailItemId/gmail-export-request` after explicit confirmation.
- `POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel` when cancellation is allowed.

The list UI renders only `subjectPreview` and `snippetPreview` copy. Full `subject`, `bodyText`,
`fromEmail`, and `toEmail` are rendered only in selected detail context. Draft bodies are edited
only in React state and are not stored in browser storage. Gmail export request text makes Gmail the
manual final-send surface; there is still no direct send, reply, forward, archive, delete, spam, AI
rewrite, provider SDK, or raw JSON/debug panel.

023AI-B adds no backend/API source change, migration, provider/OpenRouter/GmailApp/googleapis/Resend
behavior, Google Sheets behavior, Caddy/env/systemd change, deployment behavior, `app.syrantis.fr`,
client RBAC/domain split, dashboard/config UI, Scout behavior, or operational deploy mechanism.

## 023AK Client User Provisioning v0 State

023AK replaces manual DB promotion for basic test clients with a bounded admin/founder-only
provisioning path:

- `GET /api/admin/client-users` lists safe client user DTOs for the trusted session workspace.
- `POST /api/admin/client-users` creates only `role = client`, `status = active` users.
- The route rejects client-supplied workspace/tenant identity and role fields.
- Temporary passwords are generated server-side, hashed through the existing auth password helper,
  and returned only once in the create response.
- `/app/client-users` provides the admin UI and one-time temporary password display.
- `app.syrantis.fr/login` uses client-facing wording: `Syrantis`, `Espace client`, and
  `Se connecter`.

023AK adds no public signup, self-registration, invite email, password reset, full User Manager,
role management UI, workspace switcher, full Config, full Dashboard, Integration Pilot Environment,
direct send, AI rewrite, Gmail OAuth, Apps Script change, provider/OpenRouter/Resend/Google Sheets
behavior, worker behavior, Caddy/env/systemd change, deployment behavior, or production mutation.

## 023AJ Client App Foundation + Access Boundary State

023AJ adds the first client app foundation without turning the internal admin app into the final
client product:

- `role = client` is supported by the existing auth/session flow.
- The database and shared/web auth contracts already allowed `client`; no migration was required.
- `/inbox` renders the live Client Inbox in a separate `ClientShell`.
- `/dashboard` and `/config` render safe placeholders only.
- `/app/client/inbox` remains the internal validation live route.
- `/app/client-inbox-preview` remains the mock-only design harness.
- Client shell navigation is limited to Dashboard, Inbox, and Config.

The approved client-safe API boundary is narrow. `client`, `admin`, and `founder` may access only
the Client Inbox list/detail/draft edit/Gmail export request/cancel routes under
`/api/client/inbox/messages`. All remain tenant-scoped through `tenantGuard`, and `workspaceId`
still comes only from trusted session context. Client-provided workspace or tenant identity in
query strings, headers, or bodies is rejected.

Client users remain blocked from admin/founder validation surfaces such as `/api/admin/*`, ops,
workspace API key management, Google Sheets setup/test, workspace context admin routes, Mail Queue,
Draft Queue, Response Policy admin APIs, and other arbitrary admin-only routes.

`app.syrantis.fr` is the intended client domain. Operator DNS is already created as `app` CNAME to
`admin.syrantis.fr`, with both names resolving to `178.105.0.89`. Before the operator applies the
023AJ Caddy runbook, production `https://app.syrantis.fr/` and `https://app.syrantis.fr/inbox`
fail with a TLS internal error because Caddy lacks an `app.syrantis.fr` site block/certificate.

023AJ does not add full Config, full Dashboard, full user management UI, Integration Pilot
Environment, direct send, backend Gmail OAuth, Apps Script changes, provider/OpenRouter behavior,
Resend behavior, Google Sheets behavior, worker behavior, Scout behavior, production Caddy edits,
production env edits, deployment, or an operational deploy mechanism.
