# Syrantis Core

Syrantis Core is a backend-first B2B AI orchestration layer.

It is not a CRM.

It sits above existing business systems and turns incoming leads into controlled, auditable actions.

```txt
Client CRM / form / sheet
        ↓
Syrantis intake
        ↓
Canonical lead context
        ↓
AI draft
        ↓
Human approval
        ↓
Action execution
        ↓
Proof returned to CRM
Product Positioning

Syrantis is the controlled action layer for small and mid-sized businesses.

Client CRM = commercial source of truth
Syrantis = AI execution, approvals, logs, drafts, automation control

Primary wedge:

TPE / PME artisans
Plumbing / heating / local services
Lead response + quote follow-up

The first sellable loop is:

Lead received
  → normalized
  → scored
  → task created
  → AI draft prepared
  → human approval requested
  → email sent after approval
  → activity logged
  → CRM updated

No chatbot.
No CRM clone.
No uncontrolled agent.

Current State

Production server:

ubuntu-8gb-fsn1-1

Runtime separation:

syrantis-ai = agent / Codex workspace
syrantis    = production runtime

Paths:

/opt/syrantis/agent-workspaces/codex/syrantis-core
/opt/syrantis/repos/syrantis-core
/opt/syrantis/env/core.prod.env

Rules:

agents work only in /opt/syrantis/agent-workspaces
production runs only from /opt/syrantis/repos
secrets stay only in /opt/syrantis/env/core.prod.env
agents never deploy
agents never merge
agents never edit prod env
Stack
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
Architecture Map
Security Model

Syrantis uses defense in depth.

cookie auth for internal API
Bearer API key auth for public intake
tenantGuard for session routes
withWorkspaceDb for transaction scoped workspace context
PostgreSQL RLS + FORCE on tenant tables
runtime DB role without superuser or bypassrls
admin DB role only for migrations

Runtime role:

syrantis_app
  rolsuper     false
  rolbypassrls false
  owner        false

Migration role:

syrantis
  used by MIGRATION_DATABASE_URL

Public API key model:

plaintext shown once
SHA-256 stored
key prefix + last4 stored
revocation supported
last_used_at tracked
Guardrails

Hard rules:

workspaceId never comes from the client
cross-workspace access returns 404
business routes never hard-delete by default
activity logs are transactional
updated_at is database-owned
agents never touch production secrets
agents never work in runtime repo
agents never directly access DB
future AI agents use API only
future jobs use PostgreSQL SKIP LOCKED before Redis/Kafka

Forbidden by default:

business .delete()
raw SQL in services/routes/repositories
workspaceId body/query injection
public route under tenantGuard
secret-like payloads in metadata
API keys or hashes in DTOs
AI generation before approval foundation
email send before approval
Completed Capabilities
Auth and Tenant
006 Auth/session
007 Tenant guard
009A Workspace transaction helper
014C0 Runtime DB role separation
014C RLS activation

Implemented:

login
logout
/auth/me
/auth/session-check
opaque session cookie
workspace-scoped request context
Business Core
008 Tasks
010 Activity logs
011 Approvals
012 Organizations and Contacts
012B Hide archived organizations
013 Leads
017A Drafts Foundation in progress

Implemented routes:

/api/tasks
/api/activity-logs
/api/approvals
/api/organizations
/api/contacts
/api/leads
/api/drafts        planned in 017A
Integration Foundation
015 External Integration Foundation
016A Workspace API Keys
016B Public Lead Intake

Implemented routes:

/api/integrations
/api/workspace-api-keys
/api/public/leads

Integration tables:

external_connections
external_object_mappings
integration_events

Public intake:

POST /api/public/leads
Authorization: Bearer syr_live_...
Idempotency-Key: optional

Behavior:

resolves workspace from API key
creates lead
optionally creates organization/contact
optionally creates external mapping
writes integration_event public_lead.received
writes activity logs lead.created and public_lead.received
updates workspace_api_keys.last_used_at
rejects revoked keys
rejects secret-like metadata
Database Security Status

RLS enabled and forced on:

organizations
contacts
leads
tasks
approvals
activity_logs
external_connections
external_object_mappings
integration_events
workspace_api_keys

RLS policy shape:

workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid

Public API key lookup policy:

status = 'active'
AND key_hash = nullif(current_setting('app.current_api_key_hash', true), '')

Direct runtime select without workspace context must return zero rows.

Operational Lanes

Syrantis Core runs in several independent lanes.

1. Internal API Lane
browser/session
  ↓
tenantGuard
  ↓
withWorkspaceDb
  ↓
business table
  ↓
activity_logs

Used by:

tasks
approvals
organizations
contacts
leads
integrations
workspace API keys
drafts
2. Public Intake Lane
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

Used by:

forms
Make
Zapier
Google Sheets
future CRM connectors
3. Future Draft Lane
lead
  ↓
draft
  ↓
approval request
  ↓
human decision
  ↓
email send

Status:

017A Drafts CRUD + archive in progress
017B Draft approval handoff next
4. Future AI Lane
lead context
  ↓
ai_run
  ↓
draft output
  ↓
approval gate

Not implemented yet.

5. Future Email Lane
approved draft
  ↓
Resend
  ↓
email_sends
  ↓
email_events
  ↓
activity_logs

Not implemented yet.

6. Future CRM Push-back Lane
email sent / task done / approval accepted
  ↓
integration_event outbound
  ↓
connector adapter
  ↓
CRM note/status update

Not implemented yet.

Issue Timeline
Issue	Name	Status
000	Build OS / governance	done
001	Repo foundation	done
002	DB foundation	done
003	API health / import safety	done
006	Auth/session	done
007	Tenant guard hardening	done
008	Tasks vertical slice	done
009A	Workspace transaction helper	done
009B	updated_at DB triggers	done
010	Activity logs core	done
011	Approvals vertical slice	done
012	Organizations and Contacts	done
012B	Hide archived organizations	done
013	Leads vertical slice	done
014A	RLS readiness audit	done
014B2	Activity logs workspace NOT NULL	done
014C0	Runtime DB role separation	done
014C	RLS activation	done
015	External Integration Foundation	done
016A	Workspace API Keys	done
016B	Public Lead Intake	done
017A	Drafts Foundation	in progress
017B	Draft approval handoff	next
018	AI Runs + Scoring	planned
019	Resend Provider	planned
020	Jobs Foundation	planned
021	CRM Push-back v1	planned
022+	Native CRM connectors	planned
Current Execution Focus
017A Drafts Foundation

Goal:

Create the internal draft object without triggering approval, AI, or email.

Expected routes:

GET    /api/drafts
POST   /api/drafts
GET    /api/drafts/:id
PATCH  /api/drafts/:id
POST   /api/drafts/:id/archive

Allowed:

draft CRUD
draft archive
lead existence validation
workspace-scoped repository
RLS/grants for drafts if missing
activity logs draft.created / draft.updated / draft.archived

Forbidden:

request approval
AI generation
Resend
email sending
jobs
public draft routes
webhooks
OAuth
Development Workflow
Agent workspace
cd /opt/syrantis/agent-workspaces/codex/syrantis-core
Sync main
git fetch origin
git checkout main
git pull origin main
git status --short
Create feature branch
BRANCH_NAME="feat/017a-drafts-foundation"

if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  git checkout "${BRANCH_NAME}"
  git rebase main
else
  git checkout -b "${BRANCH_NAME}"
fi
Baseline checks
pnpm test
pnpm typecheck
pnpm lint
pnpm build

env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
Pull Request Protocol

Agents do not merge.

Every PR must include:

scope
changed files
migration summary
security notes
tests run
prod validation plan
known limitations

Minimum local gates:

pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check

Import safety:

env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"

Forbidden surface check example:

git status --short | grep -E 'apps/api/src/middleware/tenant.ts|apps/api/src/services/auth.ts|apps/api/src/routes/auth.ts|apps/web|ops/|(^|/)\.env|Caddyfile|Dockerfile|pnpm-lock.yaml' || true
Production Deployment Protocol

Production path:

cd /opt/syrantis/repos/syrantis-core

Pull after merge:

git checkout main
git pull origin main
git status --short

Install and build:

pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build

Run migrations:

bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db migrate'

Import safety:

env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"

Restart API manually from prod runtime if needed:

bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; PORT=8787 pnpm --filter @syrantis/api start'
DB Validation Commands
Migration history
docker exec syrantis-postgres psql -U syrantis -d syrantis -c \
"select * from drizzle.__drizzle_migrations order by id asc;"
RLS status
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
Policies
docker exec syrantis-postgres psql -U syrantis -d syrantis -c \
"select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;"
Runtime RLS zero-row proof
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
union all select '\''external_connections'\'', count(*) from external_connections
union all select '\''external_object_mappings'\'', count(*) from external_object_mappings
union all select '\''integration_events'\'', count(*) from integration_events
union all select '\''workspace_api_keys'\'', count(*) from workspace_api_keys;
"
rm -f /tmp/dburl_check.env'

Expected:

all counts = 0
Public Lead Intake Example

Create an API key through authenticated internal route:

POST /api/workspace-api-keys

Use it once:

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

Expected:

{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "created"
  }
}

Replay with same idempotency key:

{
  "success": true,
  "data": {
    "id": "same uuid",
    "status": "idempotent_replay"
  }
}
Safety Checks
No hard business delete
grep -R "\.delete(" apps/api/src packages/shared/src packages/db/src 2>/dev/null || true

Expected exception:

apps/api/src/services/auth.ts session delete only
No raw SQL in business layer
grep -R "sql\`" \
  apps/api/src/repositories \
  apps/api/src/services \
  apps/api/src/routes \
  2>/dev/null || true

Expected:

empty

Allowed helper exception:

apps/api/src/lib/db.ts
No secrets committed
grep -R -I "OPENAI_API_KEY\|RESEND_API_KEY\|ghp_\|github_pat_\|DATABASE_URL=.*://.*:[^*]\|MIGRATION_DATABASE_URL=.*://.*:[^*]\|FOUNDER_PASSWORD=.*[^>]\|sk-[A-Za-z0-9_-]\{30,\}" \
  apps packages docs \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  2>/dev/null || true
Roadmap
Near-term
017A Drafts Foundation
017B Draft approval handoff
018 AI Runs + scoring
019 Resend Provider
020 Jobs Foundation
021 CRM Push-back v1
MVP v1
public intake
  ↓
lead/contact/org normalization
  ↓
AI draft
  ↓
human approval
  ↓
Resend email
  ↓
logs + CRM push-back
Later
HubSpot connector
Pipedrive connector
Google Sheets connector
Odoo connector
Zoho connector
Sellsy connector
Future DevOps: Syrantis Sweeper

Syrantis will eventually need its own maintenance bot inspired by ClawSweeper.

Working name:

Syrantis Sweeper

Purpose:

conservative maintenance bot for Syrantis repositories

It should not become an autonomous deployer.

It should produce durable review state, surface drift, and propose safe maintenance actions.

Planned Lanes
issue/PR sweeper
commit review sweeper
migration safety sweeper
prod validation sweeper
security drift sweeper
Issue/PR Sweeper

Responsibilities:

scan open issues and PRs
write one markdown report per item
sync one durable marker-backed GitHub comment
never spam duplicate comments
propose closes only with strong evidence
never close maintainer-authored items automatically

Records shape:

records/syrantis-core/items/<number>.md
records/syrantis-core/closed/<number>.md

Report content:

decision
evidence
risk level
changed surface
migration impact
RLS impact
tests expected
prod validation checklist
suggested maintainer comment
GitHub snapshot hash
Commit Review Sweeper

Responsibilities:

watch main branch commits
skip docs-only commits cheaply
review code-bearing commits
write one report per commit SHA
optionally create GitHub Check Run
never mutate code while reviewing

Records shape:

records/syrantis-core/commits/<sha>.md

Results:

nothing_found
findings
inconclusive
failed
skipped_non_code
Migration Safety Sweeper

Syrantis-specific lane.

Checks:

new migrations registered in journal
RLS enabled when table is tenant-scoped
FORCE RLS enabled
syrantis_app grants present
no owner change to runtime role
no DROP / DELETE destructive migration without explicit approval
updated_at trigger present for updated_at tables
Production Validation Sweeper

Syrantis-specific lane.

Reads PR body and generated validation plan.

Can generate:

prod-checklists/<issue>.md
curl validation commands
SQL validation commands
rollback commands

Must never:

run deployment
edit prod env
access secrets
connect to DB directly without maintainer command
Security Drift Sweeper

Checks:

secret-like values committed
workspaceId accepted from client
raw SQL added outside DB helper
.delete() added in business code
tenantGuard modified
withWorkspaceDb modified
RLS policy drift
public endpoint added without explicit auth model
Maintainer Commands

Potential commands:

@syrantis-sweeper status
@syrantis-sweeper review
@syrantis-sweeper re-review
@syrantis-sweeper check migration
@syrantis-sweeper generate prod checks
@syrantis-sweeper explain
@syrantis-sweeper stop

Rules:

maintainer-only
read-only by default
write actions require explicit opt-in
no merge
no deploy
no secret access
Guarded Apply Model

Syrantis Sweeper may propose but not execute risky actions.

Allowed future apply candidates:

sync stale review comment
move closed report to archive
label issue as needs-prod-validation
label PR as migration-review-needed
generate checklist PR comment

Forbidden apply candidates:

merge PR
deploy production
edit env files
rotate secrets
run migrations
close maintainer-authored issues automatically
State Repository

Future generated state repo:

syrantis/syrantis-sweeper-state

State layout:

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

Dashboard should show:

open issues needing review
PRs with migration impact
PRs with RLS impact
recent main commits
failed or inconclusive commit reviews
prod validation pending
security drift alerts
Local Run

Core commands:

corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build

API import safety:

env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
GitHub Actions Future

Recommended CI gates:

install
typecheck
lint
test
build
import safety
migration journal check
forbidden surface grep
secret grep
RLS policy grep for tenant tables

Future required secrets:

OPENAI_API_KEY
SYRANTIS_SWEEPER_APP_CLIENT_ID
SYRANTIS_SWEEPER_APP_PRIVATE_KEY

Never expose:

DATABASE_URL
MIGRATION_DATABASE_URL
FOUNDER_PASSWORD
workspace API keys
Resend key
CRM OAuth credentials
Philosophy

Syrantis Core optimizes for controlled execution.

not more features
better guarantees

Every new capability must answer:

what tenant owns it?
what transaction contains it?
what audit log proves it?
what RLS policy protects it?
what rollback path exists?
what future agent boundary does it create?

The target is not a big dashboard.

The target is a reliable action spine:

Lead → Context → Draft → Approval → Send → Proof → CRM
