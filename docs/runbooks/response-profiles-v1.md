# Response Profiles v1 Runbook

## Purpose

Response profiles let a client configure multiple team voices in `/config` under
`Profils de réponse`. They are configuration data only in 023AN; draft generation does not consume
them yet.

## Client Operation

Open `app.syrantis.fr/config` with a `client`, `admin`, or `founder` session.

Expected:

- existing response policy editor still loads
- `Profils de réponse` section loads from `/api/client/config/response-profiles`
- empty workspaces show: `Crée ton premier profil de réponse. Il deviendra le profil par défaut.`
- creating the first profile makes it default
- setting a profile as default removes the default marker from other active profiles
- default profile deactivation is disabled in the UI
- non-default profile deactivation hides it from the normal list after refresh

## API Checks

Useful local checks:

```bash
pnpm --filter @syrantis/api test -- client-response-profiles
pnpm --filter @syrantis/web test -- api-client app
```

Manual API expectations:

- unauthenticated requests return `401`
- `operator` returns `403`
- client/admin/founder can list
- profile mutation by another workspace behaves as `404`
- default or last-active deactivation returns `409`
- request bodies containing workspace identity or provider/generation/secret fields return `400`

## Database Checks

Run:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
```

Expected database invariants:

- table `workspace_response_profiles` exists
- RLS and FORCE RLS are enabled
- policy `tenant_isolation_workspace_response_profiles` exists
- trigger `workspace_response_profiles_set_updated_at_trg` exists
- partial unique index `workspace_response_profiles_one_active_default_idx` exists
- `syrantis_app` has `SELECT`, `INSERT`, and `UPDATE`
- `syrantis_app` does not need DELETE because deactivation is an update

## Safety Notes

Do not manually hard-delete response profiles for normal client removal. Use `is_active=false`.

Activity log metadata must stay values-free:

- allowed: `profileId`, `changedFields`, `source`, `action`
- forbidden: profile text values, workspace IDs, prompts, outputs, provider/model IDs, API keys,
  tokens, secrets, raw body, metadata blobs

023AN does not approve provider calls, workers, Draft Generation v2, Gmail/App Script, Google
Sheets, Resend, Caddy/env/systemd changes, or deployment actions.

Future 023AQ Draft Generation v2 may consume profiles only after a separate implementation defines
the server-side selection path and audit behavior.
