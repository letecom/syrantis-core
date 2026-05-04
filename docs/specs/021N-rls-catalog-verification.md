# 021N - DB-Level RLS Catalog Verification

## Goal

Extend `pnpm --filter @syrantis/db verify-schema` so it verifies the real PostgreSQL catalog for tenant isolation proof, not only migration-file or structural-object proof.

The command must continue to report:

- `SCHEMA_VERIFY_OK` on success
- `SCHEMA_VERIFY_DRIFT` on catalog drift
- `checked`, `passed`, and `failed` counters
- exit `0` on pass
- exit `1` on drift
- exit `2` on runtime, configuration, or connectivity errors

## Scope

Add RLS catalog invariants under `packages/db/src/verify/` for existing tenant tables that already have RLS migrations.

For each registered tenant table, verify through PostgreSQL catalog metadata only:

- row-level security is enabled
- force row-level security is enabled
- the expected tenant isolation policy exists

The existing 0015 and 0016 structural invariants remain in the same registry and command.

## Tenant Tables

The verifier registers these existing tenant tables and policy names from migrations:

- `organizations` / `tenant_isolation_organizations`
- `contacts` / `tenant_isolation_contacts`
- `leads` / `tenant_isolation_leads`
- `tasks` / `tenant_isolation_tasks`
- `approvals` / `tenant_isolation_approvals`
- `activity_logs` / `tenant_isolation_activity_logs`
- `external_connections` / `tenant_isolation_external_connections`
- `external_object_mappings` / `tenant_isolation_external_object_mappings`
- `integration_events` / `tenant_isolation_integration_events`
- `workspace_api_keys` / `tenant_isolation_workspace_api_keys`
- `drafts` / `tenant_isolation_drafts`
- `email_sends` / `tenant_isolation_email_sends`
- `background_jobs` / `tenant_isolation_background_jobs`
- `ai_runs` / `tenant_isolation_ai_runs`
- `lead_scores` / `tenant_isolation_lead_scores`

## Catalog Sources

RLS table flags are read from `pg_class` joined to `pg_namespace`.

Policy existence is read from `pg_policy` joined to `pg_class` and `pg_namespace`.

The verifier must not read tenant table rows, parse policy expressions, verify grants, or modify database state.

## Anti-Scope

- No migration
- No DDL or auto-repair
- No API routes
- No worker changes
- No provider behavior
- No business row reads
- No tenant policy rewriting
- No secret output

## Tests

Unit tests cover:

- RLS invariant registry entries for expected tenant tables
- pass when RLS, FORCE RLS, and expected policies exist
- drift when RLS is disabled
- drift when FORCE RLS is disabled
- drift when expected policy is missing
- drift when the registered table is missing
- existing 0015 and 0016 invariants
- catalog-only SQL usage
- result counters including RLS checks
- JSON output compatibility
