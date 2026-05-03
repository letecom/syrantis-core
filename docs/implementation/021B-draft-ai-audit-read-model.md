# Issue 021B Implementation Report: Draft AI Audit Read Model

## Summary

Implemented `GET /api/drafts/:id/ai-audit` as a tenant-scoped read-only route for AI-generated draft audit data.

The endpoint returns `data: null` for non-AI drafts and a narrow audit read model for drafts created by 021A AI draft generation.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/services/draft-ai-audit.ts`
- `apps/api/src/repositories/draft-ai-audit.ts`
- `apps/api/src/tests/draft-ai-audit.test.ts`
- `docs/specs/021B-draft-ai-audit-read-model.md`
- `docs/implementation/021B-draft-ai-audit-read-model.md`

## Safety Properties

- Uses existing `/api/drafts` route style.
- Uses `tenantGuard` and `getWorkspaceId`.
- Does not add `/api/v1`.
- Does not add `tenantId` or `workspaceId` to the URL.
- Returns `404` for missing, archived, or cross-workspace drafts.
- Does not expose draft body fields, contact PII, AI payloads, AI output text, AI errors, cost fields, or token fields.
- Does not create a public AI run route.
- Does not add migrations, workers, send logic, or approval logic.
- Does not insert, update, delete, enqueue jobs, create activity logs, or call providers.

## Verification Plan

Required checks:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Security greps:

```sh
grep -RniE "prompt_json|output_json|input_payload|output_payload|output_text|cost_estimate|input_tokens|output_tokens|error_message" apps/api/src/routes apps/api/src/services apps/api/src/repositories packages/shared/src/contracts | grep -i "audit" || true
grep -RniE "OpenRouter|complete\\(|fetch\\(|response_format|OPENROUTER" apps/api/src/routes apps/api/src/services/draft-ai-audit.ts apps/api/src/repositories/draft-ai-audit.ts 2>/dev/null || true
grep -RniE "email_sends|send_email|SEND_EMAIL_PROVIDER|Resend|request-send|request-approval|approved|pending_approval" apps/api/src/routes apps/api/src/services/draft-ai-audit.ts apps/api/src/repositories/draft-ai-audit.ts 2>/dev/null || true
```

## Rollback

Remove the route registration, audit service, audit repository, shared audit schemas, tests, and 021B docs. No database rollback is required because this issue adds no migration.
