# Syrantis Core

Syrantis Core is a backend-first B2B AI orchestration and controlled execution layer.

It is not a CRM.

It is not a chatbot.

It is not an uncontrolled agent system.

It is a controlled action layer above CRMs, forms, sheets, and business tools. The client CRM remains the commercial source of truth. Syrantis handles intake, canonical lead context, AI scoring, AI draft generation, AI audit read model, approval readiness, human approval, send readiness, request-send, optional cancel-send while pending, worker execution, send status, send attempts, delivery proof, DB proof, Google Sheets push-back, and push-back diagnostics.

```txt
Client CRM / form / sheet
        ↓
Syrantis public/internal intake
        ↓
Canonical lead context
        ↓
AI scoring
        ↓
AI draft generation
        ↓
AI audit read model
        ↓
Approval readiness
        ↓
Human approval
        ↓
Send readiness
        ↓
request-send
        ↓
optional cancel-send while pending
        ↓
Worker execution
        ↓
send-status / send-attempts
        ↓
Resend webhook delivery proof when real provider is enabled
        ↓
Google Sheets push-back MVP + diagnostics
        ↓
022E Manual Pushback Replay
        ↓
Future CRM connector hardening / additional targets
```

## Product Positioning

Syrantis is the controlled action layer for small and mid-sized businesses.

Primary wedge:

- TPE / PME
- artisans / services locaux
- plomberie / chauffage / services B2B locaux
- lead response + quote follow-up

The first sellable loop is:

```txt
lead received
  → normalized
  → scored
  → AI draft
  → AI audit
  → approval readiness
  → approval
  → send readiness
  → request-send
  → optional cancel-send while pending
  → worker execution
  → send status / send attempts / delivery proof
  → Google Sheets push-back MVP + diagnostics
```

No CRM clone.

No chatbot.

No uncontrolled agent.

## Current State

Production server:

```txt
ubuntu-8gb-fsn1-1
```

Runtime separation:

```txt
syrantis-ai = agent / Codex workspace
syrantis    = production runtime
```

Paths:

```txt
/opt/syrantis/agent-workspaces/codex/syrantis-core
/opt/syrantis/repos/syrantis-core
/opt/syrantis/env/core.prod.env
```

Rules:

- agents work only in `/opt/syrantis/agent-workspaces`
- production runs only from `/opt/syrantis/repos`
- secrets stay only in `/opt/syrantis/env/core.prod.env`
- agents never deploy
- agents never merge
- agents never edit prod env

Current backend baseline through 022D:

- production default `SEND_EMAIL_PROVIDER=internal`
- Resend provider exists only behind explicit env config
- Resend webhook foundation exists at `POST /api/webhooks/resend`
- current AI model `mistralai/mistral-small-2603`
- API tests: 27 files, 432 tests
- DB verify tests: 46 tests
- `verify-schema`: 33 invariants
- migration files: 19 SQL files / 19 journal entries
- `verify-migration-files` passes with `drift=0`
- current `verify-schema` expected result: `checked=33 passed=33 failed=0`
- 022B Google Sheets sandbox verifier exists
- 022C Google Sheets push-back MVP exists
- 022D Google Sheets push-back diagnostics exist through compact `activity_logs`
- API import safety passes
- hostile env test suite passes
- full test suite passes
- Production validation confirmed:
  - `api.syrantis.fr` reverse proxy through Caddy works
  - Resend webhook configured at `https://api.syrantis.fr/api/webhooks/resend`
  - `RESEND_WEBHOOK_SECRET` configured
  - `SEND_EMAIL_PROVIDER=resend` used for real provider validation
  - Google Sheets service-account verification succeeded
  - Google Sheets push-back to `Pushback_Log!A:Q` succeeded after delivery proof
  - Full test loop produced a row in the Sheet

Implemented state now includes migration integrity, schema drift guard, RLS catalog verification, test environment isolation, send-attempt history, send proof hardening, Resend webhook foundation, terminal delivery immutability, Google Sheets push-back, and safe push-back diagnostics.

Next planned issue: 022E Manual Pushback Replay.

Targeted API read-model tests after shared contract edits should run after:

```bash
pnpm --filter @syrantis/shared build
```

## Stack

```txt
Runtime/API          Hono + TypeScript
Database             PostgreSQL
ORM                  Drizzle
Validation           Zod
Package manager      pnpm
Tests                Vitest
Architecture         API-first, backend-first
Auth                 opaque session cookie + public Bearer API keys
Tenant model         tenantGuard + RLS + FORCE RLS
Transactions         withWorkspaceDb
Public key lookup    withApiKeyLookupDb
Webhook lookup       withProviderMessageLookupDb
Audit                activity_logs
Async                background_jobs
Worker               worker CLI, retry/backoff/dead-letter
AI Provider          OpenRouter through hardened provider boundary
Email Provider       internal default; Resend behind explicit config
Webhook              optional Resend webhook behind RESEND_WEBHOOK_SECRET
Validation tooling   verify-migration-files + verify-schema catalog proof
```

## Security Model

Syrantis uses defense in depth.

- cookie auth for internal API
- Bearer API key auth for public intake
- tenantGuard for session routes
- withWorkspaceDb for workspace-scoped mutations and reads
- withApiKeyLookupDb for public API key lookup
- withProviderMessageLookupDb for Resend webhook provider message lookup
- PostgreSQL RLS + FORCE on tenant tables
- runtime DB role `syrantis_app` without superuser or bypassrls
- worker role `syrantis_worker` with deliberately limited BYPASSRLS scope for `background_jobs`
- migration DB role `syrantis`
- verify-schema proves real catalog objects, not just journal state

Runtime role:

```txt
syrantis_app
  rolsuper     false
  rolbypassrls false
```

Worker role:

```txt
syrantis_worker
  login        true
  rolbypassrls true by current design
  rolsuper     false
```

