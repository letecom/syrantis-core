# Issue 021D Implementation Report: Draft Send Readiness and Request-Send Hardening

## Summary

Implemented `GET /api/drafts/:id/send-readiness` as a read-only send readiness model and hardened `POST /api/drafts/:id/request-send` to compute the same readiness before creating an email send or send_email background job.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/repositories/draft-send-readiness.ts`
- `apps/api/src/services/draft-send-readiness.ts`
- `apps/api/src/tests/draft-send-readiness.test.ts`
- `apps/api/src/tests/email-sends.test.ts`
- `docs/specs/021D-draft-send-readiness.md`
- `docs/implementation/021D-draft-send-readiness.md`

## Safety Properties

- Uses existing `/api/drafts` route style.
- Uses `tenantGuard` and `getWorkspaceId(c)`.
- Does not add tenant/workspace IDs to URLs or request bodies.
- Does not read `workspaceId` from body, query, params, headers, or client state.
- Returns `404` for missing, archived, or cross-workspace drafts.
- Does not add migrations, UI, provider calls, worker execution, direct send behavior, public AI-run routes, or deployment behavior.
- GET readiness performs no inserts, updates, deletes, activity logs, background jobs, provider calls, or worker calls.
- Blocked request-send returns `409 SEND_READINESS_BLOCKED` before email send mutation, background job creation, or activity logs.
- Warning-only readiness still allows the existing request-send behavior.
- Readiness output exposes booleans, statuses, counts, and check codes only; it does not expose raw subject, body, contact email, provider identifiers, AI payloads, AI output, AI errors, costs, tokens, or secrets.

## Verification Plan

Required checks:

```sh
pnpm --filter @syrantis/api exec vitest run src/tests/draft-send-readiness.test.ts src/tests/email-sends.test.ts src/tests/drafts.test.ts
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Security greps:

```sh
grep -RniE "prompt_json|output_json|input_payload|output_payload|output_text|cost_estimate|input_tokens|output_tokens|error_message" apps/api/src/routes apps/api/src/services apps/api/src/repositories packages/shared/src/contracts | grep -i "send-readiness\|request-send" || true
grep -RniE "SEND_EMAIL_PROVIDER|RESEND_API_KEY|OPENROUTER_API_KEY|provider_message_id" apps/api/src/routes apps/api/src/services apps/api/src/repositories packages/shared/src/contracts | grep -i "send-readiness" || true
grep -RniE "OpenRouter|complete\(|fetch\(|response_format|OPENROUTER|Resend|provider\.send|sendEmail\(|worker:once|processJob|runWorker|sendEmailWorker" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "send-readiness\|request-send" || true
grep -RniE "ai-runs|ai_runs" apps/api/src/routes || true
grep -RniE "workspaceId.*body|workspaceId.*req|workspaceId.*params|workspaceId.*query" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "send-readiness\|request-send" || true
```

## Rollback

Remove the send readiness route wiring, readiness service/repository, shared readiness contract, tests, and 021D docs. No database rollback is required because this issue adds no migration.
