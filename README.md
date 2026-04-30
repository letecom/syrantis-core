# Syrantis Core

Syrantis Core is the foundation repository for a solo-founder B2B delivery engine. It is not an application yet.

The first 90-day wedge is focused on local French B2B, starting with plumbers and heating contractors:

- Lead Response
- Devis Relance
- human-approved drafts
- no autonomous outbound action
- no full custom architecture per client

The business goal is to sell diagnostics, convert setup fees, add MRR, and compound reusable templates, workflows, prompts, objections, proofs, and delivery playbooks.

## Target Stack

This stack is the intended direction, not an initialized application in Issue 000:

- Frontend: React + Vite, TypeScript, Tailwind, shadcn/ui later only when useful
- API: Hono, Zod shared contracts, no tRPC in v0
- Database: PostgreSQL, Drizzle ORM, generated and versioned migrations, no `drizzle push` in production
- Jobs: pg-boss, no Redis or BullMQ in v0
- Email: Resend first, Brevo/Postmark adapters later, no custom SMTP
- Infra: Docker Compose, Caddy, Uptime Kuma later, no Kubernetes
- Monorepo: pnpm monorepo when the application foundation is explicitly approved
- AI: API-based LLMs, bounded skills, no autonomous multi-agent production workflows

## Server Layout

The target server root is `/opt/syrantis`.

- Production runtime repo: `/opt/syrantis/repos/syrantis-core`
- Agent and development workspaces: `/opt/syrantis/agent-workspaces`
- Codex workspace: `/opt/syrantis/agent-workspaces/codex/syrantis-core`
- Production env file: `/opt/syrantis/env/core.prod.env`
- Server scripts: `/opt/syrantis/scripts`
- Server reports: `/opt/syrantis/reports`

Production runtime and agent development are intentionally separated. Agents work in `/opt/syrantis/agent-workspaces`; production runs from `/opt/syrantis/repos`.

Codex is used from VSCode Remote SSH and is not installed as the primary server tool.

## Docker And Env Conventions

Future Docker Compose conventions:

- Compose project name: `syrantis-core`
- Service names prefixed with `syrantis-core-*`
- Volume names prefixed with `syrantis_core_`

Future production env convention:

- Production runtime reads env from `/opt/syrantis/env/core.prod.env`
- No `.env` file is committed to the repo
- Agents never read or modify production env

## Documentation Contract

Every implementation issue must include:

- `docs/specs/XXX-name.md`
- `docs/implementation/XXX-name.md`

The implementation report must include objective, files created or modified, commands run, checks performed, risks, next steps, rollback notes, and business value.

## Issue 000 Definition Of Done

- Governance docs exist
- Agent rules exist in root `AGENTS.md`
- Runbooks exist
- Server paths are documented
- Future scope is constrained
- No application scaffold exists
- No code, DB schema, API routes, package manager files, Docker Compose full config, `.env`, or secrets exist