Worker direct grants are limited to:

- `background_jobs` SELECT
- `background_jobs` UPDATE

Worker direct grants are forbidden for:

- `email_sends`
- `ai_runs`
- `lead_scores`
- `activity_logs`
- `users`

Worker preflight:

```bash
pnpm --filter @syrantis/api worker:check
```

Migration role:

```txt
syrantis
  used by MIGRATION_DATABASE_URL
```

Public API key model:

- plaintext shown once
- SHA-256 stored
- key prefix + last4 stored
- revocation supported
- last_used_at tracked

## Guardrails

Hard rules:

- workspaceId never comes from the client
- webhook never accepts workspaceId from body, query, or headers
- cross-workspace access returns 404
- provider_message_id never appears in public read models or responses
- no raw webhook payload storage
- no raw provider payloads in read models, logs, or activity metadata
- no PII in read models
- no prompt/output/payload/cost/token fields in public read models
- no provider external calls from webhook route
- no provider external calls from regular routes
- worker execution is idempotent
- business routes never hard-delete by default
- activity logs are transactional and compact
- updated_at is database-owned
- secrets are never committed
- agents never touch production secrets
- agents never work in runtime repo
- agents never deploy
- future jobs use PostgreSQL SKIP LOCKED before Redis/Kafka
- no prompt client input
- no raw prompt/output in activity_logs
- no AI mutation of source leads
- `send_email` worker reads and writes `email_sends` by `id` + `workspaceId`
- internal email provider is the safe default
- migration journal is not sufficient proof
- verify-schema must verify real catalog objects
- all migration-heavy issues require production verify-schema after migrate
- targeted API tests after shared contract edits should build `@syrantis/shared` first
- send retries must not mutate terminal `email_sends` rows
- retry creates new `email_sends` rows
- same `background_jobs` row is reused for send retries
- scheduled retry jobs must remain cancellable before execution

Forbidden by default:

- business `.delete()`
- raw SQL outside allowed worker claim / DB helpers
- workspaceId body/query injection
- public route under tenantGuard
- webhook route under tenantGuard
- secret-like payloads in metadata
- API keys or hashes in DTOs
- provider call from route
- prompt/output/payload/cost/token fields in public read models
- Resend before approval/send outbox
- AI output applied directly to source lead

## Completed Capabilities

### Auth and Tenant

- 006 Auth/session
- 007 Tenant guard
- 009A Workspace transaction helper
- 014C0 Runtime DB role separation
- 014C RLS activation
- 021N RLS Catalog Verification

Implemented:

- `/auth/login`
- `/auth/logout`
- `/auth/me`
- `/auth/session-check`
- opaque session cookie
- workspace-scoped request context

### Business Core

- 008 Tasks
- 010 Activity logs
- 011 Approvals
- 012 Organizations and Contacts
- 012B Hide archived organizations
- 013 Leads
- 017A Drafts Foundation
- 017B Draft Approval Handoff
- 018A Email Sends Foundation
- 020C AI Scoring Read Model
- 021A AI Draft Generation Foundation
- 021B Draft AI Audit Read Model
- 021C Draft Approval Readiness / Request-Approval Hardening
- 021D Draft Send Readiness / Request-Send Hardening
- 021F Draft Send Status Read Model
- 021G Draft Send Cancellation
- 021J Send Proof Hardening
- 021L Send Attempt History Read Model

Implemented routes:

- `/api/tasks`
- `/api/activity-logs`
- `/api/approvals`
- `/api/organizations`
- `/api/contacts`
- `/api/leads`
- `/api/leads/:id/score`
- `/api/leads/:id/scores`
- `/api/leads/:id/generate-draft`
- `/api/drafts`
- `/api/drafts/:id/ai-audit`
- `/api/drafts/:id/approval-readiness`
- `/api/drafts/:id/request-approval`
- `/api/drafts/:id/send-readiness`
- `/api/drafts/:id/request-send`
- `/api/drafts/:id/send-status`
- `/api/drafts/:id/send-attempts`
- `/api/drafts/:id/cancel-send`
- `/api/email-sends`
- `/api/email-sends/:id`
- `/api/integrations`
- `/api/workspace-api-keys`
- `/api/public/leads`
- `/api/webhooks/resend`

### Draft Send Status Behavior

`GET /api/drafts/:id/send-status` returns latest safe `email_sends` proof for a draft.

Safe `latestSend` fields:

- `status`
- `requestedAt`
- `updatedAt`
- `sentAt`
- `failedAt`
- `errorCode`
- `deliveryStatus`
- `deliveredAt`
- `bouncedAt`
- `complainedAt`
- `deliveryErrorCode`

The response excludes:

- provider
- provider_message_id
- recipient fields
- subject/body
- raw provider payload/errors
- `metadata_json` / `payload_json`
- AI internals

Behavior:

- read-only
- no activity logs, jobs, or mutations
- returns the newest retry row
- exposes delivery proof only through safe compact fields

### Draft Send Attempts Behavior

`GET /api/drafts/:id/send-attempts` returns chronological safe attempt history.

Fields:

- `attemptNumber`
- `status`
- `createdAt`
- `updatedAt`
- `sentAt`
- `failedAt`
- `errorCode`
- `deliveryStatus`
- `deliveredAt`
- `bouncedAt`
- `complainedAt`
- `deliveryErrorCode`

Pagination:

- `page` default 1
- `pageSize` default 20, max 50
- `attemptNumber` stable across pages

Security:

- no provider ids
- no provider name
- no recipients
- no subject/body
- no raw payload/errors
- no workspaceId

### Draft Send Cancellation Behavior

`POST /api/drafts/:id/cancel-send` cancels only the latest pending `email_sends` when the linked `send_email` job is pending.

Behavior:

