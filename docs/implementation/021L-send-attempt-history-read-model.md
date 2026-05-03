# 021L Send Attempt History Read Model

## Summary

Implemented a read-only draft send attempt history read model.

Route:

```http
GET /api/drafts/:id/send-attempts
```

The route lists safe send attempt status history for one visible draft in the current workspace. It does not mutate, enqueue background jobs, write activity logs, or call providers.

## Files Changed

- `packages/shared/src/contracts/drafts.ts`
  - Adds query, output, and success schemas for send attempts.
- `apps/api/src/repositories/draft-send-history.ts`
  - Adds a workspace-scoped repository query that verifies the draft and reads only safe `email_sends` columns.
- `apps/api/src/services/draft-send-history.ts`
  - Maps rows to the safe DTO and computes pagination / attempt numbers.
- `apps/api/src/routes/drafts.ts`
  - Adds `GET /api/drafts/:id/send-attempts` behind `tenantGuard`.
- `apps/api/src/tests/draft-send-attempts.test.ts`
  - Adds route regression coverage.
- `docs/specs/021L-send-attempt-history-read-model.md`
  - Adds the issue spec.
- `docs/implementation/021L-send-attempt-history-read-model.md`
  - Adds this implementation report.

## DTO

Allowed attempt fields:

- `attemptNumber`
- `status`
- `createdAt`
- `updatedAt`
- `sentAt`
- `failedAt`
- `errorCode`

Response shape:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "attempts": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 0,
      "totalPages": 0,
      "hasMore": false
    }
  }
}
```

## Forbidden Fields

The response intentionally excludes:

- `email_sends.id`
- `workspaceId`
- nested attempt `draftId`
- provider
- provider message ID
- recipient fields
- subject and body content
- metadata JSON
- payload JSON
- raw error messages
- background job internals
- AI prompt, output, cost, and token fields

## Behavior

- Missing session returns `401`.
- Missing or cross-workspace draft returns `404`.
- Archived drafts follow existing draft read-model convention and return `404`.
- Draft with no sends returns `200` with `attempts: []`.
- Attempts sort by `created_at ASC, id ASC`.
- `attemptNumber` remains stable across pages by using `offset + index + 1`.
- Invalid `page`, `pageSize`, or client-provided `workspaceId` returns the existing invalid request shape.

## Security Notes

- `workspaceId` comes from `tenantGuard` / session context only.
- The route rejects client-provided `workspaceId` in query params.
- The repository filters by both `draftId` and `workspaceId`.
- The repository selects only status/timestamp/error-code fields.
- No migration was added.
- No worker behavior changed.
- No provider call was added.
- No background job or activity log is created.

## Tests Run

```sh
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/api exec vitest run src/tests/draft-send-attempts.test.ts
pnpm --filter @syrantis/api exec vitest run src/tests/draft-send-status.test.ts src/tests/draft-send-readiness.test.ts src/tests/draft-send-cancellation.test.ts src/tests/background-jobs.test.ts src/tests/email-sends.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

All checks passed.

## Security Greps

```sh
grep -RniE "provider_message_id|providerMessageId" apps/api/src/routes packages/shared/src/contracts | grep -i "send-attempt" || true
grep -RniE "subject|textBody|htmlBody|text_body|html_body|body|email|to|from|cc|bcc|last_error_message|metadata_json|payload_json" apps/api/src/routes apps/api/src/services apps/api/src/repositories packages/shared/src/contracts | grep -i "send-attempt" || true
grep -RniE "provider\\.send|Resend|resend|fetch\\(" apps/api/src/routes | grep -i "send-attempt" || true
grep -RniE "workspaceId.*body|workspaceId.*query|workspaceId.*params|workspaceId.*req" apps/api/src/routes apps/api/src/services apps/api/src/repositories | grep -i "send-attempt" || true
grep -RniE "activity_logs|createActivity|background_jobs|enqueue|createJob" apps/api/src/routes apps/api/src/services | grep -i "send-attempt" || true
```

All security greps returned no findings.

## Production Validation

1. Pull main on production.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm --filter @syrantis/db verify-migration-files`.
4. Run `pnpm --filter @syrantis/db migrate`.
5. Run `pnpm --filter @syrantis/db verify-schema`.
6. Run `pnpm build`.
7. Run API import safety without `DATABASE_URL`.
8. Restart API if needed.
9. Log in.
10. Create a draft or reuse a test draft.
11. Request approval.
12. Approve.
13. Request send.
14. Run `worker:once`.
15. Call `GET /api/drafts/:id/send-attempts`.
16. Verify the response contains the queued attempt and no provider message ID, provider, PII, or content.
17. Verify `GET /api/drafts/:id/send-status` still works.

## Rollback

Revert code and docs only. No database rollback is needed because 021L adds no migration and performs no data repair.
