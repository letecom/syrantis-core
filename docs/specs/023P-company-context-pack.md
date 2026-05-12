# 023P Company Context Pack

## Scope

023P adds one workspace-scoped company context profile for future scoring and draft generation.

The context is stored in a dedicated table, exposed only through admin/founder session routes, and is not consumed by AI scoring, draft generation, pushback, workers, Google Sheets, or any provider call in this issue.

## Data Model

Add `workspace_context_profiles`:

- one active row per workspace
- `workspace_id` references `workspaces(id)` with cascade on workspace deletion
- strong columns for `company_name`, `sector`, `language`, and `timezone`
- structured non-routing context in `context_json`
- nullable `created_by` and `updated_by`
- DB-owned `created_at` and `updated_at`

The table has a unique index on `workspace_id`, RLS enabled and forced, and a tenant isolation policy based on `app.current_workspace_id`. It uses the project `syrantis_set_updated_at` trigger.

## API

Routes:

```txt
GET /api/workspace-context
PUT /api/workspace-context
```

Both routes require:

- session cookie auth
- `tenantGuard`
- admin or founder role
- workspace derived only from session context

The routes reject client tenant/workspace material in body, query, or headers. Workspace API keys and Bearer auth are not accepted.

`GET` returns:

```json
{ "success": true, "data": { "profile": null } }
```

when no profile exists, and otherwise returns a safe profile DTO.

`PUT` validates a strict shared Zod schema, rejects unknown fields, rejects forbidden prompt/provider/secret-like field names, enforces top-level and nested size limits, enforces total serialized context size `<= 50000`, and upserts in-place.

Safe responses do not include `workspaceId`, `createdBy`, or `updatedBy`. Responses include `profileId` for admin debugging and activity-log correlation.

## Activity Logs

`PUT` writes one safe activity log:

- `workspace_context.created` on first insert
- `workspace_context.updated` on update
- `entity_type = workspace_context_profile`
- `entity_id = profileId`
- metadata limited to `profileId`, top-level `changedFields`, and `source = admin_api`

Activity logs must not include company values, context values, old/new values, raw `context_json`, request bodies, workspace IDs, prompts, provider payloads, tokens, API keys, or credentials.

`GET` writes no activity log.

## Explicit Non-Goals

- No UI.
- No scoring changes.
- No draft generation changes.
- No worker changes.
- No Google Sheets changes.
- No provider calls.
- No RAG, embeddings, uploads, crawler, Gmail OAuth, Gmail draft, or CMS behavior.
- No versioning or inactive profile history.