- updates `email_sends.status` and `background_jobs.status` to `cancelled` in one transaction
- creates one compact `email_send.cancelled` activity log on first cancellation only
- already-cancelled returns idempotent 200 with no duplicate log
- queued, sent, failed, and no-send states are blocked safely

### Resend Webhook Behavior

`POST /api/webhooks/resend` is a provider-facing route.

Configuration:

- optional route path for real provider delivery proof
- requires `RESEND_WEBHOOK_SECRET`
- returns `WEBHOOK_NOT_CONFIGURED` when `RESEND_WEBHOOK_SECRET` is missing
- uses Svix-compatible signature verification before trusting or parsing payload content
- verifies the raw body before payload trust

Security and tenancy:

- no tenantGuard because provider ingress has no session workspace context
- rejects client-supplied workspaceId from body, query, or headers
- provider message lookup runs through `withProviderMessageLookupDb(providerMessageId)`
- lookup uses dedicated RLS policy with `current_setting('app.current_provider_message_id')`
- workspace mutation runs through `withWorkspaceDb(workspaceId)`
- unmatched provider_message_id returns safe 200 unmatched
- provider_message_id is not exposed in public read models or responses

Events:

- accepts `email.delivered`, `email.bounced`, `email.complained`
- ignores `email.sent`, `email.delivery_delayed`, `email.opened`, `email.clicked`, and unknown event types with safe 200 ignored behavior
- duplicate already-applied events return unchanged
- writes compact `email_send.delivery_updated` activity logs only when delivery state changes

The webhook never:

- stores raw payloads
- logs signatures
- logs or exposes recipients, subject/body, provider raw errors, signature values, or AI internals
- calls the provider HTTP API

### Google Sheets Push-back Behavior

Google Sheets push-back is a first concrete external push-back MVP.

It is NOT:

- generic CRM adapter
- Dolibarr connector
- OAuth Google onboarding
- UI onboarding
- outbox/retry framework
- two-way sync
- provider webhook event store

It uses:

- `GOOGLE_SHEETS_PUSH_ENABLED`
- `GOOGLE_SHEETS_CREDENTIALS_JSON`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_RANGE` for verification lane
- `GOOGLE_SHEETS_VERIFICATION_RANGE` if documented
- `GOOGLE_SHEETS_PUSHBACK_RANGE` for push-back lane

Current production ranges:

- `Verification!A:E`
- `Pushback_Log!A:Q`

Columns for `Pushback_Log`:

1. `event_type`
2. `occurred_at`
3. `syrantis_lead_id`
4. `syrantis_draft_id`
5. `syrantis_email_send_id`
6. `lead_label`
7. `contact_email`
8. `send_status`
9. `delivery_status`
10. `requested_at`
11. `sent_at`
12. `delivered_at`
13. `bounced_at`
14. `complained_at`
15. `delivery_error_code`
16. `safe_summary`
17. `synced_at`

Behavior:

- Push-back is triggered after Resend webhook delivery state changes.
- Accepted delivery events remain `email.delivered`, `email.bounced`, `email.complained`.
- Push-back is non-blocking.
- Push-back failure must not fail the webhook response.
- Payload is explicit-whitelist, 17 columns.
- No `provider_message_id` in push-back payload.
- No raw webhook payload.
- No raw provider payload.
- No email body.
- No `htmlBody`/`textBody`.
- No secret or credential value.
- No `workspaceId` written to the Sheet.
- Current implementation depends on delivery proof mutation, not on `email.sent` alone.

### Integration Foundation

- 015 External Integration Foundation
- 016A Workspace API Keys
- 016B Public Lead Intake

Integration tables:

- external_connections
- external_object_mappings
- integration_events

Public intake:

```txt
POST /api/public/leads
Authorization: Bearer syr_live_...
Idempotency-Key: optional
```

Behavior:

- resolves workspace from API key
- creates lead
- optionally creates organization/contact
- optionally creates external mapping
- writes integration_event `public_lead.received`
- writes activity logs `lead.created` and `public_lead.received`
- updates workspace_api_keys.last_used_at
- rejects revoked keys
- rejects secret-like metadata

### Async / Worker

- 019A Background Jobs Outbox Foundation
- 019B Worker Execution Foundation
- 019C Worker Ops Hardening
- 021E Worker Send Execution Hardening
- 021H Worker Retry / Backoff / Dead Letter
- 021M Test Environment Isolation

Worker commands:

```bash
pnpm --filter @syrantis/api worker:check
pnpm --filter @syrantis/api worker:jobs -- --status pending --limit 20
pnpm --filter @syrantis/api worker:repair-stale
pnpm --filter @syrantis/api worker:once
pnpm --filter @syrantis/api worker:run
```

Current `send_email` worker behavior:

- processes `background_jobs.send_email`
- claims only pending `send_email` jobs where `scheduled_at` is null or `scheduled_at <= now()`
- future scheduled `send_email` jobs are ignored
- executes provider path only when `email_sends.status = pending`
- `queued`, `sent`, `failed`, and `cancelled` are idempotent no-op states
- internal provider moves `pending` to `queued` and completes the job
- internal provider does not send real email
- internal provider creates no retry row
- retryable provider failures schedule retry with backoff
- current `email_sends` row moves to `failed` before retry
- retry creates a new `email_sends.pending` row
- the same `background_jobs` row is reused and rescheduled with `payload_json.emailSendId` updated to the retry send
- no intermediate activity log spam during retry scheduling
- retryable failure at max attempts dead-letters
- permanent provider failure fails without retry
- cancel-send works for pending scheduled retry attempts
- cancelled scheduled retry jobs are not claimed
- Resend path exists only with explicit `SEND_EMAIL_PROVIDER=resend`

### AI

- 020A AI Scoring Sandbox
- 020A-FIX AI scoring schema/token budget fix
- 020B AI Provider Hardening
- 020B-FIX prompt/schema/token budget validation
- 020C AI Scoring Read Model
- 021A AI Draft Generation Foundation
- 021B Draft AI Audit Read Model

Current AI model:

```txt
mistralai/mistral-small-2603
```

Current AI guarantees:

- OpenRouter only through provider boundary
- no OpenRouter call from HTTP route
- no prompt supplied by client
- redacted prompt only
- no prompt/output in activity_logs
- no mutation of `leads`
- result stored in `lead_scores`
- provider audit stored in `ai_runs`
- draft generation creates `drafts.status = draft`
- AI audit route is read-only and safe
- manual drafts return null audit
- no `email_sends` or `send_email` job from AI draft generation
- cost tracked in `cost_estimate_micro_usd`

### Migration / Schema Guards

- 021I Migration Schema Drift Guard
- 021K Migration Journal Integrity Guard
- 021N RLS Catalog Verification
- 021O Resend Webhook Foundation
- 021P Terminal Delivery Immutability Guard
- 022B Google Sheets Sandbox Verification
- 022C Google Sheets Push-back MVP

Implemented validation:

- `verify-migration-files` validates SQL files and journal entries
- `verify-schema` validates live catalog invariants
- RLS enabled proof
- FORCE RLS proof
- expected policy-name proof
- Resend webhook delivery proof columns and constraints
- provider-message lookup policy proof
- terminal delivery immutability trigger proof

## Database Security Status

RLS enabled and forced on all 15 verified tenant tables:

- organizations
- contacts
- leads
- tasks
- approvals
- activity_logs
- external_connections
- external_object_mappings
- integration_events
- workspace_api_keys
- drafts
- email_sends
- background_jobs
- ai_runs
- lead_scores

RLS policy shape:

```sql
workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
```

Public API key lookup policy:

```sql
status = 'active'
AND key_hash = nullif(current_setting('app.current_api_key_hash', true), '')
```

Resend provider message lookup policy:

```sql
provider_message_id = nullif(current_setting('app.current_provider_message_id', true), '')
```

Status:

- direct runtime select without workspace context must return zero rows
- `lead_scores` and `ai_runs` are tenant-protected
- `syrantis_worker` has no direct grants to `ai_runs` or `lead_scores`
- verify-schema checks RLS enabled
- verify-schema checks FORCE RLS enabled
- verify-schema checks expected policy names
- 021N verified RLS catalog state in production with `checked=21`
- 021O extended verify-schema to 31 invariants
- 021P extended verify-schema to 33 invariants
- current expected result: `checked=33 passed=33 failed=0`

## Migration Integrity Status

Implemented:

- 021I schema drift guard
- 021K migration journal integrity guard
- 021N RLS catalog verification
- 021O webhook delivery proof catalog verification
- 021P terminal delivery immutability catalog verification

Current production state:

- 19 SQL migration files
- 19 journal entries
- `verify-migration-files` result: `drift=0`
- `verify-schema` result: `checked=33 passed=33 failed=0`
- migration `0017_resend_webhook_delivery_proof.sql` exists
- migration `0018_email_sends_terminal_delivery_immutability.sql` exists

Hard rules:

- migration journal is not sufficient proof
- verify-migration-files validates SQL files and journal entries
- verify-schema validates live catalog invariants
- all migration-heavy issues require production verify-schema after migrate

## Operational Lanes

Syrantis Core runs in several independent lanes.

### 1. Internal API Lane

```txt
browser/session
  ↓
