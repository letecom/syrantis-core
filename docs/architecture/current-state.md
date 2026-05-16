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
