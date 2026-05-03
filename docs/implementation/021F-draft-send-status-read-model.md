# Issue 021F Implementation Report: Draft Send Status Read Model

## Summary

Implemented `GET /api/drafts/:id/send-status` as a safe, draft-scoped read model for the latest `email_sends` proof.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/repositories/draft-send-status.ts`
- `apps/api/src/services/draft-send-status.ts`
- `apps/api/src/tests/draft-send-status.test.ts`
- `docs/specs/021F-draft-send-status-read-model.md`
- `docs/implementation/021F-draft-send-status-read-model.md`

## Safety Properties

- Uses existing `/api/drafts/:id/...` route style.
- Uses `tenantGuard`, `getWorkspaceId(c)`, and `withWorkspaceDb(workspaceId)`.
- Does not accept `workspaceId` from body, query, params, headers, or client state.
- Returns `404` for missing, archived, or cross-workspace drafts.
- Selects only draft id plus safe latest send proof fields.
- Orders latest send by `created_at desc`, then `id desc`.
- Performs no inserts, updates, deletes, activity logs, background jobs, provider calls, worker calls, fetch calls, or enqueue calls.
- Does not expose raw draft content, contact PII, provider internals, job payloads, AI payloads, costs, tokens, raw provider responses, or secrets.
- Adds no migration and no UI behavior.

## Verification Plan

Required checks:

```sh
pnpm --filter @syrantis/api exec vitest run src/tests/draft-send-status.test.ts src/tests/draft-send-readiness.test.ts src/tests/draft-ai-audit.test.ts src/tests/draft-approval-readiness.test.ts
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Security greps:

```sh
grep -RniE "provider_message_id|provider|last_error_message|recipient_email|subject|text_body|html_body|textBody|htmlBody|contact\.email|phone|firstName|lastName|payload_json|prompt_json|output_json|input_payload|output_payload|output_text|cost_estimate|input_tokens|output_tokens|ai_runs|ai-runs" apps/api/src/routes apps/api/src/services apps/api/src/repositories packages/shared/src/contracts | grep -i "send-status" || true
grep -RniE "OpenRouter|complete\(|fetch\(|response_format|OPENROUTER|Resend|provider\.send|sendEmail\(|worker:once|processJob|runWorker|sendEmailWorker|background_jobs|activity_logs" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "send-status" || true
grep -RniE "workspaceId.*body|workspaceId.*req|workspaceId.*params|workspaceId.*query" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "send-status" || true
grep -RniE "email-sends/.*/status|/api/email-sends/.*/status|send-status" apps/api/src/routes || true
git diff --name-only | grep "packages/db/migrations" || true
```

## Rollback

Remove the send-status route wiring, service, repository, shared contract schemas/types, tests, and 021F docs. No database rollback is required because this issue adds no migration.
