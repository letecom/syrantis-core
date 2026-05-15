# 023AA Client Draft Review Queue Implementation

## Summary

Implemented a read-only client draft review queue for AI-generated drafts.

## Files Changed

- `packages/shared/src/contracts/draft-queue.ts`
- `apps/api/src/repositories/draft-queue.repository.ts`
- `apps/api/src/services/draft-queue.service.ts`
- `apps/api/src/routes/client/draft-queue.ts`
- `apps/api/src/routes/client/index.ts`
- `apps/api/src/tests/client-draft-queue.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/DraftQueuePage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`

## Behavior

- `GET /api/client/draft-queue` returns safe queue items, summaries, filters, and previews.
- `GET /api/client/draft-queue/:draftId` returns safe detail data with the full generated draft body.
- The frontend renders `/app/draft-queue` as a card-based review queue with a read-only detail drawer.

## Safety Notes

- No migration was added.
- No mutation routes were added.
- Queue reads do not create activity logs, background jobs, email sends, approvals, or provider calls.
- List responses include only truncated generated draft previews.
- Detail responses include only the generated draft body, not raw inbound email content.
- Workspace IDs, raw metadata, provider payloads, prompts, outputs, lease tokens, contact email/name, and API key material are not part of the shared DTO contract.

## Commands Run

- `pnpm --filter @syrantis/db verify-migration-files`
- `pnpm --filter @syrantis/db test`
- `pnpm --filter @syrantis/shared build`
- `pnpm --filter @syrantis/api test -- client-draft-queue`
- `pnpm --filter @syrantis/api test`
- `pnpm --filter @syrantis/web test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git diff --check`

## Rollback

Remove the new draft queue contract, repository, service, route registration, frontend page/nav/API client additions, and associated tests/docs. No database rollback is required.

## Business Value

Gives admin/founder users a safe first review surface for generated drafts without exposing CRM/inbox concepts or requiring manual UUID lookup.
