# 023P Company Context Pack

## Summary

Implemented a workspace-scoped company context profile for future use by scoring and draft generation.

## Backend

- Added `workspace_context_profiles` migration `0020_workspace_context_profiles.sql`.
- Added Drizzle schema export for `workspaceContextProfiles`.
- Added schema verification invariants for RLS, the unique workspace index, and the DB-owned `updated_at` trigger.
- Added strict shared DTO contracts in `packages/shared/src/contracts/workspace-context.ts`.
- Added `GET /api/workspace-context` and `PUT /api/workspace-context`.
- Required session-cookie auth, tenant guard, and admin/founder role.
- Rejected workspace/tenant injection through body, query, and headers.
- Stored `companyName`, `sector`, `language`, and `timezone` in strong columns.
- Stored the remaining structured context in `context_json`.
- Returned safe DTOs with `profileId`, but no `workspaceId`, `createdBy`, or `updatedBy`.
- Wrote safe create/update activity logs with top-level changed field names only.

## Deliberate Non-Changes

- No `apps/web` changes.
- No scoring or draft generation consumption.
- No worker runtime changes.
- No Google Sheets changes.
- No provider calls.
- No public or API-key route.
- No versioning, history, RAG, embeddings, uploads, crawler, Gmail OAuth, or Gmail draft behavior.

## Documentation

- Added the 023P spec.
- Added this implementation report.
- Added `docs/runbooks/company-context-pack.md`.
- Updated README current state.
- Added a DECISIONS entry for one active in-place context profile per workspace.

## Validation

Targeted validation commands for this issue:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- workspace-context tenant auth activity-logs scoring-status public-leads lead-score-pushback worker
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
```

## Risk And Rollback

Risk is limited to the new session-only workspace context route and one new tenant-scoped table.

Rollback is a code revert plus dropping `workspace_context_profiles` if the migration was applied in a non-production environment. Production database rollback requires the normal human-approved database rollback procedure.
