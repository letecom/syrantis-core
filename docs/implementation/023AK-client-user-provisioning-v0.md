# 023AK - Client User Provisioning v0 Implementation

## Summary

023AK adds a controlled admin/founder-only path for creating client users without manual database
promotion. The created account belongs to the admin/founder session workspace, is forced to
`role = client`, and receives a server-generated temporary password that is returned once.

## Files Changed

- `packages/shared/src/contracts/client-users.ts`
- `apps/api/src/repositories/client-users.ts`
- `apps/api/src/services/client-users.ts`
- `apps/api/src/routes/client-users.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/client-users.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/ClientUsersPage.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `packages/db/migrations/0023_client_users_insert_grant.sql`
- `packages/db/src/verify/*`
- `README.md`
- `docs/architecture/current-state.md`
- `docs/runbooks/client-user-provisioning-v0.md`
- `DECISIONS.md`

## Behavior

- `GET /api/admin/client-users` lists client users in the trusted workspace.
- `POST /api/admin/client-users` accepts email and optional display name.
- The backend rejects client-supplied workspace/tenant identity and role fields.
- The backend forces `role = client` and `status = active`.
- Temporary passwords are generated with `crypto.randomBytes`, hashed through the existing bcrypt
  password helper, and returned once in the create response.
- List responses never include temporary passwords or password hashes.
- `/app/client-users` shows the safe list, a create form, and one-time success panel.
- `app.syrantis.fr/login` uses client-facing copy; admin/default hosts keep admin sign-in copy.

## Security Notes

- No public signup was added.
- No self-registration was added.
- No workspace selector was added.
- No admin/founder/operator provisioning was added.
- No activity log is written, avoiding accidental password or PII logging in v0.
- No localStorage or sessionStorage is used for temporary passwords.
- ClientShell navigation remains Dashboard, Inbox, and Config only.

## Production Permission Hotfix

Production validation found that `POST /api/admin/client-users` failed with `permission denied for
table users` after the route shipped. The runtime role already had `SELECT` on `users`, which
supported auth and listing, but 023AK introduced the first legitimate runtime insert into
`public.users`.

Migration `0023_client_users_insert_grant.sql` grants only `INSERT` on `users` to `syrantis_app`.
It does not grant `UPDATE`, `DELETE`, broad table grants, superuser, or RLS changes. The schema
verifier includes a matching invariant for `syrantis_app.users.INSERT` so this provisioning
permission remains explicit.

## Checks

Focused checks run during implementation:

```bash
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- client-users.test.ts
pnpm --filter @syrantis/web test -- api-client.test.ts app.test.tsx
```

Full required checks run:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Safety greps were run for migrations, protected production paths, logging/stringification, password
terms, browser storage, and provider/Gmail/Google/Resend/OpenRouter terms. No migration or protected
production path was changed. Password-term matches are limited to the provisioning implementation,
DTO/tests, and one-time UI display; no logging or browser storage path was added.

## Future Work

Full User Manager/Admin Workspace Control Plane remains future work. Full Config remains the next
issue. Invite emails, password reset, workspace switching, and role management require separate
approval.
