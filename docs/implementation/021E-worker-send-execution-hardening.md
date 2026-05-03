# Issue 021E Implementation Report: Worker Send Execution Hardening

## Summary

Hardened the existing `send_email` worker handler so only `pending` email sends execute a provider path. Existing non-pending states now no-op safely without provider calls or duplicate send activity logs.

## Files Changed

- `apps/api/src/services/send-email-job-handler.ts`
- `apps/api/src/services/background-worker.ts`
- `apps/api/src/tests/background-jobs.test.ts`
- `docs/specs/021E-worker-send-execution-hardening.md`
- `docs/implementation/021E-worker-send-execution-hardening.md`

## Current Internal Provider Semantics

The current internal provider is the default when `SEND_EMAIL_PROVIDER` is unset or set to `internal`.

Internal provider execution does not call `fetch`, Resend, or any external provider. For a visible approved draft with `email_sends.status = pending`, the worker updates the existing email send to `queued`, leaves `sent_at` and `provider_message_id` null, and completes the background job through the existing worker completion path.

## Safety Properties

- Preserves existing `background_jobs` and `email_sends` status vocabularies.
- Adds no migration, table, column, index, route, provider, webhook, retry system, UI, or default provider change.
- Reads `email_sends` by `id` and `workspaceId`.
- Writes `email_sends` by `id`, `workspaceId`, and `status = pending` for execution transitions.
- Treats `queued`, `sent`, `failed`, and `cancelled` as idempotent no-op states for Issue 021E.
- Prevents duplicate `email_send.sent` or `email_send.failed` activity logs when a job reruns after the send is no longer pending.
- Sanitizes arbitrary provider failure messages into controlled stored error proof.
- Keeps activity log metadata compact and excludes contact email, subject, text body, HTML body, raw provider payloads, raw provider responses, secrets, and AI payload fields.

## Verification Plan

Required checks:

```sh
pnpm install --frozen-lockfile
pnpm --filter @syrantis/api exec vitest run src/tests/email-sends.test.ts src/tests/background-jobs.test.ts src/tests/worker-ops.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Security greps:

```sh
grep -RniE "contact\.email|subject|text_body|html_body|textBody|htmlBody|raw response|rawResponse|RESEND_API_KEY|OPENROUTER_API_KEY|DATABASE_URL" apps/api/src/services apps/api/src/repositories apps/api/src/routes | grep -i "send\|email\|worker" || true
grep -RniE "console\.(log|warn|error)|logger\.(info|warn|error|debug)" apps/api/src/services apps/api/src/repositories | grep -i "send\|email\|worker" || true
grep -RniE "OpenRouter|prompt_json|output_json|input_payload|output_payload|cost_estimate|input_tokens|output_tokens" apps/api/src/services apps/api/src/repositories apps/api/src/routes | grep -i "send\|email\|worker" || true
grep -RniE "packages/db/migrations" <(git diff --name-only) || true
```

## Rollback

Revert the send worker handler hardening, background worker error-message sanitization, added tests, and 021E docs. No database rollback is required because this issue adds no migration.
