# Runbook - Deploy

## Purpose

Describe the future production deploy process for Syrantis Core.

Issue 000 does not deploy anything.

## Required Human Approval

Deploy requires explicit Founder Governor approval.

Agents must not deploy, merge, or modify production env.

## Future Runtime Conventions

- Compose project name: `syrantis-core`
- Compose services: `syrantis-core-*`
- Compose volumes: `syrantis_core_*`
- Production env: `/opt/syrantis/env/core.prod.env`
- Production repo: `/opt/syrantis/repos/syrantis-core`

## Pre-Deploy Checklist

- PR merged by a human.
- Implementation report completed.
- Rollback notes reviewed.
- Required checks passed.
- Production env requirements documented without secret values.
- Backup decision made for any data-impacting change.

## Future Deploy Outline

1. SSH to the server as the appropriate human operator.
2. Switch to the production runtime path.
3. Fetch and checkout the approved release commit.
4. Confirm env file exists outside Git.
5. Pull/build runtime images according to the approved infra issue.
6. Run migrations only if the issue explicitly requires them.
7. Start or reload services.
8. Verify health checks.
9. Record deploy outcome in `/opt/syrantis/reports`.

## Rollback Outline

1. Identify previous known-good commit.
2. Restore previous runtime version.
3. Restore database from backup if required.
4. Restart services.
5. Verify health.
6. Record incident or rollback notes.

