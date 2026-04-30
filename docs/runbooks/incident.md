# Runbook - Incident

## Purpose

Provide a first-response process for production incidents, security concerns, and accidental secret exposure.

## Incident Types

- production outage
- failed deploy
- data corruption
- accidental secret exposure
- unauthorized access suspicion
- broken Lead Response or Devis Relance workflow after launch

## Immediate Rules

- Preserve evidence.
- Do not hide or rewrite incident facts.
- Do not paste secrets into issues, PRs, chat, or docs.
- Stop autonomous actions if any exist.
- Escalate to Founder Governor.

## First Response Checklist

1. Identify start time and affected surface.
2. Stop or isolate affected service if needed.
3. Capture non-secret logs and symptoms.
4. Check latest deploy or config change.
5. Decide whether rollback is required.
6. If secrets were exposed, rotate them outside Git.
7. Record the incident report.

## Secret Exposure

If a secret appears in Git, terminal output, logs, docs, screenshots, issues, PRs, or implementation reports:

- treat it as compromised
- remove exposure where possible
- rotate the secret
- review access logs
- document the event without recording the secret value

## Incident Report Template

```md
# Incident - YYYY-MM-DD - Title

## Summary

## Impact

## Timeline

## Root Cause

## Actions Taken

## Secrets Involved

State whether secrets were involved. Do not include secret values.

## Follow-Up
```

