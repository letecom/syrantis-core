# 023K API Key Management Hardening

## Summary

Implemented backend and admin UI hardening for workspace API keys used by public inbound message intake.

## Backend

- Tightened shared workspace API key contracts around explicit safe DTOs.
- Removed `workspaceId` from API key client DTOs.
- Kept `plaintextApiKey` only in the create response.
- Required admin/founder role on workspace API key routes.
- Rejected client tenant material in body, query, and tenant/workspace headers.
- Made revoke idempotent and safe.
- Added safe `workspace_api_key.created` and `workspace_api_key.revoked` activity metadata.
- Extracted public intake rate limiting to `apps/api/src/services/rate-limit.ts`.
- Kept public intake auth generic: missing, malformed, revoked, and unknown keys return `401`.
- Kept `lastUsedAt` updates constrained to active keys.

## Admin UI

- Added `/app/api-keys`.
- Added `API Keys` sidebar navigation.
- Added list, empty state, create modal, one-time plaintext display, copy button, close-state clearing, and revoke confirmation.
- Used only the central frontend API client.
- Added no browser token storage and no frontend bearer behavior.

## Documentation

- Added this implementation report.
- Added the 023K spec.
- Added `docs/runbooks/api-key-management.md`.
- Updated README current state.

## Validation

Targeted validation commands for this issue:

```bash
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- workspace-api-keys.test.ts inbound-message-intake.test.ts rate-limit.test.ts
pnpm --filter @syrantis/web test -- api-client.test.ts app.test.tsx
pnpm --filter @syrantis/api typecheck
pnpm --filter @syrantis/web typecheck
```

Issue safety greps were also run after implementation.

## Risk And Rollback

Risk is limited to the admin key management routes, admin UI key screen, and public intake rate-limit plumbing.

Rollback is a code revert of this PR. No database migration, Redis dependency, production env, Caddy, Docker, systemd, or worker runtime change exists for this issue.
