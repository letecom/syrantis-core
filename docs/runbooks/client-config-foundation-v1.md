# Client Config Foundation v1 Runbook

## Purpose

Validate and operate the 023AM client response behavior configuration surface.

## Routes

Client-safe API:

- `GET /api/client/config/response-policy`
- `PUT /api/client/config/response-policy`

Live client page:

- `/config`

Existing admin/founder validation surface remains separate:

- `GET /api/client/response-policy`
- `PUT /api/client/response-policy`
- `/app/response-policy`

The client page must never call the admin route.

## Manual Validation

1. Log in as a provisioned client user on the client app.
2. Open `/config`.
3. Confirm the page renders inside `ClientShell` with only Dashboard, Inbox, and Config navigation.
4. Confirm no AdminShell, admin navigation, raw JSON, debug panel, workspace identifier, provider
   identifier, prompt/output, token, secret, or API key text is visible.
5. Edit a field and confirm the save button becomes enabled.
6. Use reset and confirm the loaded values are restored.
7. Edit again and save.
8. Confirm the request goes to `PUT /api/client/config/response-policy`.
9. Confirm `/inbox` still works after saving.

## Expected Behavior

- Unauthenticated API requests return `401`.
- `client`, `admin`, and `founder` may use the dedicated client config route.
- `operator` receives `403`.
- Client-provided workspace or tenant identity is rejected.
- `PUT` is full-object and strict.
- If no policy exists, `GET` returns safe defaults.
- First valid `PUT` creates or updates the existing workspace context profile response policy.

## Incident Checks

If unsafe data appears in the UI or response:

1. Stop using the route for client validation.
2. Inspect the dedicated DTO allowlist in `packages/shared/src/contracts/client-config-response-policy.ts`.
3. Confirm the live page calls only `/api/client/config/response-policy`.
4. Confirm no admin response policy DTO is passed through to the client page.
5. If any secret value was exposed, follow `docs/runbooks/incident.md`.

## Out of Scope

This runbook does not cover personas, services/offers packs, example reply packs beyond the bounded
list, Draft Generation v2, Gmail/App Script, Google Sheets, Resend, provider calls, worker behavior,
direct send, public signup, deployment, production env, Caddy, or systemd changes.
