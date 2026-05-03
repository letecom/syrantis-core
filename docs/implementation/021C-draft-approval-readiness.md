# Issue 021C Implementation Report: Draft Approval Readiness and Request-Approval Hardening

## Summary

Implemented `GET /api/drafts/:id/approval-readiness` as a read-only readiness model and hardened `POST /api/drafts/:id/request-approval` to use the same readiness service before any approval mutation.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
- `apps/api/src/routes/drafts.ts`
- `apps/api/src/repositories/draft-approval-readiness.ts`
- `apps/api/src/services/draft-approval-readiness.ts`
- `apps/api/src/tests/draft-approval-readiness.test.ts`
- `apps/api/src/tests/drafts.test.ts`
- `docs/specs/021C-draft-approval-readiness.md`
- `docs/implementation/021C-draft-approval-readiness.md`

## Safety Properties

- Uses existing `/api/drafts` route style.
- Uses `tenantGuard` and `getWorkspaceId(c)`.
- Does not add `/api/v1` or tenant/workspace IDs to URLs.
- Does not read `workspaceId` from body, query, params, headers, or client state.
- Returns `404` for missing, archived, or cross-workspace drafts.
- Does not expose draft bodies, raw metadata, contact PII, lead raw content, AI payloads, AI output, AI errors, costs, tokens, provider payloads, or secrets.
- Does not add migrations, UI, workers, provider calls, send logic, public AI-run routes, auto-approval, or auto-send.
- GET readiness performs no inserts, updates, deletes, activity logs, background jobs, or provider calls.
- Blocked request-approval returns `409 APPROVAL_READINESS_BLOCKED` before draft mutation, approval creation, or activity logs.
- Warning-only readiness still allows the existing manual approval workflow.

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
grep -RniE "prompt_json|output_json|input_payload|output_payload|output_text|cost_estimate|input_tokens|output_tokens|error_message" apps/api/src/routes apps/api/src/services apps/api/src/repositories packages/shared/src/contracts | grep -i "readiness\|approval" || true
grep -RniE "OpenRouter|complete\\(|fetch\\(|response_format|OPENROUTER" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "readiness\|approval" || true
grep -RniE "email_sends|send_email|SEND_EMAIL_PROVIDER|Resend|request-send" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "readiness\|request-approval\|approval-readiness" || true
grep -RniE "ai-runs|ai_runs" apps/api/src/routes || true
grep -RniE "workspaceId.*body|workspaceId.*req|workspaceId.*params" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "readiness\|approval" || true
```

## Rollback

Remove the readiness route wiring, readiness service/repository, shared readiness contract, tests, and 021C docs. No database rollback is required because this issue adds no migration.
