# 023Z Gmail Intake Classification Gate Implementation

## Files Changed

- `packages/db/migrations/0021_intake_classifications.sql`
- `packages/db/src/schema.ts`
- `packages/db/src/verify/*`
- `packages/shared/src/contracts/intake-classification.ts`
- `packages/shared/src/contracts/inbound-message.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/services/intake-classifier.service.ts`
- `apps/api/src/services/inbound-message-intake.ts`
- `apps/api/src/repositories/inbound-message-intake.ts`
- `apps/api/src/routes/inbound-message-intake.ts`
- `apps/api/src/tests/intake-classification.test.ts`
- `apps/api/src/tests/inbound-message-intake.test.ts`
- `docs/templates/syrantis-gmail-bridge.gs`
- `docs/templates/client-script-properties.md`
- `docs/runbooks/client-gmail-bridge-install.md`
- `docs/runbooks/client-loop-validation.md`
- `docs/runbooks/gmail-client-e2e.md`
- `docs/architecture/current-state.md`
- `docs/specs/023Z-gmail-intake-classification-gate.md`
- `README.md`

## Migration

Migration: `0021_intake_classifications.sql`

Adds `intake_classifications` with safe classification fields, `lead_id`, `suggested_labels`,
`unique(workspace_id, external_id)`, RLS enabled, FORCE RLS, and
`tenant_isolation_intake_classifications`.

No forbidden PII columns are present.

## Behavior

Public inbound message intake now checks classification idempotency before classification. Ignored
messages create no lead, no `score_lead` job, no draft, no approval, no `email_sends`, and no
provider call. Leadable/unknown messages continue the existing lead and score job path.

Classifier summary:

- Strong lead intent wins over weak ignore signals.
- Newsletter/bulk, no-reply/system, automated invoice/receipt, shipping notifications, job
  applications, and obvious spam are ignored.
- Support/customer requests, ambiguous supplier mail, human invoice questions, and unknown mail
  create review leads with medium/low confidence.

## Apps Script

The `/app/client-install` template now creates and uses `Syrantis/Ignored`, parses the safe intake
result, and logs only message ID, result, category/reasonCode, diagnostic trace ID, and HTTP status.

The default query remains test-safe. The broad approved query is documented:

```txt
newer_than:1d -label:"Syrantis/Processed" -label:"Syrantis/Ignored" -label:"Syrantis/Failed" -in:spam -in:trash
```

## Production Validation Notes

Before production validation:

1. Apply migration 0021.
2. Run `pnpm --filter @syrantis/db verify-schema`.
3. Confirm `select count(*) from intake_classifications` as runtime role without
   `app.current_workspace_id` returns zero rows.
4. Validate one ignored newsletter/no-reply sample and one quote/human request sample through the
   client bridge.
5. Confirm ignored samples have no lead, no score job, no approval, and no `email_sends`.

## Known Limitations

This is a conservative deterministic gate, not semantic classification. Ambiguous mail intentionally
continues into review leads.

## Verification

- `pnpm --filter @syrantis/db verify-migration-files`: exit 0.
- `pnpm --filter @syrantis/shared build`: exit 0.
- `pnpm --filter @syrantis/api test -- intake-classification`: exit 0.
- `pnpm --filter @syrantis/api test -- inbound-message-intake`: exit 0.
- `pnpm --filter @syrantis/api test`: exit 0.
- `pnpm --filter @syrantis/web test`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0.
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`:
  exit 0.
- `git diff --check`: exit 0.

`pnpm --filter @syrantis/db verify-schema` was attempted but exited 2 because `DATABASE_URL` is not
set in this workspace. No production env file was read.

Security greps were run for forbidden classification columns, provider/fetch imports in intake,
raw/PII activity metadata, client-provided workspace identity handling, API key/raw response logging
in the Apps Script template, send/approval/email_sends touch points, and protected runtime files.
