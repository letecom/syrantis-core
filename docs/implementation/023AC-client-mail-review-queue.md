# 023AC Client Mail Review Queue Implementation

## Summary

Implemented a read-only client mail review queue for AI-classified inbound messages.

## Files Changed

- `packages/shared/src/contracts/mail-queue.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/mail-queue.repository.ts`
- `apps/api/src/services/mail-queue.service.ts`
- `apps/api/src/routes/client/mail-queue.ts`
- `apps/api/src/routes/client/index.ts`
- `apps/api/src/tests/client-mail-queue.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/MailQueuePage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023AC-client-mail-review-queue.md`
- `docs/implementation/023AC-client-mail-review-queue.md`
- `docs/architecture/current-state.md`
- `README.md`

## Behavior

- `GET /api/client/mail-queue` returns a safe paginated mail-centric read model based on
  `intake_classifications`.
- `GET /api/client/mail-queue/:classificationId` returns the safe detail read model for one
  classification.
- `/app/mail-queue` renders summary cards, filters, compact read-only items, and a detail drawer
  with links to Draft Queue and Gmail Export when a draft is available.

## Safety Notes

- No migration was added.
- No mutation routes were added.
- Queue reads do not create activity logs, background jobs, email sends, approvals, drafts, or
  provider calls.
- No raw inbound email body is selected or returned.
- Only generated draft subject/body previews are returned, capped at 120 and 280 characters.
- Workspace IDs, raw metadata, provider payloads, prompts, outputs, lease tokens, contact
  email/name, and API key material are not part of the DTO contract.

## Commands Run

- `pnpm --filter @syrantis/db verify-migration-files`
- `pnpm --filter @syrantis/db test`
- `pnpm --filter @syrantis/shared build`
- `pnpm --filter @syrantis/api test -- client-mail-queue`
- `pnpm --filter @syrantis/api test`
- `pnpm --filter @syrantis/web test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git diff --check`
- Security greps for migrations, provider/fetch imports, mutation methods, side-effect writes,
  forbidden DTO terms, and forbidden Mail Queue UI text/fields.

## Rollback

Remove the mail queue contract, repository, service, route registration, frontend page/nav/API
client additions, and associated tests/docs. No database rollback is required.

## Business Value

Gives admin/founder users a safe mail-centric view of what Syrantis classified, scored, drafted,
exported, and what needs attention without exposing raw mail or building a Gmail clone.
