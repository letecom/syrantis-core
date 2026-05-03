# 021M Test Environment Isolation

## Summary

Added API Vitest environment isolation for email provider variables.

The failure cause was ambient production-like email provider env leaking into API tests. When `RESEND_TO_ALLOWLIST` was present in the host shell, mocked Resend provider tests could reject with `EMAIL_RECIPIENT_NOT_ALLOWED` before reaching mocked `fetch`.

Production behavior is unchanged. The Resend provider still reads `RESEND_API_KEY` and `RESEND_TO_ALLOWLIST` in normal runtime construction, and allowlist rejection remains enforced.

## Files Changed

- `apps/api/vitest.config.ts`
  - Adds API-local Vitest config with a setup file.
- `apps/api/src/tests/setup-env.ts`
  - Clears test-only email provider env at setup load, before each test, and after each test.
- `apps/api/src/tests/background-jobs.test.ts`
  - Adds regression coverage for sanitized ambient env.
  - Adds env-configured allowlist rejection coverage.
- `docs/specs/021M-test-environment-isolation.md`
  - Adds the issue spec.
- `docs/implementation/021M-test-environment-isolation.md`
  - Adds this implementation report.

## Env Isolation

The API test setup clears only:

- `SEND_EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_TO_ALLOWLIST`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO`

These are the variables found by inspecting the current API email provider and send handler code.

The hostile-command variables `SEND_EMAIL_RECIPIENT_ALLOWLIST`, `RESEND_RECIPIENT_ALLOWLIST`, and `EMAIL_ALLOWED_DOMAINS` are not read by the current API email provider path, so they are documented but not part of the active isolation set.

## Production Safety

No production module was changed.

`apps/api/src/services/email/resend-provider.ts` still:

- reads `RESEND_API_KEY` when no explicit `apiKey` option is passed
- reads `RESEND_TO_ALLOWLIST` when no explicit `allowlist` option is passed
- throws `EMAIL_RECIPIENT_NOT_ALLOWED` before provider calls when the recipient is not allowlisted

The new setup file runs only under Vitest.

## Behavior Unchanged

No:

- API route change
- worker change
- provider behavior change
- DB migration
- schema change
- webhook work
- RLS verification
- broad env refactor
- provider bypass flag
- secret value
- real recipient data

## Tests Run

```sh
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/api exec vitest run src/tests/background-jobs.test.ts
SEND_EMAIL_PROVIDER=resend RESEND_API_KEY=prod_like_fake_key RESEND_TO_ALLOWLIST=blocked@example.com RESEND_FROM_EMAIL=prod-from@example.test RESEND_REPLY_TO=prod-reply@example.test SEND_EMAIL_RECIPIENT_ALLOWLIST=blocked@example.com RESEND_RECIPIENT_ALLOWLIST=blocked@example.com EMAIL_ALLOWED_DOMAINS=blocked.example pnpm --filter @syrantis/api exec vitest run src/tests/background-jobs.test.ts
pnpm --filter @syrantis/api exec vitest run src/tests/draft-send-attempts.test.ts src/tests/draft-send-status.test.ts src/tests/draft-send-readiness.test.ts src/tests/draft-send-cancellation.test.ts src/tests/email-sends.test.ts
pnpm test
SEND_EMAIL_PROVIDER=resend RESEND_API_KEY=prod_like_fake_key RESEND_TO_ALLOWLIST=blocked@example.com RESEND_FROM_EMAIL=prod-from@example.test RESEND_REPLY_TO=prod-reply@example.test SEND_EMAIL_RECIPIENT_ALLOWLIST=blocked@example.com RESEND_RECIPIENT_ALLOWLIST=blocked@example.com EMAIL_ALLOWED_DOMAINS=blocked.example pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

All checks passed.

## Rollback

Revert code and docs only. No database rollback is needed because 021M adds no migration and performs no data repair.
