# 021L Send Attempt History Read Model

## Goal

Add a safe read-only route that lists send attempts for one draft.

Route:

```http
GET /api/drafts/:id/send-attempts
```

This route is a read model. It does not execute sends, call providers, enqueue jobs, mutate data, or write activity logs.

## DTO

Success response:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "attempts": [
      {
        "attemptNumber": 1,
        "status": "pending",
        "createdAt": "2026-05-01T12:00:00.000Z",
        "updatedAt": "2026-05-01T12:00:05.000Z",
        "sentAt": null,
        "failedAt": null,
        "errorCode": null
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 1,
      "totalPages": 1,
      "hasMore": false
    }
  }
}
```

## Pagination

Query parameters:

- `page`: default `1`, minimum `1`
- `pageSize`: default `20`, minimum `1`, maximum `50`

Ordering:

- `email_sends.created_at ASC`
- `email_sends.id ASC`

`attemptNumber` is chronological and stable across pages:

```text
attemptNumber = offset + index + 1
```

## Allowed Fields

Each attempt may expose only:

- `attemptNumber`
- `status`
- `createdAt`
- `updatedAt`
- `sentAt`
- `failedAt`
- `errorCode`

## Forbidden Fields

The route must not expose:

- `email_sends.id`
- `workspaceId`
- nested `draftId` inside each attempt
- `provider`
- `provider_message_id` or `providerMessageId`
- recipient email fields
- subject, text body, HTML body, or other content
- metadata JSON
- payload JSON
- raw error message
- background job internals
- AI prompt, output, cost, or token fields

## Security And Tenant Rules

- `workspaceId` must come only from `tenantGuard` / session context.
- `workspaceId` must not be accepted from body, query, params, headers, or client state.
- Missing or cross-workspace draft returns `404`.
- Draft with no `email_sends` returns `200` with an empty attempts array.
- Archived draft behavior follows existing draft read-model conventions and returns `404`.
- The repository must query by both `draftId` and `workspaceId`.
- The repository must select only safe columns.

## Anti-Scope

No:

- webhook behavior
- Resend behavior
- delivery or bounce statuses
- database migration
- worker change
- provider call
- background job creation
- activity log creation
- terminal immutability trigger
- RLS verification
- UI
- public email-sends status route
- provider message ID exposure
- raw provider error exposure

## Tests

Required coverage:

- unauthenticated request returns `401`
- missing draft returns `404`
- cross-workspace draft returns `404`
- draft with no sends returns empty attempts
- queued internal attempt returns safe DTO
- failed then pending retry returns attempts `1`, `2`
- failed, failed, queued returns attempts `1`, `2`, `3`
- pagination first page keeps `hasMore=true`
- pagination second page returns `attemptNumber=2`
- pagination beyond total returns empty attempts and `hasMore=false`
- invalid `page` / `pageSize` uses existing invalid request shape
- forbidden provider, content, recipient, metadata, payload, raw error, job, and AI fields are absent
- route creates no activity logs
- route creates no background jobs
- route makes no provider calls
- existing send-status, send-readiness, cancel-send, background job, and email-send tests still pass

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

Rollback reverts route, service, repository, shared contract, tests, and docs only. No database rollback is needed because 021L adds no migration and performs no data repair.
