# 023AN Response Profiles / Profils de réponse v1 Implementation

## Summary

Implemented client-configurable response profiles in `/config` with a dedicated table, client-safe
API routes, shared Zod contracts, and a French `Profils de réponse` UI section. Profiles are not
used by draft generation yet.

## Files Changed

- `packages/db/migrations/0024_workspace_response_profiles.sql`
- `packages/db/src/schema.ts`
- `packages/db/src/verify/*`
- `packages/shared/src/contracts/client-response-profiles.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/repositories/client-response-profiles.ts`
- `apps/api/src/services/client-response-profiles.ts`
- `apps/api/src/routes/client/response-profiles.ts`
- `apps/api/src/routes/client/index.ts`
- `apps/api/src/tests/client-response-profiles.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/ClientConfigPage.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023AN-response-profiles-v1.md`
- `docs/implementation/023AN-response-profiles-v1.md`
- `docs/runbooks/response-profiles-v1.md`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Backend

Added `workspace_response_profiles` with RLS, FORCE RLS, timestamp trigger, bounded checks, active
list/order indexes, and a partial unique default index. Runtime grants are limited to `SELECT`,
`INSERT`, and `UPDATE`; no DELETE grant is present.

The client API is mounted at `/api/client/config/response-profiles` and supports list, create,
full-object update, and soft deactivation. Routes use `tenantGuard`, allow `client`, `admin`, and
`founder`, block `operator`, reject client-provided workspace identity, and return `404` for
missing/cross-workspace profile mutations.

Repository behavior keeps one active default per workspace, auto-defaults the first active profile,
rejects removing the last active/default state, and creates safe activity logs with IDs and changed
field names only.

## Frontend

`/config` now keeps the 023AM response policy editor and adds a separate `Profils de réponse`
section. The section supports empty state, list selection, create, edit, set default, soft
deactivate, field validation, success/error feedback, and safe French labels for tone/authority.

The frontend calls only:

- `GET /api/client/config/response-profiles`
- `POST /api/client/config/response-profiles`
- `PUT /api/client/config/response-profiles/:id`
- `DELETE /api/client/config/response-profiles/:id`

It does not call admin routes, store profiles in browser storage, render raw JSON/debug panels, or
show profile usage in `/inbox`.

## Validation And Safety

Added schema verifier invariants for response profile columns, checks, indexes, RLS/FORCE RLS,
policy, trigger, and runtime privileges.

API tests cover auth, role access, first/default profile behavior, default switching, update, soft
deactivation, default/last active conflicts, cross-workspace invisibility, forbidden fields, query
and header tenant rejection, length/array limits, safe DTO exposure, and no provider/worker imports.

Web tests cover `/config` rendering, profile route usage, empty/create flow, default badge, edit,
set-default payloads, non-default deactivation, default deactivation blocking, validation errors,
no admin route usage, no unsafe field rendering, and existing 023AM response policy behavior.

## Future Compatibility

023AN intentionally creates the data model and client configuration surface only. Future 023AQ Draft
Generation v2 may consume these profiles through a separately approved read path and selection
logic. No provider, worker, prompt, routing, Inbox display, or draft generation behavior changes in
this issue.

## Rollback

Rollback removes the 0024 migration, schema/verifier entries, shared profile contract/activity enum
entries, response profile repository/service/routes/tests, web API helpers/UI/tests, and 023AN docs.
Existing 023AM response policy config and draft generation remain independent.
