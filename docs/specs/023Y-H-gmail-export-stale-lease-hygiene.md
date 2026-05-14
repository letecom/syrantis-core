# 023Y-H - Gmail Export Stale Lease Hygiene

## Summary

023Y surfaced Gmail Export `attention_required` in the client cockpit when
`drafts.metadata_json.gmailExport` contained expired export leases. These leases belong to the
Gmail Draft Export Bridge and are unrelated to `background_jobs` leases.

023Y-H adds one bounded admin/founder hygiene route to diagnose and expire stale Gmail export lease
fields on drafts. It does not touch Gmail, Apps Script, providers, sends, approvals, jobs, or schema.

## Route

```txt
POST /api/admin/gmail-export/stale-leases/expire
```

Request body:

```json
{
  "dryRun": true,
  "maxLimit": 25
}
```

Real execution requires:

```json
{
  "dryRun": false,
  "maxLimit": 25,
  "confirm": "EXPIRE_STALE_GMAIL_EXPORT_LEASES"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "processed": 1,
    "expired": 0,
    "skipped": 0,
    "diagnosticTraceId": "00000000-0000-4000-8000-000000000000",
    "items": [
      {
        "draftId": "00000000-0000-4000-8000-000000000001",
        "action": "would_expire",
        "previousLeaseExpiresAt": "2026-05-14T11:00:00.000Z"
      }
    ]
  }
}
```

`maxLimit` defaults to 25 and must be between 1 and 50. `items` never exceeds `maxLimit`.

## Auth And Tenant Boundary

- Session cookie authentication only.
- Admin/founder only.
- Protected by `tenantGuard`.
- Workspace is resolved only from trusted server context.
- API-key authentication is not accepted.
- Client-provided workspace or tenant identity in body, query, or headers is rejected.
- Cross-workspace drafts remain invisible because repository reads and writes are workspace scoped.

## Stale Lease Definition

A draft is expirable when its `gmailExport` metadata has lease signal, an expired
`leaseExpiresAt`, and is not exported or cancelled.

Lease signal means an existing non-empty `leaseToken` or `status = "leased"`. Invalid lease metadata
is reported as `skipped_invalid_metadata` and is not mutated.

## Mutation Semantics

Dry run is read-only:

- no draft mutation
- no activity log
- no background job, `email_sends`, or approval creation

Real execution:

- requires exact confirmation text
- clears only stale lease fields: `leaseToken`, `leaseExpiresAt`, and stale `status = "leased"`
- preserves `requestedAt`, `requestExpiresAt`, `requestSource`, exported state, and cancelled state
- does not touch subject, body, recipient, contact, lead, task, approval, send, or provider data
- writes one compact activity log per expired draft

Activity log action:

```txt
draft.gmail_export_stale_lease_expired
```

Activity log metadata contains only:

- `diagnosticTraceId`
- `draftId`
- `previousLeaseExpiresAt`
- `source: "admin_stale_lease_hygiene"`

## Safety Guarantees

- No migration.
- No Apps Script change.
- No Gmail OAuth or backend Gmail API.
- No provider call.
- No send side effects.
- No deletion of drafts or Gmail drafts.
- No cleanup of exported or cancelled drafts.
- No raw metadata, raw `gmailExport`, lease token, email, subject, body, contact, workspace ID,
  provider ID, API key material, prompt, or output in the response or activity log metadata.

## Operations Procedure

Dry run first:

```txt
POST /api/admin/gmail-export/stale-leases/expire
{"dryRun":true,"maxLimit":25}
```

If the preview shows only expected `would_expire` draft IDs, execute:

```txt
POST /api/admin/gmail-export/stale-leases/expire
{"dryRun":false,"maxLimit":25,"confirm":"EXPIRE_STALE_GMAIL_EXPORT_LEASES"}
```

Refresh `/app/client-dashboard`. The Gmail export `staleLeaseCount` should decrease after real
execution. Drafts with preserved active export requests can be leased again by the existing Apps
Script bridge.

## Non-Goals

No Gmail intake classification, Apps Script change, Gmail query, ignored labels, classifier table,
client role, settings, draft queue, send controls, auto-send, migration, background job stale
cleanup, provider call, Gmail OAuth/backend Gmail API, `email_sends` behavior, approvals behavior,
unbounded cleanup, draft deletion, Gmail draft deletion, or exported/cancelled cleanup is approved.
