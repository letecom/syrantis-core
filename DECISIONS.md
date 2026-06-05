# Decisions

This file records durable decisions for Syrantis Core. New entries should be short, dated, and linked to the related issue when possible.

## 2026-04-30 - Issue 000 Scope

Decision: Issue 000 creates only Build OS and documentation foundations.

Allowed files are governance docs, specs, implementation reports, architecture notes, runbooks, and future-scope notes.

Forbidden in Issue 000:

- application scaffold
- React
- Hono
- Drizzle
- package manager initialization
- `package.json`
- `.env`
- Docker Compose full config
- business code

## 2026-04-30 - Server Separation

Decision: production runtime and agent development are separated.

- Production runtime: `/opt/syrantis/repos/syrantis-core`
- Agent and development workspaces: `/opt/syrantis/agent-workspaces`
- Codex workspace: `/opt/syrantis/agent-workspaces/codex/syrantis-core`

Agents do not work in the production runtime repo.

## 2026-04-30 - Production Env Location

Decision: production runtime env is stored outside the repo at `/opt/syrantis/env/core.prod.env`.

No `.env` file is created or committed.

## 2026-04-30 - 90-Day Wedge

Decision: the first commercial wedge is plumbers and heating contractors, focused on Lead Response and Devis Relance.

Anything outside that wedge goes to `docs/future/` unless explicitly approved by the Founder Governor.

## 2026-04-30 - Tenant Injection Rule

Decision: `workspaceId` is a server-trusted value only.

`workspaceId` must come from `tenantGuard`, a future approved machine-to-machine token, or a future approved internal job context.

`workspaceId` must never be accepted from:

- request body
- query params
- URL params
- headers
- client-side state

A client-provided `workspaceId` is rejected or ignored. Business code must not trust it even when it matches the current session.

## 2026-04-30 - Cross-Tenant Invisibility

Decision: resources outside the current workspace must behave as invisible.

For workspace-scoped business resources:

- list routes filter by `workspaceId`
- detail routes filter by `id` and `workspaceId`
- update routes filter by `id` and `workspaceId`
- cross-workspace access returns `404`, not `403`

This avoids revealing whether a resource exists in another workspace.

## 2026-04-30 - Repository Boundary

Decision: business repositories are framework-independent.

Repositories must not depend on Hono `Context`.

Routes extract `workspaceId` from the request context and pass it into services or repositories explicitly.

Services may orchestrate business behavior but must not infer tenant identity from client input.

## 2026-04-30 - API Wall for AI Agents

Decision: AI agents do not access the database directly.

Future agents must interact through approved Syrantis API endpoints or approved internal service interfaces with explicit scopes.

Agents can create tasks, drafts, recommendations, or approval requests only through authorized application paths.

Agents must not:

- receive raw production DB credentials
- run direct SQL against production
- bypass authorization
- send emails directly
- approve their own generated actions

External side effects are performed by Syrantis after approved workflow checks.

## 2026-04-30 - No Physical Delete by Default

Decision: business records are not physically deleted by default.

Physical deletion of business records requires a dedicated issue with explicit approval and must define:

- authorization
- audit logging
- rollback behavior
- retention impact
- GDPR or legal impact
- production validation

Normal user-facing removal should use status transitions such as `cancelled`, `archived`, or a future approved soft-delete field.

## 2026-04-30 - Business Query Rule

Decision: business queries use Drizzle query builder by default and must include tenant filtering when the table is workspace-scoped.

Raw SQL is forbidden in business routes, services, and repositories unless a scoped issue explicitly approves it and documents why Drizzle cannot express the operation safely.

Raw SQL may exist in schema, migrations, low-level DB health checks, or explicitly approved infrastructure code.

## 2026-04-30 - Job Queue Simplicity

Decision: future background jobs should prefer PostgreSQL before adding Redis, BullMQ, Kafka, or another external queue.

The default future direction is a PostgreSQL-backed queue using transactions and `SELECT ... FOR UPDATE SKIP LOCKED`.

External queue infrastructure requires a clear business or operational reason.

## 2026-04-30 - RLS Timing

Decision: Row Level Security is required as a future database-level safety layer, but it is not implemented before the first protected business route.

The sequence is:

1. application-level tenant guard
2. first protected vertical slice
3. PostgreSQL RLS foundation

RLS must be designed around a clear runtime pattern for setting the current workspace in database sessions or transactions.

## 2026-04-30 - Issue 008 Protected Task Slice

Decision: tasks are the first protected business resource and prove the application-level tenant boundary.

Task routes are mounted under `/api/tasks`, protected by `tenantGuard`, and backed by service/repository functions that receive `workspaceId` explicitly.

