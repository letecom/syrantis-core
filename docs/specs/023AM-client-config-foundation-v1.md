# 023AM Client Config Foundation v1

## Goal

Replace the live client `/config` placeholder with a real client-safe response behavior
configuration page. The page lets client users view and edit the response policy that is already
stored under `workspace_context_profiles.context_json.responsePolicy`.

## API Boundary

023AM adds a dedicated client-safe API surface:

- `GET /api/client/config/response-policy`
- `PUT /api/client/config/response-policy`

The existing admin/founder response policy validation surface remains separate:

- `GET /api/client/response-policy`
- `PUT /api/client/response-policy`
- `/app/response-policy`

The live client UI must not call the admin response policy route.

## Access

The dedicated client config route is protected by `tenantGuard`.

Allowed roles:

- `client`
- `admin`
- `founder`

`operator` remains blocked. Unauthenticated requests return `401`. The route derives
`workspaceId` only from trusted server context and rejects client-provided workspace or tenant
identity in query strings, headers, or request bodies.

## Client-Safe DTO

The client route exposes only a whitelisted DTO:

- `configured`
- `language`
- `tone`
- `customToneNotes`
- `defaultGreeting`
- `defaultClosing`
- `signature`
- `structureLines`
- `businessRules`
- `forbiddenClaims`
- `escalationRules`
- `offerNotes`
- `catalogSummary`
- `exampleReplies: { label, body }[]`
- `updatedAt`

Forbidden fields include workspace identifiers, raw JSON, raw metadata, prompts, outputs, provider
identifiers, API keys, tokens, secrets, debug fields, activity-log metadata, and admin-only DTO
fields such as `status`, `responseStructure`, or `bodyText`.

`PUT` is a full-object update. Unknown fields are rejected through strict Zod validation. Field
limits remain bounded:

- text fields have explicit max lengths
- arrays have max sizes
- array items have max lengths
- `exampleReplies` is capped at 5

If a workspace has no stored response policy, `GET` returns safe defaults through the existing
service. First valid `PUT` creates or updates the stored policy through the existing repository.

## Frontend

`/config` renders inside the existing `ClientShell` only. It must not import `AdminShell`, render
admin navigation, or call `/api/client/response-policy`.

The UI is French-first and includes:

- page title and explanatory copy
- status/completeness card
- identity and tone fields
- greeting, closing, and signature fields
- response structure lines
- business rules
- forbidden claims
- escalation rules
- offer notes and catalog summary
- up to 5 example replies

The form supports loading, error, empty/default state, dirty state, disabled save when unchanged,
reset, save success, and field-adjacent validation errors. It does not use browser storage and does
not render raw JSON or debug panels.

## Out of Scope

023AM does not add migrations, provider calls, worker jobs, draft generation behavior, direct send,
Gmail/App Script/googleapis changes, Google Sheets changes, Resend changes, public signup, full user
management, personas, response profiles, a services/offers structured pack, file upload, pricing
tables, prompt preview, AI test generation, or Draft Generation v2.

Future compatible inputs are intentionally left as plain bounded policy fields for:

- 023AN Response Profiles / Personas v1
- 023AO Services / Offers Config Pack
- 023AP Example Replies Pack
- 023AQ Draft Generation v2

023AM only edits the response behavior configuration surface. It does not change draft generation.
