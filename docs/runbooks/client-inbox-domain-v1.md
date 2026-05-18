# Client Inbox Domain v1 Runbook

## Objective

Validate the 023AF backend foundation for the future live Client Inbox:

```txt
public inbound intake -> client_mail_items -> client Inbox list/detail -> draft edit/export request
```

This runbook does not approve UI launch, app deployment, Gmail OAuth, direct send, AI rewrite,
provider calls, Google Sheets changes, Apps Script changes, production env edits, Caddy edits, or
systemd changes.

Use placeholders only. Never paste real customer mail content, real email addresses, workspace API
keys, cookies, lease tokens, prompts, provider payloads, or secrets into docs, tickets, logs, or
screenshots.

## 1. Schema Safety

Run from the development workspace:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
```

Expected:

- migration journal includes `0022_client_mail_items`
- `client_mail_items` exists in schema verification fixtures
- RLS and FORCE RLS are expected
- `tenant_isolation_client_mail_items` is expected
- `syrantis_set_updated_at` trigger is expected
- duplicate external id is blocked within one workspace and allowed across workspaces
- multiple null external ids are allowed
- attachment metadata defaults to a JSON array

If running against a real database, do not inspect raw `body_text` or customer email values in
shared output.

## 2. Intake Validation

Submit synthetic public intake samples through the existing API-key route:

```txt
POST /api/intake/inbound-message
```

Expected for an ignored synthetic automation/noise sample:

- safe public response
- classification row created
- one `client_mail_items` row created
- no lead
- no score job
- no draft
- no approval
- no `email_sends`

Expected for a synthetic leadable/review sample:

- safe public response
- classification row created
- one `client_mail_items` row created
- lead/contact/job behavior remains as before
- mail item links to classification, lead, and contact when available

Repeat the same synthetic `externalId`.

Expected:

- the replay follows existing idempotency semantics
- no duplicate `client_mail_items` row is created for that workspace/external id

## 3. Leak Checks

For public intake responses, list route responses, activity log metadata, and background job
payloads, verify absence of:

- `bodyText`
- `body_text`
- `fromEmail`
- `from_email`
- `toEmail`
- `to_email`
- subject/body values
- workspace id
- provider ids
- raw metadata
- prompt/output
- lease token
- API key material

The dedicated detail route is the only API response in 023AF that may return selected message
`bodyText`, `fromEmail`, and `toEmail`.

## 4. Client Inbox List

Using a session cookie for a founder/admin validation user:

```txt
GET /api/client/inbox/messages?tab=all&limit=20
GET /api/client/inbox/messages?tab=ignored
GET /api/client/inbox/messages?tab=needs_review
GET /api/client/inbox/messages?tab=hot
GET /api/client/inbox/messages?tab=ready_draft
```

Expected:

- no cookie returns `401`
- non-admin/founder session returns `403`
- client-provided workspace or tenant identity returns `400`
- valid session returns safe summary items
- pagination is bounded
- response excludes subject values, full body, email addresses, workspace id, raw metadata, provider ids,
  prompt/output, lease token, and API key material

## 5. Client Inbox Detail

Using the returned `mailItemId`:

```txt
GET /api/client/inbox/messages/MAIL_ITEM_ID
```

Expected:

- no cookie returns `401`
- invalid UUID returns `400`
- unknown or cross-workspace mail item returns `404`
- valid detail returns the dedicated selected message body and email addresses
- detail excludes workspace id, raw metadata, provider ids, prompt/output, lease token, API key
  material, and raw Gmail/provider payload
- repeated GET has no side effects

## 6. Draft Edit

For a mail item linked to a draft:

```txt
PATCH /api/client/inbox/messages/MAIL_ITEM_ID/draft
```

Payload shape:

```json
{
  "subject": "Synthetic placeholder subject",
  "bodyText": "Synthetic placeholder draft body"
}
```

Expected:

- no cookie returns `401`
- unknown or cross-workspace mail item returns `404`
- mail item without a draft returns `409`
- valid edit updates the draft only
- response excludes edited subject/body
- activity log metadata excludes subject/body/from/to/body text
- no provider call, send, Gmail export, approval, `email_sends`, or background job is created

## 7. Gmail Export Wrappers

For a mail item linked to a draft:

```txt
POST /api/client/inbox/messages/MAIL_ITEM_ID/gmail-export-request
POST /api/client/inbox/messages/MAIL_ITEM_ID/gmail-export-cancel
```

Expected:

- no cookie returns `401`
- unknown or cross-workspace mail item returns `404`
- mail item without a draft returns `409`
- request/cancel behavior matches the existing 023U service rules
- no Gmail, Google API, Apps Script, provider, direct send, approval, `email_sends`, or background
  job side effect is introduced by the wrapper

## 8. Required Local Checks

Before review, run:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Also run the protected-scope greps from the 023AF issue. Any hit in web source, systemd, Caddy,
env, production runtime paths, Gmail/Google API, Resend, OpenRouter, or provider code must be
explained as pre-existing or fixed before review.
