# Syrantis Core — Codex Bootstrap Context

## Mission

Syrantis Core is not a SaaS platform yet.
It is a solo-founder B2B delivery engine designed to sell perceived custom AI systems while internally delivering modular, semi-standard workflows.

The 90-day wedge is:
- local French B2B
- plombiers / chauffagistes first
- Lead Response + Devis Relance
- human-approved drafts
- no autonomous outbound action
- no full custom architecture per client

The economic goal is:
- sell diagnostics
- convert to setup fees
- add MRR
- reduce setup time per client
- compound templates, workflows, prompts, objections, proofs, and delivery playbooks

## Current server architecture

Server provider: Hetzner
OS: Ubuntu 24.04 LTS

Users:
- root: administration only
- syrantis: production runtime user
- syrantis-ai: development / agents / Codex workspace user

Paths:
- prod repo: /opt/syrantis/repos/syrantis-core
- dev repo: /opt/syrantis/agent-workspaces/codex/syrantis-core
- prod env: /opt/syrantis/env/core.prod.env
- server scripts: /opt/syrantis/scripts
- server reports: /opt/syrantis/reports

Rules:
- Codex is used from local VSCode Remote SSH.
- Codex is not installed as the primary server tool.
- Development happens only in the dev repo.
- Production runtime uses the prod repo.
- syrantis has Docker access.
- syrantis-ai does not have Docker access.
- agents never read or modify prod env.
- agents never deploy.

## Target technical stack

Frontend:
- React + Vite
- TypeScript
- Tailwind
- shadcn/ui later, only when useful

API:
- Hono
- Zod shared contracts
- no tRPC in v0

Database:
- PostgreSQL
- Drizzle ORM
- migrations generated and versioned
- no drizzle push in prod

Jobs:
- pg-boss
- no Redis in v0
- no BullMQ in v0

Email:
- Resend first
- Brevo/Postmark adapters later
- no custom SMTP

Infra:
- Docker Compose
- Caddy
- Uptime Kuma later
- no Kubernetes
- no microservices
- no self-hosted LLM

AI:
- API-based LLMs
- bounded skills
- no autonomous multi-agent production workflows
- all outbound emails require approval in v0

## Agent governance

Roles:
- Founder Governor: final decision, scope, pricing, sales, approval
- Architecte Principal: validates architecture and sequencing
- Codex: implementation of scoped issues
- OpenCode: debug, targeted tests, refactors
- OpenClaw: planning, specs, review
- ClawSweeper/SyrantisSweeper: review-only guardrail initially

Hard bans:
- no secrets in repo
- no .env files in repo
- no autonomous deploy
- no direct work in /opt/syrantis/repos/syrantis-core
- no touching production env
- no changing auth/tenant/security rules without explicit human approval
- no adding framework abstractions without business reason
- no building features outside the 90-day wedge

## Business wedge lock

Until at least 5 paying recurring clients:
- no SaaS platform
- no marketplace
- no e-commerce acquisition product
- no chatbot
- no WhatsApp/SMS
- no Gmail/Outlook OAuth
- no generic CRM
- no Mistral Workflows / Temporal / complex workflow engine
- no multi-tenant client dashboard beyond minimal controlled scope

Anything outside this goes into:
docs/future/

## Documentation contract

Every implementation issue must have:
- docs/specs/XXX-name.md
- docs/implementation/XXX-name.md

Each implementation report must include:
- objective
- files created/modified
- commands run
- checks performed
- risks
- next steps
- rollback notes
- business value

## Current Issue

Issue 000 is documentation and Build OS foundation only.

Allowed:
- README.md
- AGENTS.md
- DECISIONS.md
- DAILY.md
- docs/specs/*
- docs/implementation/*
- docs/architecture/*
- docs/runbooks/*
- docs/future/*

Forbidden in Issue 000:
- package.json
- pnpm-workspace.yaml
- apps/
- packages/
- Docker Compose full config
- .env
- application code
- DB schema
- auth logic
- API routes

Definition of done for Issue 000:
- repo has governance docs
- agents have rules
- runbooks exist
- server paths are documented
- future scope is constrained
- no code/app scaffold created yet
- no secrets
