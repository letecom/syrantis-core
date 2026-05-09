# 023K API Key Management Hardening

## Scope

023K turns the existing workspace API key primitive into an admin-operable surface for the public machine-to-machine intake route:

```txt
POST /api/intake/inbound-message
Authorization: Bearer <workspace_api_key>
```

This issue includes backend hardening, admin UI management, shared DTO cleanup, a testable in-memory rate-limit service, tests, and operator documentation.

## Explicit Non-Goals

- No migration.
- No Redis.
- No backend rotate endpoint.
- No production env change.
- No Caddy, systemd, Docker, or worker runtime change.
- No secret recovery.

Rotation is a manual operational sequence: create a new key, update the external integration, then revoke the old key.

## Backend Requirements

`/api/workspace-api-keys` remains session-cookie protected and tenant-guarded. Admin/founder role is required. The workspace is derived only from server session context.

The route rejects client tenant material in body, query, or tenant/workspace headers.

Safe response DTOs expose only:

- `id`
- `name`
- `keyPrefix`
- `last4`
- `status`
- `lastUsedAt`
- `revokedAt`
- `createdAt`
- `updatedAt`

Safe DTOs must not expose key hash, plaintext key, token, authorization material, or workspace identifiers.

Create accepts a strict body:

```json
{ "name": "string, 1..100" }
```

Create generates an opaque `syr_live_...` key with `crypto.randomBytes`, stores only `key_hash`, `key_prefix`, and `last4`, and returns `plaintextApiKey` only in the create response.

Revoke is idempotent and workspace-scoped. Revoked keys immediately fail public intake authentication with generic `401 Unauthorized`.

Activity metadata for create and revoke is safe and limited to:

- `keyId`
- `name`
- `keyPrefix`
- `last4`
- `status`
- `source`

## Rate Limit

Public inbound message intake uses an in-memory fixed-window rate limiter:

- default 10 requests per 60 seconds
- key is API key ID, with workspace ID fallback if needed
- response is `429` with `Retry-After`
- no Redis
- no DB rate-limit
- no required env

## Admin UI

The admin UI exposes `/app/api-keys`.

The page lists keys, creates keys through a one-time plaintext display, copies the one-time value, clears plaintext state when the modal closes, and revokes active keys after confirmation.

The frontend uses the central API client, session cookies only, and no frontend bearer token.

## Tests

Coverage includes route auth, safe DTO shape, strict create body, idempotent revoke, revoked public intake rejection, active public intake non-regression, rate-limit behavior, admin UI rendering, create copy-once flow, revoke confirmation, and storage/header safety greps.
