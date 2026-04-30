# Spec 000 - Server Git Build OS Foundation

## Objective

Create the documentation and governance foundation for Syrantis Core before any application work begins.

This issue prepares the repo for server operations, Git discipline, agent governance, implementation tracking, and future runbooks.

## Non-Goals

This issue does not create:

- application code
- React app
- Hono API
- Drizzle schema
- Docker Compose runtime config
- package manager files
- `package.json`
- `.env`
- secrets
- business workflows

## Target Stack Context

The future target stack is:

- React + Vite
- Hono + Zod
- PostgreSQL + Drizzle
- pg-boss
- Resend
- Docker Compose
- Caddy
- pnpm monorepo

These are documented as direction only. They are not initialized in Issue 000.

## Server Context

Target server root: `/opt/syrantis`.

- `/opt/syrantis/repos`: production runtime repos
- `/opt/syrantis/repos/syrantis-core`: production runtime repo
- `/opt/syrantis/agent-workspaces`: agent and development workspaces
- `/opt/syrantis/agent-workspaces/codex/syrantis-core`: Codex development workspace
- `/opt/syrantis/env/core.prod.env`: production runtime env file
- `/opt/syrantis/scripts`: server scripts
- `/opt/syrantis/reports`: server reports

Codex is used from VSCode Remote SSH and is not installed as the primary server tool.

## Business Wedge

The first 90 days are constrained to plumbers and heating contractors.

Allowed wedge:

- Lead Response
- Devis Relance
- human-approved drafts
- no autonomous outbound action

Anything outside the wedge must be recorded in `docs/future/`.

## Agent Requirements

Document roles:

- Founder Governor
- Architecte Principal
- Codex
- OpenCode
- OpenClaw
- ClawSweeper/SyrantisSweeper

Document bans:

- no merge
- no deploy
- no secrets
- no protected files
- no production env access
- no production runtime repo edits

## Documentation Requirements

Create:

- `README.md`
- `AGENTS.md`
- `DECISIONS.md`
- `DAILY.md`
- `docs/specs/000-server-git-build-os-foundation.md`
- `docs/implementation/000-server-git-build-os-foundation.md`
- `docs/architecture/current-state.md`
- `docs/runbooks/server-bootstrap.md`
- `docs/runbooks/deploy.md`
- `docs/runbooks/backup.md`
- `docs/runbooks/restore.md`
- `docs/runbooks/incident.md`
- `docs/future/README.md`

## Definition Of Done

- Governance docs exist.
- Root `AGENTS.md` exists.
- Every issue documentation convention is stated.
- Implementation report template exists.
- Server paths are documented.
- Docker naming conventions are documented.
- Env conventions are documented.
- Secrets rules are documented.
- PR rules are documented.
- Docs rules are documented.
- Runbooks exist.
- Future scope is constrained.
- No application scaffold is created.
- No secrets exist.
- No `.env` exists.
- No `package.json` exists.

