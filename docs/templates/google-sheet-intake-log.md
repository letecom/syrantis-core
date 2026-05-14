# Google Sheet Intake Log Template

## Objective

This template defines the client-side Intake Log used by the Gmail -> Apps Script -> Syrantis
public inbound message validation pack. It can be used alongside the combined client bridge in
`docs/templates/syrantis-gmail-bridge.gs`.

The Sheet is an operational client validation log. It is not a raw email archive, API response
store, audit database, or secret store.

## Exact Columns

```csv
timestamp,source,gmailMessageId,gmailThreadId,fromEmail,contactName,subject,receivedAt,httpStatus,success,isReplay,diagnosticTraceId,leadId,scoringJobId,externalId,errorCode,errorMessageSafe,retryCount
```

## Allowed Fields

- `timestamp`: Apps Script processing timestamp.
- `source`: bounded client source tag, usually `gmail_apps_script_client`.
- `gmailMessageId`: Gmail message ID used to build the external ID.
- `gmailThreadId`: Gmail thread ID for client-side traceability.
- `fromEmail`: sender email extracted from Gmail.
- `contactName`: optional display name extracted from Gmail.
- `subject`: subject truncated to the public intake contract limit.
- `receivedAt`: Gmail message received timestamp.
- `httpStatus`: Syrantis API response status.
- `success`: boolean success marker.
- `isReplay`: boolean idempotency replay marker.
- `diagnosticTraceId`: safe Syrantis diagnostic trace ID.
- `leadId`: safe Syrantis lead ID returned by the API.
- `scoringJobId`: safe Syrantis score job ID returned by the API.
- `externalId`: deterministic `gmail:<messageId>` idempotency key.
- `errorCode`: bounded error code when available.
- `errorMessageSafe`: generic safe error text, not a raw response.
- `retryCount`: number of retries used before final outcome.

## Forbidden Fields

Do not add these fields to the Sheet:

- API keys, tokens, authorization headers, or key hashes.
- `bodyText`, email body summaries, raw MIME, HTML bodies, or attachments.
- Raw API requests, raw API responses, raw payloads, or debug dumps.
- `workspaceId`, tenant IDs, internal auth context, or database credentials.
- Prompt text, AI output, scoring rationale, provider IDs, or provider payloads.

## Safe Example Row

```csv
2026-05-11T10:15:30.000Z,gmail_apps_script_client,18fabc1234567890,18fabc1234560000,client@example.com,Client Example,Demande devis chauffage,2026-05-11T10:14:02.000Z,201,true,false,0b02a2b4-0000-4000-9000-000000000000,1f08a11b-0000-4000-9000-000000000000,7c531a6d-0000-4000-9000-000000000000,gmail:18fabc1234567890,,,0
```

## PII Policy

This Sheet contains bounded client-side PII because Gmail sender fields and subjects are useful for
manual validation. Keep the Sheet restricted to the minimum client/operator group and avoid
copying rows into tickets, screenshots, shared chats, or public documents.

Never write API keys, `bodyText`, email body summaries, raw API payloads, or raw API responses to
the Sheet. Restrict sharing in Google Drive, remove public links, and delete the Sheet after the
validation window if it is no longer needed.
