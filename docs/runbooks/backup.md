# Runbook - Backup

## Purpose

Define the baseline expectations for future Syrantis Core backups.

Issue 000 does not create backup scripts or production services.

## Backup Scope

Future backups should cover:

- PostgreSQL data
- uploaded or generated files if introduced
- production configuration inventory without secret values
- deployment commit reference

Secrets are not copied into reports or Git.

## Target Locations

- Runtime data belongs to future Docker volumes named `syrantis_core_*`.
- Reports may be stored under `/opt/syrantis/reports`.
- Backup scripts may live under `/opt/syrantis/scripts` after an approved infra issue.

## Pre-Backup Checklist

- Confirm production service names use `syrantis-core-*`.
- Confirm volume names use `syrantis_core_*`.
- Confirm env remains at `/opt/syrantis/env/core.prod.env`.
- Confirm no secret values are printed.

## Validation

- Backup file exists.
- Backup size is plausible.
- Restore procedure has been tested in a non-production context.
- Backup report records timestamp, source, destination, and commit reference.

