# Syrantis Core

Syrantis Core is a backend-first B2B AI orchestration layer.

It is not a CRM.

It is a controlled action layer above CRMs, forms, sheets, and business tools.

Client CRM = commercial source of truth.

Syrantis = intake, canonical lead context, AI scoring, drafts, approval, worker execution, audit logs, future send/pushback.

```txt
Client CRM / form / sheet
        ↓
Syrantis intake
        ↓
Canonical lead context
        ↓
AI scoring
        ↓
Task / draft
        ↓
Human approval
        ↓
Controlled send / worker execution
        ↓
Activity log
        ↓
Future CRM update
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
  → task / draft
  → approval
  → send
  → log
  → CRM update
```

No chatbot.

No CRM clone.

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

## Stack

```txt
Runtime/API       Hono + TypeScript
Database          PostgreSQL
ORM               Drizzle
Validation        Zod
Package manager   pnpm
Tests             Vitest
Architecture      API-first, backend-first
Auth              opaque session cookie
Tenant model      tenantGuard + RLS
Transactions      withWorkspaceDb
Audit             activity_logs
Async             background_jobs
Worker            worker CLI
AI Provider       OpenRouter through hardened provider boundary
```

## Security Model

Syrantis uses defense in depth.

- cookie auth for internal API
- Bearer API key auth for public intake
- tenantGuard for session routes
- withWorkspaceDb for transaction-scoped workspace context
- PostgreSQL RLS + FORCE on tenant tables
- runtime DB role `syrantis_app` without superuser or bypassrls
- migration DB role `syrantis`
- worker DB role `syrantis_worker`

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
- cross-workspace access returns 404
- business routes never hard-delete by default
- activity logs are transactional and compact
- updated_at is database-owned
- secrets are never committed
- agents never touch production secrets
- agents never work in runtime repo
- agents never deploy
- future jobs use PostgreSQL SKIP LOCKED before Redis/Kafka
- no provider external calls from routes
- no prompt client input
- no raw prompt/output in activity_logs
- no AI mutation of source leads

Forbidden by default:

- business `.delete()`
- raw SQL outside allowed worker claim / DB helpers
- workspaceId body/query injection
- public route under tenantGuard
- secret-like payloads in metadata
- API keys or hashes in DTOs
- provider call from route
- Resend before approval/send outbox
- AI output applied directly to source lead

## Completed Capabilities

### Auth and Tenant

- 006 Auth/session
- 007 Tenant guard
- 009A Workspace transaction helper
- 014C0 Runtime DB role separation
- 014C RLS activation

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

Implemented routes:

- `/api/tasks`
- `/api/activity-logs`
- `/api/approvals`
- `/api/organizations`
- `/api/contacts`
- `/api/leads`
- `/api/leads/:id/score`
- `/api/drafts`
- `/api/drafts/:id/request-approval`
- `/api/drafts/:id/request-send`
- `/api/email-sends`
- `/api/integrations`
- `/api/workspace-api-keys`
- `/api/public/leads`

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

Worker commands:

```bash
pnpm --filter @syrantis/api worker:check
pnpm --filter @syrantis/api worker:jobs -- --status pending --limit 20
pnpm --filter @syrantis/api worker:repair-stale
pnpm --filter @syrantis/api worker:once
pnpm --filter @syrantis/api worker:run
```

### AI

- 020A AI Scoring Sandbox
- 020A-FIX AI scoring schema/token budget fix
- 020B AI Provider Hardening
- 020B-FIX prompt/schema/token budget validation

Current AI scoring model:

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
- cost tracked in `cost_estimate_micro_usd`

## Database Security Status

RLS enabled and forced on:

- organizations
- contacts
- leads
- tasks
- approvals
- activity_logs
- drafts
- email_sends
- background_jobs
- ai_runs
- lead_scores
- external_connections
- external_object_mappings
- integration_events
- workspace_api_keys

RLS policy shape:

```sql
workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
```

Public API key lookup policy:

```sql
status = 'active'
AND key_hash = nullif(current_setting('app.current_api_key_hash', true), '')
```

Direct runtime select without workspace context must return zero rows.

`lead_scores` and `ai_runs` are tenant-protected.

`syrantis_worker` has no direct grants to `ai_runs` or `lead_scores`.

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
approval request
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
request-send
  ↓
email_sends.pending
  ↓
background_jobs.send_email
  ↓
worker mock queues email_send
```

Status:

- send_email provider is still mock/internal
- no Resend real send yet

### 5. Async Worker Lane

```txt
background_jobs.pending
  ↓
claim with FOR UPDATE SKIP LOCKED
  ↓
running
  ↓
handler
  ↓
completed / failed
```

Worker ops are exposed through CLI, not HTTP.

### 6. AI Scoring Lane

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

### 7. Future CRM Push-back Lane

```txt
email sent / task done / approval accepted
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
| 020C | AI Scoring Read Model | next |
| 020D | Resend Provider | planned |
| 020E | CRM Push-back v1 | planned |
| 021+ | Native CRM connectors | planned |