tenantGuard
  ↓
withWorkspaceDb
  ↓
business table
  ↓
activity_logs
```

Used by:

- tasks
- approvals
- organizations
- contacts
- leads
- integrations
- workspace API keys
- drafts
- email sends

### 2. Public Intake Lane

```txt
external client
  ↓
Authorization: Bearer syr_live_...
  ↓
SHA-256 lookup under RLS public lookup policy
  ↓
workspaceId resolved
  ↓
withWorkspaceDb
  ↓
lead/contact/org/mapping/event/log
```

Used by:

- forms
- Make
- Zapier
- Google Sheets
- future CRM connectors

### 3. Draft / Approval Lane

```txt
lead
  ↓
draft
  ↓
GET /api/drafts/:id/ai-audit
  ↓
GET /api/drafts/:id/approval-readiness
  ↓
POST /api/drafts/:id/request-approval
  ↓
human decision
  ↓
approved / rejected
  ↓
activity_logs
```

### 4. Email Intent Lane

```txt
approved draft
  ↓
GET /api/drafts/:id/send-readiness
  ↓
POST /api/drafts/:id/request-send
  ↓
email_sends.pending
  ↓
background_jobs.send_email
  ↓
optional POST /api/drafts/:id/cancel-send while pending
```

Status:

- default provider is internal
- no real external email by default
- Resend provider exists behind explicit env config
- send worker is idempotent for non-pending `email_sends`
- scheduled retry attempts remain cancellable while pending

### 5. Async Worker Lane

```txt
background_jobs.pending
  ↓
claim with FOR UPDATE SKIP LOCKED
  ↓
ignore future scheduled_at send_email jobs
  ↓
running
  ↓
handler
  ↓
completed / failed / cancelled / rescheduled
  ↓
send-status / send-attempts
```

Worker ops are exposed through CLI, not HTTP.

Retry branch:

```txt
retryable provider failure
  ↓
current email_sends.failed
  ↓
new email_sends.pending retry row
  ↓
same background_jobs row rescheduled with scheduled_at
  ↓
worker retry after backoff
```

### 6. Resend Delivery Webhook Lane

```txt
Resend webhook
  ↓
Svix signature verification
  ↓
provider message lookup via current_setting('app.current_provider_message_id')
  ↓
resolve email_sends.workspace_id
  ↓
withWorkspaceDb(workspaceId)
  ↓
update delivery proof columns
  ↓
compact email_send.delivery_updated activity log
  ↓
