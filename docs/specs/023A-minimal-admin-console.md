# 023A - Minimal Admin Console

## Objective

Create the first minimal Syrantis Admin UI without changing Syrantis into a CRM, analytics product,
or frontend-first SaaS.

The UI proves:

- `apps/web` can safely participate in the monorepo.
- Browser login works through existing opaque session-cookie auth.
- Session restore survives refresh through the backend auth route.
- Protected admin navigation works.
- Logout clears the backend session and frontend query state.
- Operators can inspect the existing read-only pushback status DTO without SQL or curl.

## Scope

Create or update:

- `apps/web`
- repo-scoped `syrantis-admin-ui` skill
- 023A spec and implementation report
- minimal README current-state notes

Routes:

- `/`
- `/login`
- `/app`
- `/app/pushback`
- not found

Backend routes consumed:

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /api/email-sends/:id/pushback-status`
- `GET /api/drafts/:id/pushback-status`

## Admin UI Behavior

Login:

- email and password inputs
- validation before submit
- generic invalid-credentials message
- calls existing auth route with `credentials: "include"`
- redirects to `/app` after success

Session restore:

- calls `/auth/me`
- redirects unauthenticated users to `/login`
- never stores tokens
- never reads cookies directly

Protected shell:

- product label: Syrantis Admin
- current user display from safe auth fields only
- logout button
- navigation for Dashboard and Pushback only

Dashboard:

- short internal-console description
- link to Pushback Lookup
- no metrics, charts, fake counts, or mock business data

Pushback Lookup:

- select email send ID or draft ID
- UUID input and validation
- read-only result card
- loading, empty, and error states
- renders only explicit safe status fields
- no replay button
- no POST calls

## API Client Requirements

- one central production API client
- every request uses `credentials: "include"`
- no auth header
- no tenant identifiers from the browser
- no token storage
- no request/response body logging
- generic errors
- Zod validation for auth and pushback responses

## Data Safety

The UI may render safe pushback state such as target type/id, send status, delivery status,
pushback status, latest source/event, read-only replay eligibility, diagnostic trace id, compact
error fields, counts, and timestamps.

The UI must not render raw provider payloads, raw metadata, email content, contact details, tenant
identifiers, credential material, full external document identifiers, or AI internals.

## Non-Goals

023A does not add:

- replay button or replay POST call
- email send table
- leads, drafts, tasks, activity logs, settings, or user management screens
- Google setup UI
- metrics or charts
- exports
- realtime behavior
- backend business endpoints
- migrations
- Docker, Caddy, deployment, or production env changes

## Tests

Frontend tests must cover:

- login form rendering and validation
- login endpoint and credentialed request behavior
- successful login redirect
- failed login generic error
- protected route redirect
- authenticated shell rendering
- logout route and redirect
- pushback UUID validation
- email-send and draft pushback route calls
- safe result rendering
- unsafe response fields ignored
- API client credentialed requests