## Current Execution Focus

020C AI Scoring Read Model

Goal:

Expose read-only scoring results through tenant-protected APIs.

Expected routes:

```txt
GET /api/leads/:id/score
GET /api/leads/:id/scores
```

Allowed:

- latest lead score read model
- lead score history
- compact ai_run metadata
- pagination
- no-score behavior
- cross-workspace 404
- DTO contracts
- tests
- docs

Forbidden:

- provider call
- OpenRouter call
- scoring trigger
- mutation of leads
- prompt_json exposure
- input_payload/output_payload exposure
- raw error/output exposure
- public route
- UI
- new worker behavior
- Resend
- auto-scoring

## Development Workflow

Agent workspace:

```bash
cd /opt/syrantis/agent-workspaces/codex/syrantis-core
```

Sync main:

```bash
git fetch origin
git checkout main
git pull origin main
git status --short
```

Create feature branch:

```bash
BRANCH_NAME="feat/020c-ai-scoring-read-model"

if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  git checkout "${BRANCH_NAME}"
  git rebase main
else
  git checkout -b "${BRANCH_NAME}"
fi
```

Baseline checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build

env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
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
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Run migrations when the issue has a migration:

```bash
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db migrate'
```

020C likely has no migration unless implementation needs one.

Import safety:

```bash
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Restart API manually from prod runtime if needed:

```bash
bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; PORT=8787 pnpm --filter @syrantis/api start'
```

## DB Validation Commands

Migration history:

```bash
docker exec syrantis-postgres psql -U syrantis -d syrantis -c \
"select * from drizzle.__drizzle_migrations order by id asc;"
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

Latest AI runs:

```sql
select id, workspace_id, reference_type, reference_id, provider, model_used, status,
       finish_reason, input_tokens, output_tokens, cost_estimate_micro_usd, created_at
from ai_runs
order by created_at desc
limit 10;
```

Latest lead scores:

```sql
select id, workspace_id, lead_id, ai_run_id, score, qualification, confidence, created_at
from lead_scores
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
grep -R -I "OPENAI_API_KEY\|OPENROUTER_API_KEY=.*[A-Za-z0-9]\|RESEND_API_KEY\|ghp_\|github_pat_\|DATABASE_URL=.*://.*:[^*]\|MIGRATION_DATABASE_URL=.*://.*:[^*]\|FOUNDER_PASSWORD=.*[^>]\|sk-[A-Za-z0-9_-]\{30,\}" \
  apps packages docs \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  2>/dev/null || true
```

No OpenRouter endpoint outside provider:

```bash
grep -R "api.openrouter.ai" apps/api/src --exclude-dir=dist --exclude-dir=node_modules || true
```

No fetch outside OpenRouter provider:

```bash
grep -R "fetch(" apps/api/src --exclude-dir=dist --exclude-dir=node_modules || true
```

No provider call in routes:

```bash
grep -R "OpenRouterProvider\|fetch(" apps/api/src/routes apps/api/src/services/leads.ts 2>/dev/null || true
```

No prompt/output logging:

```bash
grep -R "console.*prompt\|console.*output\|console.*content\|console.*OPENROUTER\|console.*api" \
  apps/api/src/services/ai \
  apps/api/src/services/score-lead-job-handler.ts \
  2>/dev/null || true
```

No client model/prompt control:

```bash
grep -R "prompt.*req\|prompt.*body\|model.*req\|model.*body\|temperature.*req\|maxTokens.*req\|max_tokens.*req" \
  apps/api/src \
  2>/dev/null || true
```

No leads mutation in AI modules:

```bash
grep -R "update(leads)\|set({.*score\|scoreReason" \
  apps/api/src/services/ai \
  apps/api/src/services/score-lead-job-handler.ts \
  2>/dev/null || true
```

## Roadmap

Near-term:

- 020C AI Scoring Read Model
- 020D Resend Provider Integration
- 020E Email event/webhook hardening
- 020F CRM Push-back v1

MVP v1:

```txt
public intake
  ↓
lead/contact/org normalization
  ↓
AI scoring
  ↓
task/draft
  ↓
approval
  ↓
send
  ↓
logs + CRM push-back
```

Later:

- HubSpot connector
- Pipedrive connector
- Google Sheets connector
- Odoo connector
- Zoho connector

## Future DevOps: Syrantis Sweeper

Syrantis will eventually need its own maintenance bot inspired by ClawSweeper.

Working name:

```txt
Syrantis Sweeper
```

Purpose:

conservative maintenance bot for Syrantis repositories

It should not become an autonomous deployer.

It should produce durable review state, surface drift, and propose safe maintenance actions.

Planned lanes:

- issue/PR sweeper
- commit review sweeper
- migration safety sweeper
- worker validation sweeper
- AI provider/cost drift sweeper
- read-model privacy sweeper
- prod validation checklist generator
- security drift sweeper

### Issue/PR Sweeper