send-status / send-attempts expose safe delivery proof
```

Status:

- optional
- requires `RESEND_WEBHOOK_SECRET`
- no tenantGuard
- no provider HTTP calls
- no raw payload storage

### 7. Google Sheets Push-back Lane

```txt
Resend webhook delivery proof
  ↓
email_sends delivery state update
  ↓
compact email_send.delivery_updated activity log
  ↓
pushDeliveryProofToGoogleSheets
  ↓
Google Sheets API append
  ↓
Pushback_Log row
```

Status:
- implemented in 022C
- production-validated
- no outbox yet
- no replay yet
- no diagnostics read model yet
- next issue should improve observability/diagnostics

### 8. AI Scoring Lane

```txt
lead
  ↓
POST /api/leads/:id/score
  ↓
background_jobs.score_lead
  ↓
worker
  ↓
redacted prompt
  ↓
OpenRouter
  ↓
ai_runs
  ↓
lead_scores
  ↓
activity_logs
```

Current model:

```txt
mistralai/mistral-small-2603
```

Status:

- OpenRouter provider hardened
- no mutation of `leads`
- no prompt/output in activity_logs
- cost tracking in `cost_estimate_micro_usd`

### 9. AI Draft Lane

```txt
lead
  ↓
POST /api/leads/:id/generate-draft
  ↓
background_jobs.generate_ai_draft
  ↓
worker
  ↓
redacted prompt
  ↓
OpenRouter
  ↓
ai_runs
  ↓
drafts.status = draft
```

Status:

- no email send or approval from AI draft generation
- no prompt/output in activity_logs
- manual drafts return null AI audit

### 10. Future CRM Connector Lane

```txt
delivery proof / task done / approval accepted
  ↓
integration_event outbound
  ↓
connector adapter
  ↓
CRM note/status update
```

Not implemented yet.

## Issue Timeline

| Issue | Name | Status |
| --- | --- | --- |
| 000 | Build OS / governance | done |
| 001 | Repo foundation | done |
| 002 | DB foundation | done |
| 003 | API health / import safety | done |
| 006 | Auth/session | done |
| 007 | Tenant guard hardening | done |
| 008 | Tasks vertical slice | done |
| 009A | Workspace transaction helper | done |
| 009B | updated_at DB triggers | done |
| 010 | Activity logs core | done |
| 011 | Approvals vertical slice | done |
| 012 | Organizations and Contacts | done |
| 012B | Hide archived organizations | done |
| 013 | Leads vertical slice | done |
| 014A | RLS readiness audit | done |
| 014B2 | Activity logs workspace NOT NULL | done |
| 014C0 | Runtime DB role separation | done |
| 014C | RLS activation | done |
| 015 | External Integration Foundation | done |
| 016A | Workspace API Keys | done |
| 016B | Public Lead Intake | done |
| 017A | Drafts Foundation | done |
| 017B | Draft approval handoff | done |
| 018A | Email Sends Foundation | done |
| 019A | Background Jobs Outbox | done |
| 019B | Worker Execution Foundation | done |
| 019C | Worker Ops Hardening | done |
| 020A | AI Scoring Sandbox | done |
| 020A-FIX | AI Scoring Prompt/Schema Fix | done |
| 020B | AI Provider Hardening | done |
| 020B-FIX | AI Scoring Prompt/Token Budget Fix | done |
| 020C | AI Scoring Read Model | done |
| 020D | Resend Provider Integration | done |
| 021A | AI Draft Generation Foundation | done |
| 021B | Draft AI Audit Read Model | done |
| 021C | Draft Approval Readiness / Request-Approval Hardening | done |
| 021D | Draft Send Readiness / Request-Send Hardening | done |
| 021E | Worker Send Execution Hardening | done |
| 021F | Draft Send Status Read Model | done |
| 021G | Draft Send Cancellation | done |
| 021H | Worker Retry / Backoff / Dead Letter | done |
| 021I | Migration Schema Drift Guard | done |
| 021J | Send Proof Hardening | done |
| 021K | Migration Journal Integrity Guard | done |
| 021L | Send Attempt History Read Model | done |
| 021M | Test Environment Isolation | done |
| 021N | RLS Catalog Verification | done |
| 021O | Resend Webhook Foundation | done |
| 021P | Terminal Delivery Immutability Guard | done |
| 022A | CRM Target Selection / Push-back Decision Record | done |
| 022B | Google Sheets Sandbox Setup / Verification | done |
| 022C | Google Sheets Push-back MVP | done |

Near-term candidates:

- Pipeline UI read layer later

## Current Execution Focus

Current focus:

- 022C Google Sheets push-back is implemented and production-validated.
- Next highest-leverage issue is 022D Pushback Observability & Diagnostics.
- Reason: the bottleneck is no longer whether Syrantis can push proof externally. The bottleneck is diagnosing cleanly when push-back fails for a founder or client.
- After diagnostics: manual replay, pushback status read model, then minimal admin UI.

Explicit next sequence:
- 022D Pushback Observability & Diagnostics
- 022E Manual Pushback Replay
- 022F Pushback Status Read Model
- 023A Minimal Admin Console
- 023B Admin Action Panel
- 023C Google Sheets Setup Screen

## Development Workflow

Agent workspace:

```bash
cd /opt/syrantis/agent-workspaces/codex/syrantis-core
```

Clean sync and branch:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
git clean -fd
git checkout -b docs/update-readme-through-021o
```

Baseline checks:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/shared build
pnpm test
pnpm typecheck
pnpm lint
pnpm build

env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Use the shared build before targeted API read-model tests when shared contracts changed:

```bash
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- --run
```

## Pull Request Protocol

Agents do not merge.

Every PR must include:

- scope
- changed files
- migration summary
- security notes
- tests run
- prod validation plan
- known limitations

Minimum local gates:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Import safety:

