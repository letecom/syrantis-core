# Runbook - Server Bootstrap

## Purpose

Prepare the server operating layout for Syrantis Core without deploying the application.

## Target Server

- Provider: Hetzner
- OS: Ubuntu 24.04 LTS
- Root path: `/opt/syrantis`

## Target Users

- `root`: administration only
- `syrantis`: production runtime user
- `syrantis-ai`: development, agents, and Codex workspace user

## Target Directories

- `/opt/syrantis/repos`
- `/opt/syrantis/repos/syrantis-core`
- `/opt/syrantis/agent-workspaces`
- `/opt/syrantis/agent-workspaces/codex/syrantis-core`
- `/opt/syrantis/env`
- `/opt/syrantis/scripts`
- `/opt/syrantis/reports`

## Rules

- Production runtime uses `/opt/syrantis/repos/syrantis-core`.
- Development and agents use `/opt/syrantis/agent-workspaces`.
- Codex is accessed via VSCode Remote SSH.
- Codex is not installed as the primary server tool.
- `syrantis` may have Docker access.
- `syrantis-ai` should not require Docker access.
- Agents do not deploy.
- Agents do not touch `/opt/syrantis/env/core.prod.env`.

## Bootstrap Checklist

- Confirm OS version.
- Create required users.
- Create `/opt/syrantis` directory layout.
- Set ownership so production and agent workspaces remain separated.
- Install baseline system packages only when needed.
- Install Docker for production runtime user only when the infra issue authorizes it.
- Clone production repo into `/opt/syrantis/repos/syrantis-core` only after Git remote is ready.
- Clone development workspace into `/opt/syrantis/agent-workspaces/codex/syrantis-core`.
- Create `/opt/syrantis/env/core.prod.env` manually outside Git only when production runtime exists.
- Confirm no `.env` file exists in the repo.

## Validation

- `syrantis-ai` can access the development workspace.
- `syrantis` can access the production runtime repo.
- Production env is outside Git.
- Agents cannot accidentally modify production runtime paths.

