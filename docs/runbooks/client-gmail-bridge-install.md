# Client Gmail Bridge Install Runbook

## Objective

Install the client-owned Google Apps Script bridge for:

```txt
Gmail intake -> Syrantis public inbound API
Syrantis requested drafts -> Gmail draft creation -> Syrantis export confirm
```

This runbook does not approve backend changes, migrations, Gmail OAuth, Gmail sending, Apps Script
web apps, provider calls, workers, `email_sends`, approvals, or deployment changes.

## Prerequisites

- Founder/admin access to Syrantis admin.
- Client Gmail account with Apps Script access.
- Client Google Sheet if intake validation logging is needed.
- Workspace API key created in Syrantis admin at `/app/api-keys`.

## 1. Create The API Key

1. Open Syrantis admin at `/app/api-keys`.
2. Create a dedicated key for this client bridge.
3. Copy it once into Google Apps Script Script Properties.
4. Do not paste the key into source code, docs, Sheets, screenshots, issue comments, or shell
   history.

## 2. Add The Apps Script Template

1. Open Google Apps Script from the client-owned Google account or Sheet.
2. Replace the script source with `docs/templates/syrantis-gmail-bridge.gs`.
3. Save the project.

The template uses only `PropertiesService.getScriptProperties()` for configuration. It does not
hardcode API keys, does not send email, and does not create Gmail drafts unless
`EXPORT_ENABLED=true`.

## 3. Configure Script Properties

Use `docs/templates/client-script-properties.md` as the exact property list.

Required values:

- `SYRANTIS_API_BASE=https://api.syrantis.fr`
- `SYRANTIS_API_KEY=<created from admin UI>`
- `INTAKE_ENABLED=true|false`
- `EXPORT_ENABLED=true|false`
- `SYRANTIS_SOURCE=gmail_apps_script_client`
- `SYRANTIS_GMAIL_QUERY=subject:"[SYRANTIS-E2E]" newer_than:1d -label:"Syrantis/Processed" -label:"Syrantis/Failed"`
- `INTAKE_BATCH_LIMIT=10`
- `EXPORT_BATCH_LIMIT=5`

## 4. Prepare Gmail Labels

Run `setupSyrantisLabels()` once. It creates:

- `Syrantis/Processed`
- `Syrantis/Failed`

The default Gmail query excludes both labels, so successful and failed threads are not processed
again by default.

## 5. Intake Mode

Set `INTAKE_ENABLED=true` only when selected Gmail messages should be sent to:

```txt
POST /api/intake/inbound-message
```

The script sends the public intake contract fields and logs only safe operational messages. It must
not log body text, raw responses, API key material, authorization headers, or raw payloads.

## 6. Export Mode

Set `EXPORT_ENABLED=true` only when the client is ready to receive native Gmail drafts.

The script pulls:

```txt
GET /api/drafts/gmail-export-pending?limit=N
```

It creates Gmail drafts with `GmailApp.createDraft(...)`, then confirms:

```txt
POST /api/drafts/:id/gmail-export-confirmed
```

Confirmation includes the lease token in the request body, but the script must never log that token.
The script never calls Gmail send APIs.

## 7. Admin Operations

Use Syrantis admin:

- `/app/client-install` to copy the final Apps Script template and Script Properties table.
- `/app/gmail-export` to load one draft status, request export, cancel before lease, and refresh.
- `/app/api-keys` to create or revoke the bridge API key.

## Rollback

1. Set `INTAKE_ENABLED=false` and `EXPORT_ENABLED=false`.
2. Remove Apps Script time triggers.
3. Revoke the dedicated workspace API key in `/app/api-keys`.
4. Keep any validation Sheet restricted until it is deleted or archived.