Responsibilities:

- scan open issues and PRs
- write one markdown report per item
- sync one durable marker-backed GitHub comment
- never spam duplicate comments
- propose closes only with strong evidence
- never close maintainer-authored items automatically

Records shape:

```txt
records/syrantis-core/items/<number>.md
records/syrantis-core/closed/<number>.md
```

Report content:

- decision
- evidence
- risk level
- changed surface
- migration impact
- RLS impact
- tests expected
- prod validation checklist
- suggested maintainer comment
- GitHub snapshot hash

### Commit Review Sweeper

Responsibilities:

- watch main branch commits
- skip docs-only commits cheaply
- review code-bearing commits
- write one report per commit SHA
- optionally create GitHub Check Run
- never mutate code while reviewing

Records shape:

```txt
records/syrantis-core/commits/<sha>.md
```

Results:

- nothing_found
- findings
- inconclusive
- failed
- skipped_non_code

### Migration Safety Sweeper

Syrantis-specific lane.

Checks:

- new migrations registered in journal
- RLS enabled when table is tenant-scoped
- FORCE RLS enabled
- syrantis_app grants present
- no owner change to runtime role
- no DROP / DELETE destructive migration without explicit approval
- updated_at trigger present for updated_at tables

### Worker Validation Sweeper

Checks:

- worker preflight remains enabled
- `syrantis_worker` direct grants remain minimal
- stale repair does not touch completed/cancelled jobs
- worker handlers do not call tenantGuard
- score_lead provider calls are outside DB transactions

### AI Provider / Cost Drift Sweeper

Checks:

- OpenRouter endpoint appears only in provider
- allowed model list did not drift accidentally
- pricing map changes are explicit
- cost_estimate_micro_usd is persisted for scoring runs
- no prompt/output logging was introduced

### Read-model Privacy Sweeper

Checks:

- read models do not expose `prompt_json`
- read models do not expose `input_payload`
- read models do not expose raw `output_payload`
- error previews are compact
- PII is not surfaced through DTOs

### Production Validation Sweeper

Reads PR body and generated validation plan.

Can generate:

- `prod-checklists/<issue>.md`
- curl validation commands
- SQL validation commands
- rollback commands

Must never:

- run deployment
- edit prod env
- access secrets
- connect to DB directly without maintainer command

### Security Drift Sweeper

Checks:

- secret-like values committed
- workspaceId accepted from client
- raw SQL added outside DB helper
- `.delete()` added in business code
- tenantGuard modified
- withWorkspaceDb modified
- RLS policy drift
- public endpoint added without explicit auth model

### Maintainer Commands

Potential commands:

```txt
@syrantis-sweeper status
@syrantis-sweeper review
@syrantis-sweeper re-review
@syrantis-sweeper check migration
@syrantis-sweeper generate prod checks
@syrantis-sweeper explain
@syrantis-sweeper stop
```

Rules:

- maintainer-only
- read-only by default
- write actions require explicit opt-in
- no merge
- no deploy
- no secret access

### Guarded Apply Model

Syrantis Sweeper may propose but not execute risky actions.

Allowed future apply candidates:

- sync stale review comment
- move closed report to archive
- label issue as needs-prod-validation
- label PR as migration-review-needed
- generate checklist PR comment

Forbidden apply candidates:

- merge PR
- deploy production
- edit env files
- rotate secrets
- run migrations
- close maintainer-authored issues automatically

### State Repository

Future generated state repo:

```txt
syrantis/syrantis-sweeper-state
```

State layout:

```txt
records/
  syrantis-core/
    items/
    closed/
    commits/
jobs/
results/
  sweep-status/
  audit/
  dashboards/
```

Dashboard should show:

- open issues needing review
- PRs with migration impact
- PRs with RLS impact
- recent main commits
- failed or inconclusive commit reviews
- prod validation pending
- security drift alerts

### Local Run

Core commands:

```bash
corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

API import safety:

```bash
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

### GitHub Actions Future

Recommended CI gates:

- install
- typecheck
- lint
- test
- build
- import safety
- migration journal check
- forbidden surface grep
- secret grep
- RLS policy grep for tenant tables

Future required secrets:

- OPENAI_API_KEY
- SYRANTIS_SWEEPER_APP_CLIENT_ID
- SYRANTIS_SWEEPER_APP_PRIVATE_KEY

Never expose:

- DATABASE_URL
- MIGRATION_DATABASE_URL
- FOUNDER_PASSWORD
- workspace API keys
- Resend key
- CRM OAuth credentials

## Philosophy

Syrantis Core optimizes for controlled execution.

Not more features.

Better guarantees.

Every new capability must answer:

- what tenant owns it?
- what transaction contains it?
- what audit log proves it?
- what RLS policy protects it?
- what rollback path exists?
- what future agent boundary does it create?

The target is not a big dashboard.

The target is a reliable action spine:

```txt
Lead → Context → Score → Draft → Approval → Send → Proof → CRM
```