Task cancellation uses `PATCH status = cancelled`. No physical task deletion, approvals workflow, activity logging, jobs, email sending, or UI behavior is approved in Issue 008.

## 2026-04-30 - Issue 009B Updated At Ownership

Decision: `updated_at` is maintained by PostgreSQL through the `syrantis_set_updated_at` trigger, not by application repositories.

Repositories should not manually patch `updated_at` unless a future issue explicitly documents an exception.

## 2026-05-11 - Lead Score Pushback Is a Separate Job

Decision: Google Sheets pushback for successful lead scoring runs as a separate
`pushback_lead_score` background job.

The `score_lead` worker commits the `lead_scores` row first, then best-effort enqueues pushback
with an IDs-only payload. Pushback enqueue or Google Sheets failure must not fail the scoring job.

The first version is append-only to `Score_Log`; it uses activity-log-based idempotence and accepts
the known duplicate-row race if Sheet append succeeds but the succeeded activity log write fails.

## 2026-05-12 - Company Context Profile Shape

Decision: 023P stores one active company context profile per workspace in
`workspace_context_profiles`.

The first version updates the row in-place and intentionally does not implement versioning,
inactive profile history, CMS behavior, RAG, embeddings, document upload, crawler, Gmail OAuth, or
provider-backed enrichment.

Future scoring and draft generation may consume this profile only through a separately approved
issue that defines the read path, prompt safety, audit behavior, and regression coverage.

## 2026-05-13 - Gmail Draft Export Requires Explicit Request

Decision: Apps Script Gmail draft export is inert by default and requires a per-draft
admin/founder request before the API-key pending endpoint can lease a draft.

The request gate is stored in `drafts.metadata_json.gmailExport`; no migration or new table is
introduced for 023U. Pending exports must require a non-expired, non-cancelled request and must
preserve request audit fields when writing leases.

This gate does not approve backend Gmail OAuth, Gmail send, approval creation, `email_sends`
creation, provider calls, worker changes, or Apps Script changes.

## 2026-05-16 - 023AE Client App and Inbox Domain Split

Decision: the future client product app is separate from the founder/admin validation surfaces.

- `admin.syrantis.fr` is for founder/operator/admin/debug/ops/workspaces/users/integrations/logs.
- `app.syrantis.fr` starts with Dashboard, Inbox, and Config.
- Inbox is the primary client surface and must not become a CRM clone, Gmail clone, chatbot, or ops
  panel.
- The live Inbox requires a dedicated Client Inbox Domain before full client-visible mail bodies or
  draft/export mutations are implemented.

Admin queues and debug read models must not be reused directly as the live client Inbox contract.

## 2026-05-18 - 023AF Dedicated Client Inbox Domain

Decision: the live Client Inbox backend has a dedicated `client_mail_items` domain table and
`/api/client/inbox` read/action routes instead of reusing founder/admin validation queues.

Full inbound mail body, body-derived snippets, and email addresses are allowed only in
`client_mail_items` and the dedicated Inbox detail DTO. They remain forbidden in public intake
responses, list DTOs, activity log metadata, background job payloads, admin queues, Google Sheets,
prompts, provider payloads, and raw metadata.

Inbox draft edit and Gmail export request/cancel actions resolve through the workspace-scoped mail
item relation and reuse existing draft/export rules. This does not approve live UI, AI rewrite,
direct send, backend Gmail OAuth, provider calls, Resend changes, Google Sheets changes, deployment,
or client RBAC.

## 2026-05-22 - 023AN Response Profiles Use a Table

Decision: client response profiles are stored in `workspace_response_profiles`, not as JSON inside
`workspace_context_profiles.context_json`.

The table gives future Draft Generation v2 a clean tenant-scoped lookup path, ordered active list,
database-enforced one-active-default constraint, row-level RLS/FORCE RLS coverage, and reviewable
runtime grants. Profile deactivation is soft through `is_active=false`; no hard delete behavior or
DELETE grant is approved.

023AN only approves the data model, client-safe API, and `/config` UI. It does not approve prompt
selection, provider calls, worker changes, Inbox profile display, direct send, Gmail/App Script,
Google Sheets, Resend, Caddy/env/systemd changes, or deployment.

## 2026-05-20 - 023AJ Client Role Boundary

Decision: the `client` role is allowed only through explicitly approved client-safe surfaces.

For 023AJ, that means the live Client Inbox APIs under `/api/client/inbox/messages` and the client
shell routes `/inbox`, `/dashboard`, and `/config`. Other `/api/client/*` validation routes remain
admin/founder-only until a later issue reviews and approves each one for client access.

