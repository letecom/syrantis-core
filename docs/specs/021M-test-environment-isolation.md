# 021M Test Environment Isolation

## Goal

Make API tests deterministic when production-like email provider environment variables are present in the host shell.

The observed failure was `EMAIL_RECIPIENT_NOT_ALLOWED` in mocked Resend provider tests. The failure occurred before mocked `fetch` assertions, which proved the test harness was inheriting ambient email provider env and applying allowlist behavior that the tests did not intentionally configure.

## Actual Env Inputs

Inspection found these variables can affect API Resend / send-provider tests:

- `SEND_EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_TO_ALLOWLIST`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO`

`RESEND_TO_ALLOWLIST` is the recipient allowlist read by `ResendProvider`.

The following hostile-command variables are not currently read by API email provider code:

- `SEND_EMAIL_RECIPIENT_ALLOWLIST`
- `RESEND_RECIPIENT_ALLOWLIST`
- `EMAIL_ALLOWED_DOMAINS`

## Scope

Add API test-only env isolation so Vitest starts each API test from a clean email provider env baseline.

The isolation must:

- live in API test harness/config only
- clear only known email provider env variables
- run before tests import production modules
- avoid changing production provider behavior
- allow tests to intentionally configure provider env when asserting env-driven behavior

## Anti-Scope

No:

- production behavior change
- provider allowlist weakening
- API route change
- worker change
- database migration
- schema change
- RLS verification
- webhook work
- broad env refactor
- provider bypass flag
- secrets in tests or docs
- real recipient data

## Required Tests

- mocked Resend success reaches `fetch` and returns `messageId`
- mocked Resend timeout reaches `fetch` and asserts timeout behavior
- mocked Resend HTTP retry cases reach `fetch` and assert HTTP behavior
- ambient email provider env is absent at API test start
- explicit allowlist rejection still throws `EMAIL_RECIPIENT_NOT_ALLOWED`
- env-configured allowlist rejection still throws when the test intentionally sets `RESEND_TO_ALLOWLIST`
- existing internal provider tests still pass
- existing send-status, send-attempts, readiness, cancellation, and email-sends tests still pass

## Validation

Run:

```sh
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/api exec vitest run src/tests/background-jobs.test.ts
pnpm --filter @syrantis/api exec vitest run src/tests/draft-send-attempts.test.ts src/tests/draft-send-status.test.ts src/tests/draft-send-readiness.test.ts src/tests/draft-send-cancellation.test.ts src/tests/email-sends.test.ts
pnpm test
SEND_EMAIL_PROVIDER=resend RESEND_API_KEY=prod_like_fake_key RESEND_TO_ALLOWLIST=blocked@example.com RESEND_FROM_EMAIL=prod-from@example.test RESEND_REPLY_TO=prod-reply@example.test SEND_EMAIL_RECIPIENT_ALLOWLIST=blocked@example.com RESEND_RECIPIENT_ALLOWLIST=blocked@example.com EMAIL_ALLOWED_DOMAINS=blocked.example pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

## Rollback

Rollback reverts the API Vitest setup/config, regression tests, and docs only. No database rollback is needed because 021M adds no migration and performs no data repair.
