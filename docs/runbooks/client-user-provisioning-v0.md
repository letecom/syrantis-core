# Client User Provisioning v0 Runbook

## Purpose

Create a basic client user for the current workspace without manual database promotion.

023AK replaces manual DB promotion for basic test clients. It does not add public signup,
self-registration, invite email, password reset, full User Manager, or full Config.

## Who Can Use It

Only authenticated `admin` or `founder` users may use this flow.

`client` and `operator` users are blocked. If operator access is ever needed, it must be approved in
a later issue.

## Admin UI Flow

1. Sign in on the admin surface.
2. Open `/app/client-users`.
3. Enter the client email.
4. Optionally enter a display name.
5. Select `Create client user`.
6. Copy the generated temporary password immediately.
7. Dismiss the success panel after recording the password through the approved operator channel.

The temporary password is shown once. Refreshing or dismissing the panel removes it from the UI.

## Client Verification

Before retesting a production failure with `permission denied for table users`, the operator must
resync production to the fixed revision, run the database migration that grants `syrantis_app`
`INSERT` on `public.users`, and restart the API. Codex must not perform those production actions.

1. Open `https://app.syrantis.fr/login`.
2. Confirm the login wording is client-facing:
   - `Syrantis`
   - `Espace client`
   - `Se connecter`
3. Sign in with the created client email and temporary password.
4. Confirm the client lands on `/inbox`.
5. Confirm the client shell shows only:
   - Tableau de bord
   - Boîte de réception
   - Configuration
6. Confirm admin surfaces are not visible in the client shell.
7. Confirm admin-only APIs remain blocked for the client session.

## Production Retest After Permission Fix

1. Resync production to a revision that includes `0023_client_users_insert_grant.sql`.
2. Run migrations through the approved production migration process.
3. Restart the API through the approved production process.
4. Retry `POST /api/admin/client-users` as an admin/founder.
5. Confirm `temporaryPassword` appears once in the create response/UI.
6. Sign in as the client on `https://app.syrantis.fr/login`.

## API Behavior

```txt
GET /api/admin/client-users
POST /api/admin/client-users
```

Create payload:

```json
{
  "email": "client@example.com",
  "displayName": "Optional Name"
}
```

The backend derives `workspaceId` from the trusted session context. Do not send workspace or tenant
identity in the request. Do not send `role`.

## Safety Rules

- Do not store plaintext passwords in Git, docs, tickets, screenshots, logs, shell history, browser
  storage, or activity logs.
- Do not paste password hashes into shared artifacts.
- Do not add signup links to login.
- Do not create admin/founder/operator users through this route.
- Do not deploy or mutate production data from Codex.

## Future Work

Full User Manager/Admin Workspace Control Plane remains future work. Full Config remains next issue.
