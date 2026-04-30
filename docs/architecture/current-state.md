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

