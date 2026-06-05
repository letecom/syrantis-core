# 023AN Response Profiles / Profils de réponse v1

## Goal

Add client-configurable response profiles to `/config` so future Draft Generation v2 can choose the
right team voice by context. Client-facing UI uses `Profils de réponse`; the feature does not use
or expose persona language in the client app.

023AN does not modify draft generation, provider behavior, worker jobs, Gmail/App Script, Google
Sheets, Resend, direct send, or routing selection.

## Storage Decision

Response profiles are stored in a new table, `workspace_response_profiles`, rather than inside
`workspace_context_profiles.context_json`.

Rationale:

- Draft Generation v2 needs clean lookup, indexes, and future FK-friendly references.
- The active default profile is enforced by a database partial unique index.
- Profile order and active filtering are queryable.
- RLS and FORCE RLS apply at row level.
- The workspace context JSON blob stays bounded and reviewable.

## Database Contract

`workspace_response_profiles` is workspace-scoped and includes:

- identity fields: `name`, `sender_name`, `role_label`, `description`
- behavior fields: `tone`, `style_notes`, `authority_level`
- bounded JSONB string arrays: categories, rules, escalation rules, forbidden claims
- lifecycle fields: `is_default`, `is_active`, `sort_order`, timestamps

Database invariants:

- tone is one of `professional`, `friendly`, `formal`, `empathetic`, `concise`, `direct`
- authority is one of `standard`, `manager`, `direction`
- JSONB rule/category fields must be arrays
- `sort_order >= 0`
- required names are non-empty after trim
- one active default per workspace is enforced by
  `workspace_response_profiles_one_active_default_idx`
- `updated_at` is maintained by `syrantis_set_updated_at`
- RLS and FORCE RLS use the existing `tenant_isolation_*` policy pattern
- runtime role `syrantis_app` receives only `SELECT`, `INSERT`, and `UPDATE`

No DELETE grant is added. Deactivation is a soft update.

## Client API

Dedicated client-safe routes:

```txt
GET    /api/client/config/response-profiles
POST   /api/client/config/response-profiles
PUT    /api/client/config/response-profiles/:id
DELETE /api/client/config/response-profiles/:id
```

Routes are protected by `tenantGuard`. Allowed roles are `client`, `admin`, and `founder`;
`operator` is blocked; unauthenticated requests return `401`.

The API derives `workspaceId` only from trusted session context and rejects workspace or tenant
identity in headers, query strings, or body. Cross-workspace or missing profile mutations return
`404`, not `403`.

The client DTO exposes only:

- `id`
- `name`
- `senderName`
- `roleLabel`
- `description`
- `tone`
- `styleNotes`
- `authorityLevel`
- `appliesToCategories`
- `specificRules`
- `escalationRules`
- `forbiddenClaims`
- `isDefault`
- `isActive`
- `sortOrder`
- `createdAt`
- `updatedAt`

Forbidden body fields include workspace identity, prompt/output fields, provider/model IDs, API
keys, tokens, secrets, raw/metadata/config/settings fields, and password fields.

`PUT` is a full-object update for editable profile fields. `POST` accepts the same fields with
optional `description`, `styleNotes`, `isDefault`, and `sortOrder`.

## Behavior

List:

- returns active profiles only
- ordered by `sortOrder asc`, then `createdAt asc`
- never returns workspace identifiers or provider/generation internals

Create:

- inserts an active profile in the current workspace
- if `isDefault=true`, clears other active defaults first
- if no active default exists, the new profile becomes default automatically
- logs only safe metadata: `profileId`, `changedFields`, `source`, `action`

Update:

- fetches by `id` and trusted `workspaceId`
- `isDefault=true` clears other active defaults before updating
- rejecting all-active-non-default state returns `409`
- logs only safe changed field names

Delete:

- route uses `DELETE`, but the database operation is `UPDATE is_active=false`
- default profile deactivation returns `409`
- last active profile deactivation returns `409`
- normal list no longer returns deactivated profiles

## Frontend

`/config` remains inside `ClientShell` and keeps the 023AM response policy editor. A separate
`Profils de réponse` section adds:

- compact profile list
- selected/new profile editor
- `Ajouter un profil`
- default badge
- French tone and authority labels
- field-adjacent validation errors
- loading, error, empty, save success, and deactivation feedback
- disabled default deactivation

The UI does not use browser storage, raw JSON/debug panels, admin routes, provider terms, prompt
preview, fake Inbox profile display, or Draft Generation v2 routing signals.

## Out of Scope

023AN does not add Draft Generation v2, provider/OpenRouter calls, workers, Gmail/App Script,
Google Sheets, Resend, direct send, public signup, prompt preview, AI test generation, real routing,
assigned users, services/offers packs, advanced example reply packs, Caddy, env, systemd, deploy, or
hard delete behavior.
