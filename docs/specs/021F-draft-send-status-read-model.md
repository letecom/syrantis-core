# Issue 021F: Draft Send Status Read Model

## Goal

Add a tenant-scoped, read-only draft send status read model:

`GET /api/drafts/:id/send-status`

The route lets callers observe the latest `email_sends` proof for a draft without creating work, mutating state, calling providers, exposing provider internals, or exposing raw PII/content.

## Contract

When the draft exists but has no email send rows:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "hasSend": false,
    "latestSend": null
  }
}
```

When the draft has one or more email send rows:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "hasSend": true,
    "latestSend": {
      "status": "queued",
      "requestedAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-01T12:00:05.000Z",
      "sentAt": null,
      "failedAt": null,
      "errorCode": null
    }
  }
}
```

Latest send selection is by `email_sends.created_at desc`, then `email_sends.id desc`.

## Field Mapping

- `email_sends.created_at` maps to `requestedAt`.
- `email_sends.updated_at` maps to `updatedAt`.
- `email_sends.sent_at` maps to `sentAt`.
- `email_sends.failed_at` maps to `failedAt`.
- `email_sends.last_error_code` maps to `errorCode`.
- `email_sends.last_error_message` is never exposed.

## Security

The route uses `tenantGuard`, derives `workspaceId` only from trusted server context via `getWorkspaceId(c)`, and uses `withWorkspaceDb(workspaceId)`.

Missing, archived, or cross-workspace drafts return `404`.

The response exposes only:

- `draftId`
- `hasSend`
- `latestSend.status`
- `latestSend.requestedAt`
- `latestSend.updatedAt`
- `latestSend.sentAt`
- `latestSend.failedAt`
- `latestSend.errorCode`

The response must not expose email send identifiers, workspace IDs, provider names, provider message IDs, recipient fields, draft subject/body/metadata, contact PII, background job payloads, AI payloads, token/cost fields, provider raw responses, or secrets.

## Anti-Scope

This issue does not add worker behavior, retry/backoff/dead-letter behavior, mutations, provider calls, background jobs, activity logs, migrations, UI, webhooks, CRM push-back, or any public `/api/email-sends/:id/status` route.
