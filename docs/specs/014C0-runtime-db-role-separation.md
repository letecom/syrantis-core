# Issue 014C0 Spec: Runtime DB Role Separation

## Objective

Prepare future PostgreSQL RLS activation by separating the API runtime database role from the current admin/migration role.

The runtime role is `syrantis_app`. It must be able to run the existing API workload but must not be a superuser, must not bypass RLS, and must not own application tables.

## Context

Production preflight found:

- `current_user = syrantis`
- `session_user = syrantis`
- `syrantis.rolsuper = true`
- `syrantis.rolbypassrls = true`
- current public tables are owned by `syrantis`

RLS must not be enabled while the API connects as this role. A superuser or role with `BYPASSRLS` bypasses RLS, even when `FORCE ROW LEVEL SECURITY` is later considered.

## Why 014C Is Blocked

014C RLS activation is blocked until runtime traffic uses a non-owner, non-superuser, non-`BYPASSRLS` role. Without this separation, RLS policies would provide a false sense of isolation.

## Role Model

- `syrantis`: existing admin and migration role.
- `syrantis_app`: runtime API role.

`syrantis_app` requirements:

- `LOGIN`
- `NOSUPERUSER`
- `NOBYPASSRLS`
- `NOCREATEDB`
- `NOCREATEROLE`
- not owner of any application table

## Grants Model

The runtime role receives:

- database connect privilege on `syrantis`
- schema usage on `public`
- read access to `users` and `workspaces`
- read, insert, update, delete access to `sessions`
- read, insert, update access to `organizations`, `contacts`, `leads`, `tasks`, `approvals`, and `activity_logs`
- usage and select on sequences in `public`
- future default table and sequence privileges for objects created by `syrantis` in `public`

The migration does not transfer table ownership.

If `syrantis_app` already exists, the migration normalizes the role attributes and fails fast if the role owns public tables.

## Env Model

Runtime API code continues to use `DATABASE_URL`.

Migration tooling uses:

```text
MIGRATION_DATABASE_URL ?? DATABASE_URL
```

This allows production to set:

- `DATABASE_URL` to `syrantis_app`
- `MIGRATION_DATABASE_URL` to the existing `syrantis` admin/migration role

The fallback preserves local and development compatibility.

## Manual Password Setup Outside Repo

The migration creates `syrantis_app` without a password. An operator must set the password manually outside the repository after the migration runs:

```psql
\password syrantis_app
```

Then the operator manually updates `/opt/syrantis/env/core.prod.env`:

- set `DATABASE_URL` to `syrantis_app` credentials
- add `MIGRATION_DATABASE_URL` using `syrantis` admin credentials

No secret values are stored in docs or code.

## Validation Plan

- Run the migration with the admin/migration role.
- Confirm `syrantis_app` exists and has `NOSUPERUSER` and `NOBYPASSRLS`.
- Confirm `syrantis_app` does not own public tables.
- Switch API `DATABASE_URL` manually after password setup.
- Run API health and smoke checks.
- Confirm migrations still work through `MIGRATION_DATABASE_URL`.

## Rollback Strategy

If the API fails after the `DATABASE_URL` switch:

- restore `DATABASE_URL` to the previous `syrantis` admin credentials in `/opt/syrantis/env/core.prod.env`
- restart the API

No schema or data rollback is required for this issue. The `syrantis_app` role and grants can remain unused until corrected.

## Acceptance Criteria

- Migration creates `syrantis_app` if missing.
- Existing `syrantis_app` is normalized to the required runtime role attributes.
- Migration fails if `syrantis_app` owns public tables.
- Migration grants required runtime privileges.
- Migration defines no password.
- Migration is registered in Drizzle metadata.
- Migration tooling prefers `MIGRATION_DATABASE_URL ?? DATABASE_URL`.
- Runtime API DB client remains `DATABASE_URL` based.
- No RLS activation or policies are added.
- No auth, tenant guard, withWorkspaceDb, or business route/service/repository logic changes are made.
