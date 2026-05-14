# 023Y-H - Implementation Report

## Summary

Added a bounded session-only admin/founder route to preview and expire stale Gmail export leases in
`drafts.metadata_json.gmailExport`. This addresses cockpit `staleLeaseCount` caused by expired Gmail
Draft Export Bridge leases without changing Apps Script, Gmail, providers, sends, approvals, jobs,
or schema.

## Files Changed

- `packages/shared/src/contracts/gmail-export-stale-lease.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/gmail-export-stale-lease.repository.ts`
- `apps/api/src/services/gmail-export-stale-lease.ts`
- `apps/api/src/routes/admin/gmail-export-stale-leases.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/tests/gmail-export-stale-lease.test.ts`
- `docs/specs/023Y-H-gmail-export-stale-lease-hygiene.md`
- `docs/implementation/023Y-H-gmail-export-stale-lease-hygiene.md`
- `README.md`

## Behavior

- Added `POST /api/admin/gmail-export/stale-leases/expire`.
- Body defaults to `dryRun: true` and `maxLimit: 25`.
- Real execution requires `confirm: "EXPIRE_STALE_GMAIL_EXPORT_LEASES"`.
- The route is protected by `tenantGuard` and allows only admin/founder session users.
- API-key-only requests are rejected because no session cookie is present.
- Client-provided workspace or tenant identity is rejected in body, query, and headers.
- Dry run returns `would_expire` previews and skip diagnostics with no mutation or activity log.
- Real execution clears stale lease fields and writes one safe activity log per expired draft.

## Stale Lease Handling

The implementation uses the existing Gmail export metadata shape:

- `status`
- `requestedAt`
- `requestExpiresAt`
- `requestSource`
- `leaseToken`
- `leaseExpiresAt`
- `exportedAt`
- `cancelledAt`
- `source`

An expirable stale lease has lease signal, a parseable `leaseExpiresAt <= now`, and is not exported
or cancelled. Lease signal is a non-empty `leaseToken` or `status = "leased"`.

Real expiration sets `leaseToken` and `leaseExpiresAt` to `null`. If stale `status` was `leased`, it
is normalized back to `requested` when request metadata exists, otherwise to `null`. Request fields
are preserved so a still-active request can be leased again by the existing pending route.

## Safety Notes

- No migration.
- No Apps Script template change.
- No Gmail OAuth or backend Gmail API.
- No provider, Google, OpenRouter, Resend, or fetch call.
- No background job, `email_sends`, approval, send, or Gmail side effect.
- No subject, body, recipient, contact, lead, or draft status mutation.
- No lease token, raw metadata, raw `gmailExport`, workspace ID, PII, provider ID, API key material,
  prompt, or output in the response.
- Activity log metadata contains only `diagnosticTraceId`, `draftId`, `previousLeaseExpiresAt`, and
  `source`.

## Checks

Focused validation performed during implementation:

```txt
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- gmail-export-stale
```

The full required command set is expected in the final handoff for this issue:

```txt
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- gmail-export-stale
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

## Rollback

Rollback is code/docs-only:

1. Remove the stale lease shared contract and activity log enum value.
2. Remove the backend repository, service, route, route registration, and tests.
3. Remove the 023Y-H docs and README note.

No migration rollback is required.
