# Client Loop Validation Runbook

## Objective

Validate the safe client loop after installing the Gmail bridge:

```txt
Gmail message -> Apps Script intake -> Syrantis lead/scoring/draft
Admin requests Gmail export -> Apps Script creates Gmail draft -> Syrantis marks exported
```

This runbook is validation-only. It does not approve backend changes, direct database access by
agents, Gmail OAuth, sending, provider calls, worker changes, migrations, or deployment.

## Safety Rules

- Do not expose API keys, authorization headers, lease tokens, email bodies, raw API responses,
  raw metadata, prompts, outputs, provider IDs, or workspace context.
- Keep Google Sheets sharing restricted.
- Keep Gmail test messages bounded and approved for validation.
- Do not send Gmail drafts automatically.

## 1. Validate Install State

1. Open `/app/client-install`.
2. Confirm the template matches `docs/templates/syrantis-gmail-bridge.gs`.
3. Confirm Script Properties match `docs/templates/client-script-properties.md`.
4. Confirm `INTAKE_ENABLED` and `EXPORT_ENABLED` are set intentionally.

## 2. Validate Intake

1. Use a bounded Gmail query such as:

```txt
subject:"[SYRANTIS-E2E]" newer_than:1d -label:"Syrantis/Processed" -label:"Syrantis/Ignored" -label:"Syrantis/Failed"
```

2. Set `INTAKE_ENABLED=true`.
3. Run `runSyrantisGmailBridge()`.
4. Confirm processed threads receive `Syrantis/Processed`.
5. Confirm ignored threads receive `Syrantis/Ignored`.
6. Confirm failed threads receive `Syrantis/Failed`.

Expected Syrantis API behavior:

- New intake returns HTTP `201`.
- Idempotent replay returns HTTP `200`.
- Ignored intake returns a success DTO with `result = ignored` or `idempotent_ignored` and creates
  no lead or score job.
- The script does not log body text or raw response bodies.

## 3. Validate Draft Export Request

1. Open `/app/gmail-export`.
2. Paste one draft ID.
3. Click `Load Status`.
4. Confirm the page shows only safe DTO fields: statuses, readiness flags, timestamps, blocking
   reasons, and counts.
5. Click `Request Export` only when the draft is ready.
6. Refresh status.

Expected request behavior:

- Request stores a short-lived admin export request.
- Old unrequested drafts remain inert.
- No `workspaceId` is sent by the frontend.
- No draft subject, body, recipient email, contact name, contact ID, raw metadata, lease token,
  provider ID, prompt/output, or API key material is rendered.

## 4. Validate Gmail Draft Creation

1. Set `EXPORT_ENABLED=true`.
2. Run `runSyrantisGmailBridge()`.
3. Confirm a native Gmail draft appears in the client Gmail account.
4. Confirm `/app/gmail-export` reports the draft as exported after refresh.

Expected export behavior:

- Apps Script pulls only explicitly requested active drafts.
- Apps Script confirms with the lease token after `GmailApp.createDraft(...)`.
- Apps Script never logs the lease token, body text, raw response body, authorization header, or API
  key.
- Apps Script never sends email.

## 5. Validate Cancel Before Lease

1. Request export for a ready draft.
2. Before Apps Script leases it, click `Cancel Export`.
3. Refresh status.

Expected:

- Status becomes cancelled.
- Pending export pull does not return the cancelled draft.
- Cancel is unavailable once the draft is leased or exported.

## 6. Close Validation

1. Set `INTAKE_ENABLED=false` and `EXPORT_ENABLED=false` unless the client bridge is approved for
   continued operation.
2. Revoke temporary validation keys.
3. Remove temporary Apps Script triggers.
4. Keep only safe IDs and timestamps in implementation notes.