```bash
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Forbidden surface check example:

```bash
git status --short | grep -E 'apps/api/src/middleware/tenant.ts|apps/api/src/services/auth.ts|apps/api/src/routes/auth.ts|apps/web|ops/|(^|/)\.env|Caddyfile|Dockerfile' || true
```

## Production Deployment Protocol

Production path:

```bash
cd /opt/syrantis/repos/syrantis-core
```

Pull after merge:

```bash
git checkout main
git pull origin main
git status --short
```

Install and build:

```bash
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/shared build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Hostile env tests where relevant:

```bash
pnpm --filter @syrantis/api test -- --run apps/api/src/**/*.hostile-env.test.ts
```

Import safety:

```bash
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Run migrations only when the issue explicitly adds a migration:

```bash
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db migrate'
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db verify-schema'
```

Expected verify-schema after 021P:

```txt
checked=33 passed=33 failed=0
```

Restart API manually from prod runtime if needed:

```bash
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; PORT=8787 pnpm --filter @syrantis/api start'
```

Google Sheets push-back validation:
- Resync prod separately from checks/tests.
- After resync, checks/tests separately.
- Google Sheets verification command:
  `pnpm --filter @syrantis/api verify:sheets-sandbox`
- For pushback range test, force `GOOGLE_SHEETS_RANGE="${GOOGLE_SHEETS_PUSHBACK_RANGE}"` and run `verify:sheets-sandbox`.
- Resend webhook real validation needs:
  - public API domain working through Caddy
  - endpoint: `https://api.syrantis.fr/api/webhooks/resend`
  - `RESEND_WEBHOOK_SECRET` configured
  - Resend webhook events selected: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`
  - `SEND_EMAIL_PROVIDER=resend`
  - API restarted after env changes
  - `worker:once` to send
  - real Resend event or signed test webhook to update delivery proof

Actual public health:
- `https://api.syrantis.fr/health`

## DB Validation Commands

Migration file and journal integrity:

```bash
pnpm --filter @syrantis/db verify-migration-files
```

Expected:

```txt
19 SQL files
19 journal entries
drift=0
```

Live catalog verification:

```bash
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db verify-schema'
```

Expected:

```txt
checked=33 passed=33 failed=0
```

Migration history:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c \
"select * from drizzle.__drizzle_migrations order by id asc;"
```

021O delivery proof columns on `email_sends`:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'email_sends'
  and column_name in (
    'delivery_status',
    'delivered_at',
    'bounced_at',
    'complained_at',
    'delivery_error_code'
  )
order by column_name;
"
```

021O constraints from migration `0017_resend_webhook_delivery_proof.sql`:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.email_sends'::regclass
  and conname like '%delivery%';
"
```

021O provider message lookup policy:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c "
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'email_sends'
  and policyname = 'email_sends_provider_message_lookup';
"
```

RLS status:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c \
"select
  c.relname as table,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;"
```

Policies:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c \
"select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;"
```

Runtime RLS zero-row proof:

```bash
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; python3 - <<PY >/tmp/dburl_check.env
import os, shlex
from urllib.parse import urlparse
u = urlparse(os.environ["DATABASE_URL"])
print("DB_USER=" + shlex.quote(u.username or ""))
print("DB_PASS=" + shlex.quote(u.password or ""))
print("DB_NAME=" + shlex.quote(u.path.lstrip("/") or ""))
PY
source /tmp/dburl_check.env
docker exec -e PGPASSWORD="$DB_PASS" syrantis-postgres psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -c "
select '\''leads'\'' as table_name, count(*) from leads
union all select '\''activity_logs'\'', count(*) from activity_logs
union all select '\''ai_runs'\'', count(*) from ai_runs
union all select '\''lead_scores'\'', count(*) from lead_scores
union all select '\''background_jobs'\'', count(*) from background_jobs
union all select '\''email_sends'\'', count(*) from email_sends
union all select '\''workspace_api_keys'\'', count(*) from workspace_api_keys;
"
rm -f /tmp/dburl_check.env'
```

Expected:

```txt
all counts = 0
```

Latest email sends:

```sql
select id, workspace_id, draft_id, status, provider, created_at, updated_at,
       sent_at, failed_at, delivery_status, delivered_at, bounced_at,
       complained_at, delivery_error_code
from email_sends
order by created_at desc
limit 10;
```

Latest send_email jobs:

```sql
select id, workspace_id, type, status, attempts, scheduled_at, completed_at, failed_at, last_error_code, created_at
from background_jobs
where type = 'send_email'
order by created_at desc
limit 10;
```

Pending/running jobs:

```sql
select id, workspace_id, type, status, attempts, run_after, scheduled_at, locked_at, locked_by, created_at
from background_jobs
where status in ('pending', 'running')
order by created_at asc
limit 20;
```

Send activity log leak check:

```sql
select id, type
from activity_logs
where entity_type = 'email_send'
  and metadata_json::text ~* '(subject|textBody|htmlBody|provider_message_id|raw|response|@)'
order by created_at desc
limit 10;
```

PII leak check in `prompt_json`:

```sql
select id
from ai_runs
where prompt_json::text ~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\\+33[0-9 ]{8,})'
order by created_at desc
limit 10;
```

Lead source not mutated check:

```sql
select id, status, source, score, score_reason, updated_at
from leads
where id = '<lead_id>';
```

## Public Lead Intake Example

Create an API key through authenticated internal route:

```txt
POST /api/workspace-api-keys
```

Use it once:

```bash
curl -sS -X POST http://127.0.0.1:8787/api/public/leads \
  -H "Authorization: Bearer syr_live_xxxxxxxxx" \
  -H "Idempotency-Key: demo-001" \
  -H "Content-Type: application/json" \
  --data '{
    "email": "lead@example.fr",
    "firstName": "Jean",
    "lastName": "Client",
    "phone": "+33600000000",
    "organizationName": "Entreprise Exemple",
    "source": "form",
    "message": "Besoin de devis chauffage",
    "metadata": {
      "origin": "demo"
    }
  }'
```

