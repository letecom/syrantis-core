# Runbook - Restore

## Purpose

Define the future restore process for Syrantis Core.

Issue 000 does not restore anything and does not create runtime infrastructure.

## Required Approval

Restore requires Founder Governor approval because it may overwrite production state.

Agents must not perform production restore.

## Restore Inputs

- Approved backup artifact
- Target environment
- Previous and target commit references
- Database restore plan
- Expected downtime window

## Future Restore Outline

1. Stop affected production services.
2. Snapshot current state if possible.
3. Restore database from the approved backup.
4. Restore required file data if applicable.
5. Checkout the matching application commit.
6. Start services.
7. Run health checks.
8. Validate critical user flows.
9. Record restore report in `/opt/syrantis/reports`.

## Validation

- Service health checks pass.
- Database is reachable.
- Critical flows work.
- No secrets were printed to logs or reports.
- Stakeholders are notified of restore completion.

