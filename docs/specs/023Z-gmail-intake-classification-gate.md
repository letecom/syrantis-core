# 023Z Gmail Intake Classification Gate

## Scope

Add a conservative Gmail intake gate before public inbound message lead creation.

The gate is deterministic and rule-based. It ignores only obvious machine noise and keeps
human-looking or ambiguous mail in the normal lead pipeline with review/low-confidence metadata.

## Non-Goals

- No inbox UI, ignored-email list, settings UI, client role, Gmail OAuth, backend Gmail API, draft
  queue, approvals, sends, `email_sends`, or provider calls.
- No OpenRouter, Google, Gmail, Resend, or `fetch` call from intake or classification.
- No company context, contact history, or response personalization in the intake route.

## Data Model

Add `intake_classifications`:

- `id`
- `workspace_id`
- `external_id`
- `classification`: `leadable`, `ignored`, `unknown`
- `category`
- `action`: `create_lead`, `ignore`, `review`
- `confidence`: `high`, `medium`, `low`
- `reason_code`
- `diagnostic_trace_id`
- `suggested_labels`
- `lead_id`
- `created_at`

The table has `unique(workspace_id, external_id)`, RLS enabled, FORCE RLS, and the standard
`tenant_isolation_intake_classifications` policy using `app.current_workspace_id`.

Forbidden PII columns such as subject/body/from/to/contact/provider payload/prompt/output are not
present.

## Route Behavior

`POST /api/intake/inbound-message` keeps API-key authentication and rejects client-provided
workspace/tenant identity. `workspaceId` is resolved only through the existing workspace API key
lookup.

The route normalizes `externalId` from `externalId` or `messageId`; if absent, the request remains
non-idempotent as before.

Flow:

1. Check `intake_classifications` by `workspace_id + external_id`.
2. Existing row with `lead_id` returns `idempotent_replay`.
3. Existing row without `lead_id` returns `idempotent_ignored`.
4. New row is classified inside the workspace transaction.
5. Ignored messages insert classification, write one safe activity log, and stop.
6. Leadable/unknown messages create the existing lead and `score_lead` job, then attach `lead_id`
   to the classification row.

## Safe Response

Responses include only safe fields:

- `result`
- `intakeAction`
- `leadId` and `scoringJobId` only for created/replay outcomes
- `diagnosticTraceId`
- `classification: { category, action, confidence, reasonCode }`
- optional `suggestedLabels` for ignored outcomes

No email, subject, body, workspace ID, API key material, raw metadata, provider ID, prompt, or
output is returned.

## Apps Script

The real `/app/client-install` template `docs/templates/syrantis-gmail-bridge.gs` creates:

- `Syrantis/Processed`
- `Syrantis/Ignored`
- `Syrantis/Failed`

It maps `created`/`idempotent_replay` to Processed and `ignored`/`idempotent_ignored` to Ignored.
It logs only message ID, result, category/reasonCode, diagnostic trace ID, and HTTP status.