Expected:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "created"
  }
}
```

Replay with same idempotency key:

```json
{
  "success": true,
  "data": {
    "id": "same uuid",
    "status": "idempotent_replay"
  }
}
```

## AI Scoring Example

1. Login.
2. Create lead.
3. `POST /api/leads/:id/score`.
4. Run worker once.

```bash
pnpm --filter @syrantis/api worker:once
```

Verify:

- `background_jobs.status = completed`
- `ai_runs.status = success`
- `ai_runs.finish_reason = stop`
- `lead_scores` row created
- source `leads` row not mutated
- no raw PII in `prompt_json`
- activity logs compact

## AI Draft / Send Example

1. Login.
2. Create lead.
3. `POST /api/leads/:id/generate-draft`.
4. Run worker once.
5. `GET /api/drafts/:id/ai-audit`.
6. `GET /api/drafts/:id/approval-readiness`.
7. `POST /api/drafts/:id/request-approval`.
8. Human approves through approvals route.
9. `GET /api/drafts/:id/send-readiness`.
10. `POST /api/drafts/:id/request-send`.
11. Optionally `POST /api/drafts/:id/cancel-send` while pending.
12. Run worker once.
13. `GET /api/drafts/:id/send-status`.
14. `GET /api/drafts/:id/send-attempts`.

Internal provider verify:

- `email_sends.status = queued`
- `background_jobs.status = completed`
- no real external email by default
- `sent_at` and `provider_message_id` remain null for internal provider

Resend provider verify when explicitly enabled:

- real send is worker-only
- webhook delivery proof is provider-ingress-only
- send-status and send-attempts expose compact delivery proof
- provider ids and raw payloads remain hidden

## Safety Checks

No hard business delete:

```bash
grep -R "\.delete(" apps/api/src packages/shared/src packages/db/src 2>/dev/null || true
```

Expected exception:

```txt
apps/api/src/services/auth.ts session delete only
```

No raw SQL in business layer:

```bash
grep -R "sql\`" \
  apps/api/src/repositories \
  apps/api/src/services \
  apps/api/src/routes \
  2>/dev/null || true
```

Expected:

```txt
empty, except allowed DB helpers and worker claim infrastructure
```

No secrets committed:

```bash
grep -R -I "OPENAI_API_KEY\|OPENROUTER_API_KEY=.*[A-Za-z0-9]\|RESEND_API_KEY\|RESEND_WEBHOOK_SECRET=.*[A-Za-z0-9]\|ghp_\|github_pat_\|DATABASE_URL=.*://.*:[^*]\|MIGRATION_DATABASE_URL=.*://.*:[^*]\|FOUNDER_PASSWORD=.*[^>]\|sk-[A-Za-z0-9_-]\{30,\}" \
  apps packages docs \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  2>/dev/null || true
```

No OpenRouter endpoint outside provider:

```bash
grep -R "api.openrouter.ai" apps/api/src --exclude-dir=dist --exclude-dir=node_modules || true
```

No fetch outside provider boundaries:

```bash
grep -R "fetch(" apps/api/src --exclude-dir=dist --exclude-dir=node_modules || true
```

Expected:

```txt
empty, except approved provider implementations
```

No provider call in regular routes:

```bash
grep -R "OpenRouterProvider\|Resend\|sendEmail\|provider.send\|fetch(" apps/api/src/routes 2>/dev/null || true
```

No provider external call from webhook route/service:

```bash
grep -R "fetch(\|Resend\|sendEmail\|provider.send" \
  apps/api/src/routes \
  apps/api/src/services/webhooks \
  2>/dev/null | grep -i webhook || true
```

No prompt/output logging:

```bash
grep -R "console.*prompt\|console.*output\|console.*content\|console.*OPENROUTER\|console.*api" \
  apps/api/src/services/ai \
  apps/api/src/services/score-lead-job-handler.ts \
  2>/dev/null || true
```

No raw email body logging in worker:

```bash
grep -R "console.*subject\|console.*textBody\|console.*htmlBody\|console.*toEmail\|console.*fromEmail" \
  apps/api/src/services/background-worker.ts \
  apps/api/src/services/email \
  2>/dev/null || true
```

No client model/prompt control:

```bash
grep -R "prompt.*req\|prompt.*body\|model.*req\|model.*body\|temperature.*req\|maxTokens.*req\|max_tokens.*req" \
  apps/api/src \
  2>/dev/null || true
```

No public ai-runs route:

```bash
grep -R "ai-runs\|ai_runs" apps/api/src/routes packages/shared/src/contracts 2>/dev/null || true
```

No route reading workspaceId from body/query:

```bash
grep -R "workspaceId.*body\|workspaceId.*query\|workspaceId.*req" apps/api/src/routes 2>/dev/null || true
```

No webhook workspaceId from body/query/headers:

```bash
grep -R "workspaceId.*body\|workspaceId.*query\|workspaceId.*header\|x-workspace" apps/api/src 2>/dev/null | grep -i webhook || true
```

No tenantGuard on webhook route:

```bash
grep -R "tenantGuard" apps/api/src/routes 2>/dev/null | grep -i webhook || true
```

No provider_message_id in public response contracts:

```bash
grep -R "provider_message_id\|providerMessageId" packages/shared/src/contracts apps/api/src/routes 2>/dev/null || true
```

Expected:

```txt
empty for public read models/responses; allowed only in internal persistence/provider lookup code
```

No raw webhook payload storage:

```bash
grep -R "raw.*payload\|payload_json\|metadata_json" apps/api/src/services/webhooks apps/api/src/routes/webhooks 2>/dev/null | grep -i webhook || true
```

No raw provider payload storage:

```bash
grep -R "raw.*provider\|provider.*raw\|response.*body\|payload_json" apps/api/src/services apps/api/src/routes 2>/dev/null || true
```

Signature verification exists:

```bash
grep -R "RESEND_WEBHOOK_SECRET\|svix\|webhook.*signature\|verify.*signature" apps/api/src packages/shared/src 2>/dev/null || true
```

No leads mutation in AI modules:

```bash
grep -R "update(leads)\|set({.*score\|scoreReason" \
  apps/api/src/services/ai \
  apps/api/src/services/score-lead-job-handler.ts \
  2>/dev/null || true
