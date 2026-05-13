# 023S - Gmail Draft Bridge via Apps Script

## Scope

023S adds a minimal Gmail draft export bridge for client-side Apps Script pull mode.

The bridge lets a client-owned Apps Script timer pull a small batch of already-created Syrantis AI drafts, create native Gmail drafts with recipients, and confirm export back to Syrantis.

Syrantis does not send email, does not approve drafts, does not create `email_sends`, and does not use backend Gmail OAuth.

## Architecture

Flow:

```txt
drafts.status = draft
  -> Apps Script GET pending with workspace API key
  -> Syrantis leases exportable drafts in drafts.metadata_json.gmailExport
  -> Apps Script GmailApp.createDraft(toEmail, subject, bodyText)
  -> Apps Script POST confirm with leaseToken
  -> Syrantis marks gmailExport exported
  -> human reviews/sends in Gmail
```

The API key stays in Apps Script Script Properties. Draft body is never pushed to Google Sheets.

## Routes

### `GET /api/drafts/gmail-export-pending?limit={n}`

Authentication uses the existing workspace API key bearer format:

```txt
Authorization: Bearer <syr_live_...>
```

`workspaceId` is derived only from the API key lookup. Client-provided workspace or tenant IDs are rejected.

`limit` defaults to 5 and is capped at 10.

Returned drafts must satisfy:

- `drafts.workspace_id` equals the API key workspace
- `drafts.status = 'draft'`
- non-empty `subject`
- non-empty `text_body`
- non-null `lead_id`
- same-workspace lead exists
- lead has `contact_id`
- same-workspace contact exists
- contact has a valid-enough email for `GmailApp.createDraft`
- `metadata_json.gmailExport.exportedAt` is absent or null
- no active lease, or lease expired

The endpoint writes a new 10-minute lease to `drafts.metadata_json.gmailExport`:

```json
{
  "status": "leased",
  "leaseToken": "random",
  "leaseExpiresAt": "2026-05-13T18:00:00.000Z",
  "exportedAt": null,
  "source": "apps_script"
}
```

Response item shape:

```json
{
  "draftId": "uuid",
  "leadId": "uuid",
  "toEmail": "client@example.com",
  "subject": "Subject",
  "bodyText": "Body",
  "leaseToken": "random",
  "leaseExpiresAt": "2026-05-13T18:00:00.000Z"
}
```

The response must not include `workspaceId`, `contactId`, provider IDs, AI run raw data, prompts, output, score, API key material, or `metadata_json`.

### `POST /api/drafts/:id/gmail-export-confirmed`

Body:

```json
{
  "leaseToken": "string"
}
```

The route validates that the draft belongs to the API key workspace. Missing or cross-workspace drafts return safe `404`.

If the draft is already exported, the route returns `200` idempotently:

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "status": "exported",
    "alreadyExported": true,
    "exportedAt": "2026-05-13T18:00:00.000Z"
  }
}
```

If not already exported, the current lease token must match and `leaseExpiresAt` must be in the future. Wrong, missing, or expired leases return `409` with one of:

- `GMAIL_EXPORT_LEASE_MISSING`
- `GMAIL_EXPORT_LEASE_MISMATCH`
- `GMAIL_EXPORT_LEASE_EXPIRED`

Successful confirm writes:

```json
{
  "status": "exported",
  "leaseToken": null,
  "leaseExpiresAt": null,
  "exportedAt": "2026-05-13T18:00:00.000Z",
  "source": "apps_script"
}
```

Only `metadata_json.gmailExport` is mutated. Draft subject, body, and status are not changed.

## Activity Log

Successful non-idempotent confirm writes one activity log:

- `type`: `draft.gmail_exported`
- `entity_type`: `draft`
- `entity_id`: draft ID

Allowed metadata:

- `draftId`
- `leadId`
- `source = "apps_script"`
- `exportedAt`

Forbidden metadata:

- `toEmail`
- subject or body text
- `leaseToken`
- `workspaceId`
- `contactId`
- API key material
- provider IDs
- prompt/output
- raw metadata

## Apps Script Template

```javascript
const API_BASE = "https://api.syrantis.fr";

function exportSyrantisDraftsToGmail() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("SYRANTIS_API_KEY");
  if (!apiKey) {
    console.log("SYRANTIS_API_KEY missing");
    return;
  }

  const pendingUrl = API_BASE + "/api/drafts/gmail-export-pending?limit=5";
  const pendingResponse = UrlFetchApp.fetch(pendingUrl, {
    method: "get",
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    muteHttpExceptions: true,
  });

  if (pendingResponse.getResponseCode() !== 200) {
    console.log("pending_failed status=" + pendingResponse.getResponseCode());
    return;
  }

  const payload = JSON.parse(pendingResponse.getContentText());
  const drafts = payload.data || [];

  drafts.forEach(function (draft) {
    try {
      GmailApp.createDraft(draft.toEmail, draft.subject, draft.bodyText);

      const confirmUrl =
        API_BASE + "/api/drafts/" + encodeURIComponent(draft.draftId) + "/gmail-export-confirmed";
      const confirmResponse = UrlFetchApp.fetch(confirmUrl, {
        method: "post",
        contentType: "application/json",
        headers: {
          Authorization: "Bearer " + apiKey,
        },
        payload: JSON.stringify({
          leaseToken: draft.leaseToken,
        }),
        muteHttpExceptions: true,
      });

      if (confirmResponse.getResponseCode() !== 200) {
        console.log("confirm_failed draftId=" + draft.draftId + " status=" + confirmResponse.getResponseCode());
      }
    } catch (error) {
      const message = error && error.message ? String(error.message).slice(0, 160) : "unknown";
      console.log("draft_failed draftId=" + draft.draftId + " error=" + message);
    }
  });
}
```

The template must not write the API key or draft body to a Sheet and must not log full `bodyText`.

## Anti-Scope

023S does not add:

- Google Sheet Draft Outbox
- backend Gmail OAuth
- Gmail send
- `email_sends`
- approval creation
- UI
- migration
- background job
- worker change
- provider call
- scoring or draft-generation prompt change
- Caddy, systemd, or env changes
- Gmail draft ID storage
- Gmail read/import

## Tests

Required coverage:

- API-key auth required and revoked keys rejected
- workspace isolation
- exportability filters
- active lease exclusion
- expired lease replacement
- default and max limits
- safe response shape
- metadata lease write
- confirm success and idempotency
- wrong/expired/missing lease conflicts
- cross-workspace safe not found
- safe activity log only
- no `email_sends`
- no approvals
- no draft subject/body/status mutation
- scoring and draft-generation model separation unchanged

## Rollback

Rollback is code-only:

- remove Gmail export routes
- remove Gmail export services and repository
- remove shared contracts
- remove docs and README updates

No migration rollback is required.
