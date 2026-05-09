# API Key Management Runbook

## Purpose

Workspace API keys authorize public machine-to-machine inbound message intake:

```txt
POST /api/intake/inbound-message
Authorization: Bearer <workspace_api_key>
```

Keys are operational secrets. Syrantis stores only the hash, prefix, and last four characters.

## Create A Key

1. Sign in to the admin UI.
2. Open `/app/api-keys`.
3. Click `Create API key`.
4. Enter a short operational name.
5. Copy the displayed key immediately.

The plaintext key is shown once. Syrantis cannot recover it later.

## Use A Key

Send the key in the public intake authorization header:

```bash
curl -X POST https://api.syrantis.fr/api/intake/inbound-message \
  -H 'Authorization: Bearer syr_live_example' \
  -H 'Content-Type: application/json' \
  -d '{
    "fromEmail": "lead@example.com",
    "bodyText": "Need help with a boiler.",
    "source": "api"
  }'
```

Do not put keys in query strings, request bodies, frontend code, screenshots, docs, or logs.

## Revoke A Key

1. Open `/app/api-keys`.
2. Find the active key.
3. Click `Revoke`.
4. Confirm the warning.

Revocation is immediate. Integrations using the revoked key receive generic `401 Unauthorized` from public intake.

## Rotate A Key

There is no backend rotate endpoint.

1. Create a new key.
2. Copy it once.
3. Update the external integration.
4. Validate public intake with the new key.
5. Revoke the old key.

## Constraints

- No secret recovery.
- No plaintext storage.
- No migration.
- No Redis.
- No production env change.
- No Caddy, Docker, systemd, or worker runtime change.
- Public intake rate limiting is in-memory fixed-window behavior, defaulting to 10 requests per 60 seconds per key.
