# 023A Minimal Admin Console Implementation

## Summary

Implemented the first minimal Syrantis Admin UI in `apps/web`.

The UI is cookie-session based, protected by session restore, and limited to:

- login
- protected admin shell
- minimal dashboard
- read-only pushback lookup
- logout

No backend code, migrations, provider code, Docker, Caddy, or production env files were changed.

## Files Changed

- `.agents/skills/syrantis-admin-ui/SKILL.md`
- `apps/web/package.json`
- `apps/web/pnpm` lock entries through the root lockfile
- `apps/web/postcss.config.js`
- `apps/web/tailwind.config.ts`
- `apps/web/vite.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/query.ts`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/src/components/ProtectedRoute.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/NotFoundPage.tsx`
- `apps/web/src/pages/PushbackPage.tsx`
- `apps/web/tests/*`
- `docs/specs/023A-minimal-admin-console.md`
- `docs/implementation/023A-minimal-admin-console.md`
- `README.md`

Removed the old placeholder `Pipeline`, `Tasks`, `Settings`, and health API client files from
`apps/web`.

## Routes Used

Auth:

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

Pushback:

- `GET /api/email-sends/:id/pushback-status`
- `GET /api/drafts/:id/pushback-status`

The UI does not call the pushback replay endpoint.

## Security Notes

- Auth uses only opaque session cookies through the backend.
- Every production request goes through `apps/web/src/lib/api-client.ts`.
- Every production request uses credentialed browser requests.
- The client strips unknown auth fields before storing user state.
- The pushback page renders an allowlist of safe DTO fields.
- The pushback page does not render raw metadata, provider payloads, email content, contact details,
  tenant identifiers, credential material, or external provider internals.
- Vite dev proxy handles local `/auth` and `/api` requests without backend CORS changes.

## Tests Added

- login form renders
- login validation
- login route request and redirect
- failed login generic error
- protected unauthenticated redirect
- authenticated shell
- logout route and redirect
- pushback UUID validation
- email-send lookup route
- draft lookup route
- safe status rendering
- unsafe mock response fields are not rendered
- API client credentialed requests

## Checks

Run after implementation:

```bash
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/web test
pnpm --filter @syrantis/web typecheck
pnpm --filter @syrantis/web lint
pnpm --filter @syrantis/web build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
API import safety check with the database URL unset
git diff --check
```

## Rollback

Revert the `apps/web` UI changes, root lockfile/package updates, the 023A docs, and the UI skill.
No database rollback is required.

## Next

023B Admin Action Panel.
