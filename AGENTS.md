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

