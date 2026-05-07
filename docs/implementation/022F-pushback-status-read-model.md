# 022F Pushback Status Read Model Implementation

## Summary

Implemented safe pushback status read models:

- `GET /api/email-sends/:id/pushback-status`
- `GET /api/drafts/:id/pushback-status`

Both routes use the same pushback status service logic. The draft route resolves the latest
`email_sends` row for the draft, then delegates to the shared response builder. If no email send
exists, it returns `no_send`.

## Files Changed

- `packages/shared/src/contracts/pushback-status.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/pushback-status.ts`
- `apps/api/src/services/pushback-status.ts`
- `apps/api/src/routes/email-sends.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/tests/pushback-status.test.ts`
- `docs/specs/022F-pushback-status-read-model.md`
- `docs/implementation/022F-pushback-status-read-model.md`
- `README.md`

## Behavior

Email-send route:

- invalid UUID: 400
- unauthenticated: 401
- non-admin/non-founder: 403
- unknown or cross-workspace email send: 404
- known email send: safe pushback status DTO

Draft route:

- invalid UUID: 400
- unauthenticated: 401
- non-admin/non-founder: 403
- unknown or cross-workspace draft: 404
- draft with no email send: `no_send`
- draft with sends: latest send by `created_at DESC, id DESC`

## Safety Notes

The read model:

- reads only from `drafts`, `email_sends`, and `activity_logs`
- uses `tenantGuard` and `withWorkspaceDb`
- gets `workspaceId` only from trusted server context
- links diagnostics by `activity_logs.entity_type = 'email_send'` and `entity_id = emailSendId`
- maps only explicit safe metadata keys
- limits recent history to 5

It does not:

- mutate `email_sends`
- insert `activity_logs`
- create `background_jobs`
- call Google
- call Resend
- call `fetch`
- call replay
- modify `pushDeliveryProofToGoogleSheets`
- modify the 022E replay route
- add migrations or tables

## Response Safety

The DTO excludes:

- `workspaceId`
- provider names and provider message IDs
- contact emails
- subject/body content
- raw Google errors
- raw webhook payloads
- credentials
- raw metadata pass-through

Diagnostic `errorSummary` is derived from known safe pushback error codes instead of trusting the
raw metadata value.

## Checks

Focused checks during implementation:

```bash
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- --run src/tests/pushback-status.test.ts
```

Full gates run:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/shared build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
grep -R "provider_message_id\|providerMessageId" packages/shared/src/contracts apps/api/src/routes 2>/dev/null || true
grep -R "workspaceId.*body\|workspaceId.*query\|workspaceId.*req" apps/api/src/routes 2>/dev/null || true
grep -R "pushDeliveryProofToGoogleSheets\|Resend\|fetch(" apps/api/src/routes 2>/dev/null || true
```

Results:

- `verify-migration-files`: `sql_files=19 journal_entries=19 drift=0`
- DB tests: 46 passed
- Shared build: passed
- API tests: 29 files / 477 tests passed
- Typecheck: passed
- Lint: passed
- Build: passed
- API import safety: `API_IMPORT_OK`
- `git diff --check`: passed
- Provider-message grep: no matches
- Client-workspace grep: no matches
- Provider-call grep: only pre-existing `apps/api/src/routes/webhooks/resend.ts` Resend webhook route
  references; no 022F route/service/repository matches

## Rollback

Revert the routes, pushback status service/repository, shared contract, tests, and docs. No database
rollback is required because 022F adds no migration.

## Business Value

Admins can inspect pushback state safely through the API before the admin console and replay action
panel are introduced, without manual SQL and without touching provider paths.