Client users must not see the admin shell. `app.syrantis.fr` is the client-facing domain foundation,
while `admin.syrantis.fr` remains the founder/operator/admin validation and ops surface. Full
Dashboard, full Config, user management, Integration Pilot Environment, direct send, backend Gmail
OAuth, and Apps Script changes remain out of scope.

## 2026-05-20 - 023AK Client User Provisioning Boundary

Decision: basic client users may be provisioned only by authenticated admin/founder sessions in v0.

The provisioning route derives `workspaceId` from the trusted session context, rejects
client-supplied workspace/tenant identity and role fields, and always creates `role = client`,
`status = active` users. Temporary passwords are generated server-side, hashed through the existing
auth helper, and shown once in the create response.

This does not approve public signup, self-registration, invite email, password reset, full User
Manager, role management, workspace switching, full Config, Integration Pilot Environment, direct
send, Gmail OAuth, Apps Script changes, or provider behavior changes.

## 2026-05-22 - 023AL Live Client Inbox Uses ClientShell Chrome Only

Decision: the live client Inbox must be embedded inside `ClientShell` and must not render the
preview/internal Inbox sidebar, brand, account picker, workspace shell card, user shell card, or
AdminShell.

`/app/client-inbox-preview` remains the mock design harness and may keep its full visual shell.
Shared Inbox components should separate preview framing from live work-area content so live data
hooks and mutations are not duplicated and mock data does not leak into the live route.

This does not approve backend/API changes, migrations, auth changes, full Config, personas,
response profiles, services/offers config, Draft Generation v2, direct send, provider behavior,
deployment, env, Caddy, systemd, or Google Sheets changes.

## 2026-05-22 - 023AM Client Config Uses Dedicated Client-Safe Route

Decision: the live client Config surface may edit response behavior only through
`GET/PUT /api/client/config/response-policy`.

The route is separate from the existing admin/founder Response Policy surface at
`GET/PUT /api/client/response-policy` and `/app/response-policy`. It exposes a strict client-safe DTO
whitelist, maps client-facing field names onto the existing stored response policy, and never
accepts workspace or tenant identity from the client. `client`, `admin`, and `founder` may use the
dedicated client config route; `operator` remains blocked.

The client DTO must not expose workspace identifiers, raw JSON, activity metadata, prompts, outputs,
provider identifiers, API keys, tokens, secrets, logs, debug fields, or admin-only response policy
fields. The saved fields may feed future Draft Generation v2, but 023AM does not change generation
behavior.

This does not approve personas/response profiles, services/offers packs, Draft Generation v2,
prompt previews, provider calls, worker jobs, Gmail/App Script, Google Sheets, Resend, direct send,
public signup, migrations, deployment, env, Caddy, or systemd changes.

## 2026-05-19 - 023AH Client Inbox List Previews Are Route-Scoped

Decision: bounded `subjectPreview` and `snippetPreview` values are approved only on the dedicated
Client Inbox list route, `GET /api/client/inbox/messages`.

The list route keeps legacy `subject:null` and `snippet:null`. Full inbound body and email address
fields remain detail-only. Preview generation must trim, collapse whitespace, redact internal or
secret-like material, cap subjects at 140 characters, cap snippets at 220 characters, and avoid
returning the full body when deriving from `body_text`.

Preview values remain forbidden in public intake responses, activity log metadata, background job
payloads, Google Sheets pushback, admin generic queues, provider payloads, prompt/output logs, and
raw metadata. This does not approve final client UI, client RBAC, provider calls, Gmail OAuth,
Resend changes, Google Sheets behavior changes, direct send, AI rewrite, deployment, env, Caddy, or
systemd changes.

## 2026-05-19 - 023AI Client Inbox UI Uses ViewModels

Decision: the final client Inbox UI must be shared between the mock preview harness and the future
live route through feature components that consume UI ViewModels, not backend DTOs.

`/app/client-inbox-preview` remains the design harness. The Admin Client Inbox Lab remains a
separate admin validation surface and must not be reused as the client UI. PR A extracts shared
components only; PR B adds `/app/client/inbox` as an internal live route with an adapter from Client
Inbox API DTOs into UI ViewModels.

List UI ViewModels may contain bounded `subjectPreview` and `snippetPreview` copy but must not
contain or render body text, sender email, recipient email, raw payloads, workspace identifiers, or
provider identifiers. Detail UI ViewModels may render body and email fields in selected-message
context.

This approves only the internal `/app/client/inbox` route in the current web app. It does not
approve client RBAC, `app.syrantis.fr` foundation, backend route, migration, provider behavior,
direct send, deployment, env, Caddy, systemd, or Google Sheets change.
