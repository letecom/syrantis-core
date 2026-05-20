# 023AK - Client User Provisioning v0

## Purpose

023AK replaces manual database creation or promotion for basic client test accounts with a narrow
admin/founder-only provisioning path.

The feature exists only to create `role = client` users for the trusted workspace attached to the
current admin/founder session. It is not public signup, self-registration, full user management,
role management, workspace switching, invite email, or password reset.

## Scope

- Add `GET /api/admin/client-users`.
- Add `POST /api/admin/client-users`.
- Add `/app/client-users` inside the existing AdminShell.
- Add an AdminShell navigation entry named `Client Users`.
- Generate a cryptographically strong temporary password server-side.
- Hash the temporary password through the existing auth password helper.
- Return the plaintext temporary password only in the successful create response.
- Keep list responses free of temporary passwords, password hashes, tokens, cookies, sessions, raw
  metadata, and workspace identifiers.
- Make `app.syrantis.fr/login` client-facing with `Syrantis`, `Espace client`, and `Se connecter`.
- Preserve admin login wording on `admin.syrantis.fr`.

## Backend Rules

- Routes are protected by `tenantGuard`.
- Only `admin` and `founder` may create or list client users.
- `client` and `operator` are forbidden.
- Unauthenticated requests are unauthorized.
- `workspaceId` comes only from the trusted session context.
- Client-supplied workspace or tenant identity in query, headers, or body is rejected.
- Client-supplied `role` is rejected.
- Created users are always `role = client` and `status = active`.
- Duplicate email returns `409` with a safe error.
- No activity log is written in v0.

## Web Rules

- `/app/client-users` lists only safe client user fields.
- The create form accepts email and optional display name only.
- The temporary password is shown once after create success.
- Dismiss or refresh removes the temporary password from the UI.
- No password is written to localStorage or sessionStorage.
- No signup or create-account link is added to login.
- ClientShell remains limited to:
  - Tableau de bord
  - Boîte de réception
  - Configuration

## Out Of Scope

- public signup
- self-registration
- invite email send
- password reset email
- full User Manager
- roles management UI
- workspace switcher
- full Config UI
- full Dashboard
- Integration Pilot Environment
- direct send
- AI rewrite
- Gmail OAuth
- Apps Script changes
- provider/OpenRouter behavior
- Resend behavior
- Google Sheets behavior
- worker behavior
- Caddy/env/systemd/deployment changes

## Verification

Required checks are the repository standard package tests, typecheck, lint, build, API import check,
diff check, and safety greps listed in the implementation report.
