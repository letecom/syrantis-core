# Agent Governance

This file is the root governance contract for all agents working on Syrantis Core.

## Roles

- Founder Governor: final decision-maker for scope, pricing, sales, deployment approval, and product wedge.
- Architecte Principal: validates architecture, sequencing, implementation boundaries, and technical risk.
- Codex: implements scoped issues from the development workspace, using VSCode Remote SSH.
- OpenCode: handles targeted debugging, tests, and narrow refactors.
- OpenClaw: prepares plans, specs, and reviews.
- ClawSweeper/SyrantisSweeper: review-only guardrail at first; flags risks and drift.

Codex is used from VSCode Remote SSH. Codex is not installed as the primary server tool and must not become the operational deploy mechanism.

## Hard Bans

Agents must not:

- merge pull requests
- deploy
- read, create, print, or modify secrets
- create `.env` files
- modify protected production files
- work directly in `/opt/syrantis/repos/syrantis-core`
- touch `/opt/syrantis/env/core.prod.env`
- change auth, tenant, or security rules without explicit human approval
- add framework abstractions without a clear business reason
- build features outside the 90-day wedge
- initialize package managers unless an issue explicitly asks for it
- create application code, DB schema, API routes, or Docker Compose runtime files during Issue 000

## Workspace Rules

- Development happens in `/opt/syrantis/agent-workspaces`.
- Production runtime happens in `/opt/syrantis/repos`.
- Agents use `/opt/syrantis/agent-workspaces/codex/syrantis-core` for Codex work unless instructed otherwise.
- Agents do not assume Docker access.
- Agents do not use the production runtime user for development.

## Secrets Rules

- No secrets in Git.
- No secrets in docs.
- No secrets in shell history, command output, screenshots, issues, PRs, or implementation reports.
- Production secrets live only in `/opt/syrantis/env/core.prod.env`.
- Agents may reference secret names and required variables, but not values.
- Any accidental exposure must trigger the incident runbook.

## Tenant and Data Isolation Rules

Workspace isolation is a hard security boundary.

Agents must enforce these rules on every business feature:

- `workspaceId` must come only from trusted server context.
- Trusted server context means `tenantGuard`, a future approved machine-to-machine token, or a future approved internal job context.
- `workspaceId` must never be accepted from request body, query params, URL params, headers, or client-side state.
- Client-provided `workspaceId` is forbidden, even when it matches the current session.
- All workspace-scoped business reads must filter by `workspaceId`.
- All workspace-scoped business detail reads must filter by both resource `id` and `workspaceId`.
- All workspace-scoped business updates must filter by both resource `id` and `workspaceId`.
- Cross-workspace resources must behave as invisible and return `404`, not `403`.
- Routes must not reveal whether a resource exists in another workspace.
- Any route that touches business data must be protected by `tenantGuard` or an explicitly approved equivalent guard.
- New protected route patterns must be documented in the related issue spec and implementation report.

Workspace-scoped business tables include at minimum:

- organizations
- contacts
- leads
- opportunities
- tasks
- approvals
- drafts
- email_sends
- email_events
- activity_logs
- ai_runs
- templates
- notes

## Repository and Query Rules

Business queries must be written so the tenant boundary is obvious during review.

Agents must follow these rules:

- Business repositories must receive `workspaceId` explicitly.
- Business repositories must not depend on Hono `Context`.
- Hono routes extract `workspaceId` from context and pass it into services or repositories.
- Services may orchestrate business behavior but must not infer tenant identity from client input.
- Repository functions that read one record must include both `id` and `workspaceId` in the query.
- Repository functions that update one record must include both `id` and `workspaceId` in the query.
- Repository functions that list records must include `workspaceId` in the query.
- Business route, service, and repository code must use Drizzle query builder by default.
- Raw SQL is forbidden in business routes, services, and repositories unless the issue explicitly approves it and documents why Drizzle cannot express the operation safely.
- Raw SQL may exist in schema, migrations, low-level DB health checks, or explicitly approved infrastructure code.

## Deletion Rules

Business records are not physically deleted by default.

Agents must not add physical delete behavior for business records unless a dedicated issue explicitly approves it and defines:

- authorization
- audit logging
- rollback behavior
- retention impact
- GDPR or legal impact
- production validation

For normal user-facing removal, prefer status transitions such as `cancelled`, `archived`, or a future approved soft-delete field.

Issue 008 confirms this rule for tasks: task cancellation is a status transition, and no task `DELETE` route is approved.

## Agent Access Rules

AI agents must be treated as untrusted operators with limited scopes.

Agents must not:

- access the database directly
- receive raw production database credentials
- bypass Syrantis API authorization
- send emails directly
- approve their own generated actions
- execute destructive actions without an approved workflow

Future AI agents must interact through approved Syrantis API endpoints or approved internal service interfaces with explicit scopes.

The expected future pattern is:

- agent reads approved input through API
- agent writes a draft, task, recommendation, or ai_run
- agent requests human approval when external action is needed
- human approval triggers the final external action
- the system, not the agent, sends emails or performs external side effects

## PR Rules

- One scoped issue per PR.
- Every PR links its spec and implementation report.
- PR descriptions must include files changed, commands run, checks performed, risks, rollback notes, and business value.
- Agents may prepare commits and draft PRs only when explicitly asked.
- Agents do not merge.
- Agents do not deploy after merge.
- Human review is required before production changes.

## Documentation Rules

- Every implementation issue must have a spec in `docs/specs/`.
- Every implementation issue must have an implementation report in `docs/implementation/`.
- Architecture state is recorded in `docs/architecture/current-state.md`.
- Operational procedures live in `docs/runbooks/`.
- Ideas outside the 90-day wedge go to `docs/future/`.
- Docs must be updated in the same PR as behavior or operational changes.
- Durable architectural decisions must be added to `DECISIONS.md`.

## Protected Scope

Until at least 5 paying recurring clients, do not build:

- SaaS platform
- marketplace
- e-commerce acquisition product
- chatbot
- WhatsApp or SMS
- Gmail or Outlook OAuth
- generic CRM
- complex workflow engine such as Temporal or Mistral Workflows
- multi-tenant client dashboard beyond minimal controlled scope

The wedge is plumbers and heating contractors with Lead Response and Devis Relance.
