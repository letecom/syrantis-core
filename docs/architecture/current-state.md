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
- `GET /api/client/inbox/messages` returns a safe summary-only list read model with subject and
  snippet values omitted in v1.
- `GET /api/client/inbox/messages/:mailItemId` is the dedicated detail context that may return the
  selected mail body and email addresses.
- Inbox draft edit and Gmail export request/cancel wrappers are available through
  `/api/client/inbox/messages/:mailItemId/*` and reuse existing draft/export rules.

Full inbound mail body is permitted only in `client_mail_items` and the dedicated Inbox detail DTO.
It remains forbidden in activity logs, background job payloads, public intake responses, admin
queues, Google Sheets, raw metadata, prompts, provider payloads, and list DTOs.

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
  DTOs.
- It uses the approved detail route to validate selected-message `bodyText`, `fromEmail`, and
  `toEmail` presence.
- It computes data-completeness gaps before final UI work, including list preview policy,
  sender/company display, attachments, and thread context.
- It smoke-tests Inbox draft edit and Gmail export request/cancel wrappers without direct provider
  calls.

023AG does not change `ClientInboxPreviewPage`, import client design tokens, create
`app.syrantis.fr`, add client RBAC, add backend routes, alter intake/worker/provider behavior,
create migrations, touch Google Sheets behavior, or change Caddy/systemd/env/deployment state.
