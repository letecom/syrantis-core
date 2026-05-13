# 023Q Contact Context Read Model

## Scope

023Q adds a small, read-only internal contact context read model for a lead.

It intentionally models contact-level prior context only. It is not conversation or thread context, because Syrantis does not yet import Gmail thread history or raw email bodies.

## API

Route:

```txt
GET /api/leads/:id/contact-context
```

Auth and tenancy:

- session cookie only
- `tenantGuard`
- admin or founder role
- `workspaceId` derived only from the session
- `withWorkspaceDb` for database reads
- invalid UUID returns `400`
- no session returns `401`
- insufficient role returns `403`
- unknown or cross-workspace lead returns `404`

The route rejects client workspace or tenant material in query parameters or headers.

## Response

The route returns the project success envelope with a safe DTO:

```json
{
  "success": true,
  "data": {
    "leadId": "00000000-0000-4000-8000-000000000000",
    "contactKeyPresent": true,
    "matchedBy": "email",
    "hasPriorContext": false,
    "previousLeadCount": 0,
    "previousDraftCount": 0,
    "previousOutboundCount": 0,
    "lastPriorLeadAt": null,
    "lastOutboundAt": null,
    "lastOutboundDeliveryStatus": null,
    "warnings": []
  }
}
```

Warnings:

- `no_contact_key`
- `shared_inbox_possible`
- `repeated_inbound_recent`
- `recently_contacted`
- `prior_bounce`
- `prior_complaint`

## Contact Key Rules

The read model uses this priority:

1. Use `leads.contact_id` only when the linked `contacts` row is visible in the same workspace.
2. Use a normalized email fallback from whitelisted lead `normalized_json` keys only:
   - `fromEmail`
   - `email`
3. Return a safe no-contact-key DTO if neither key is usable.

Email normalization is lower-case plus trim with a minimal email shape check. It does not apply Gmail plus-alias canonicalization, domain matching, organization matching, subject matching, or name matching.

## Aggregates

The repository computes:

- previous leads in the same workspace with the same contact key, excluding the current lead
- drafts linked to those previous leads
- previous outbound sends linked to previous leads, linked drafts, the same safe contact id, or the same outbound `to_email`
- last prior lead timestamp
- last outbound timestamp
- latest delivery status among `delivered`, `bounced`, and `complained`

Every subquery is workspace-scoped.

## Explicit Non-Goals

- No migration.
- No new table, column, or index.
- No UI.
- No public API-key access.
- No Gmail OAuth, Gmail API, IMAP, Apps Script change, raw thread import, or raw body retrieval.
- No AI or LLM call.
- No draft generation.
- No scoring, worker, Google Sheets, or provider change.
- No activity log on GET.
- No background job creation.
- No mutation of leads, drafts, email sends, scores, activity logs, or background jobs.
- No `lead_scores` join.

The response never includes email address, contact name, subject, body fields, provider IDs, workspace ID, raw normalized JSON, raw metadata JSON, API keys, tokens, prompts, raw output, costs, or token counts.
