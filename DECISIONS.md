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