```

## Pushback Diagnostics Doctrine

The next system must answer:

- Was the email sent?
- Was a Resend webhook received?
- Was delivery proof updated?
- Was push-back attempted?
- Did push-back succeed?
- If not, what compact error code explains the failure?

Proposed future activity log types:

- `crm_pushback.skipped`
- `crm_pushback.attempted`
- `crm_pushback.succeeded`
- `crm_pushback.failed`
- `crm_pushback.replayed`

Proposed future safe error codes:

- `PUSHBACK_DISABLED`
- `PUSHBACK_MISSING_CREDENTIALS`
- `PUSHBACK_MISSING_SPREADSHEET_ID`
- `PUSHBACK_MISSING_RANGE`
- `PUSHBACK_AUTH_FAILED`
- `PUSHBACK_APPEND_FAILED`
- `PUSHBACK_TIMEOUT`
- `PUSHBACK_UNKNOWN_ERROR`

Forbidden in diagnostics:

- raw Google credential JSON
- `private_key`
- `client_email` from credential file
- `provider_message_id`
- raw webhook payload
- raw Google error body
- `subject`/`htmlBody`/`textBody`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `GOOGLE_SHEETS_CREDENTIALS_JSON` content

## Client Installation Doctrine

Mode A — Founder/internal:

- Google service account JSON
- Sheet shared with service account
- env-based config
- good for internal production and technical tests
- already used successfully

Mode B — Client simple:

- Google Apps Script Web App receiver
- client opens existing Sheet
- Extensions → Apps Script
- copy/paste Syrantis script
- deploy Web App
- paste URL/secret into Syrantis
- lower technical friction than Google Cloud/IAM

Mode C — Product mature:

- OAuth Google onboarding
- client clicks connect Google Sheets
- token stored encrypted
- user chooses spreadsheet/range
- not now

Recommended order:

- Founder/internal: Mode A
- First client pilot: Mode B
- Scalable product: Mode C later

## Roadmap

Near-term:

1. 022D Pushback Observability & Diagnostics
2. 022E Manual Pushback Replay
3. 022F Pushback Status Read Model
4. 023A Minimal Admin Console
5. 023B Admin Action Panel
6. 023C Google Sheets Setup Screen

Acquisition:

7. 024A Scout Doctrine & Data Model
8. 024B Local Prospect Import MVP
9. 024C Weakness Scoring Engine
10. 024D AI Outreach Draft Generator
11. 024E Outreach Compliance Guard

Channels:

12. 025A WhatsApp Business Sandbox Research
13. 025B WhatsApp Inbound Capture MVP
14. 025C WhatsApp Opt-in Follow-up

CRM:

15. 026A Dolibarr Sandbox Setup
16. 026B Dolibarr Push-back MVP
17. 026C Dolibarr Diagnostics

Not implemented:

- CRM proof push-back runtime behavior (other than Sheets)
- CRM connector code
- production Google Sheets push-back (beyond MVP)
- Pipeline UI read layer
- webhook event store

Later connector candidates:

- Google Sheets connector (full)
- Dolibarr connector
- Twenty connector
- HubSpot connector only if client-forced
- Odoo connector only if client-forced

## Known Current Limitations

- push-back has no replay endpoint yet
- push-back has no status read model yet
- push-back diagnostics are still weak
- no client onboarding UI
- no OAuth Google integration
- no Dolibarr connector
- no generic CRM adapter
- no WhatsApp integration
- no Scout acquisition engine yet
- API is currently manually started in production, future systemd/ops hardening is needed if not already formalized

## Future: Syrantis Scout / Acquisition Roadmap

Syrantis should become a controlled local B2B acquisition OS, not only a send/proof tool.

Future loop:

```txt
Local business source
  ↓
weak signal extraction
  ↓
lead weakness scoring
  ↓
AI draft generation
  ↓
human approval
  ↓
email outreach
  ↓
delivery proof
  ↓
Google Sheets / CRM push-back
  ↓
diagnostics and replay
```

Potential weak signals:

- recent Google reviews mentioning no response / slow response
- unanswered Google Business questions
- missing website
- broken or slow mobile site
- missing quote form
- no visible contact path
- poor review response behavior
- competitor nearby with better rating
- seasonal service timing
- weak local trust signals

Guardrails:

- B2B relevance check
- no private-person targeting
- professional contact only
- opt-out support
- human approval before outreach
- WhatsApp only after opt-in
- no voice clone / aggressive automated call lane in MVP

## Future: WhatsApp

Status:

- not implemented
- not next
- must be opt-in first
- good path is inbound capture or explicit consent

Future:

- 025A WhatsApp Business Sandbox Research
- 025B WhatsApp Inbound Capture MVP
- 025C WhatsApp Opt-in Follow-up

## Future DevOps: Syrantis Sweeper

Syrantis may eventually need a conservative maintenance bot inspired by ClawSweeper.

Working name:

```txt
Syrantis Sweeper
```

Purpose:

- review issues, PRs, and commits
- surface migration, RLS, worker, AI provider, cost, and read-model drift
- produce durable review state and safe maintenance proposals
- never become an autonomous deployer
- never merge, deploy, or mutate production

Possible future lanes:

- issue/PR sweeper
- commit review sweeper
- migration safety sweeper
- worker validation sweeper
- AI provider/cost drift sweeper
- read-model privacy sweeper
- prod validation checklist generator
- security drift sweeper
