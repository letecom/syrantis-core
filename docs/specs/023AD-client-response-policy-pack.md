# 023AD Client Response Policy Pack v0

## Goal

Add a bounded per-workspace response policy that tells AI draft generation how the client answers:
language, tone, signature, structure, business rules, forbidden claims, escalation rules, offer
framing, catalog summary, and a small set of style-only example replies.

This makes generated drafts feel client-specific while preserving Syrantis as a controlled
backend-first orchestration layer.

## Scope

- Add `packages/shared/src/contracts/client-response-policy.ts`.
- Store the policy under `workspace_context_profiles.context_json.responsePolicy`.
- Add session-only admin/founder routes:
  - `GET /api/client/response-policy`
  - `PUT /api/client/response-policy`
- Add `/app/response-policy` and a `Response Policy` admin nav link.
- Update `generate_ai_draft` context assembly and prompt construction to include configured policy.
- Mark safe context booleans with `responsePolicy: true|false`.
- Add compact activity logs for policy create/update.

## Non-Goals

- No migration.
- No send/export/approval behavior.
- No provider call from routes.
- No Gmail, Google, Resend, or outbound HTTP calls.
- No file upload, PDF parsing, crawler, embeddings, RAG, inbox clone, chatbot, or rich editor.
- No raw `context_json`, prompt, output, policy text, examples, signature, catalog content, or
  workspace identifier exposure in response DTOs or activity metadata.

## Contract

The policy DTO is bounded:

- `language`: `fr | en | auto`
- `tone`: `professional | warm | direct | premium | technical | custom`
- nullable bounded free text for custom tone notes, signature, greeting, closing, and catalog summary
- bounded string arrays for response structure, business rules, forbidden claims, escalation rules,
  and offer notes
- at most five bounded example replies
- `updatedAt`
- `status`: `empty | configured`

Validation rejects oversized values, workspace identifiers supplied by the client, and
credential-like material.

## Backend Behavior

`GET` returns a safe empty/default policy if no context profile or no configured policy exists.

`PUT` validates input and upserts `context_json.responsePolicy` while preserving top-level profile
columns and unrelated `context_json` keys. If no profile exists, the route creates one with only the
response policy in `context_json`.

Activity logging:

- create: `client_response_policy.created`
- update: `client_response_policy.updated`

Allowed metadata:

- `policyConfigured`
- `changedFields`
- `source: "admin_ui"`

No policy text or provider/user content is allowed in activity metadata.

## Draft Generation Behavior

`generate_ai_draft` loads response policy from workspace context during context assembly. If present,
the prompt includes strict instructions to follow it, obey forbidden claims and escalation rules, use
signature/closing when available, avoid invented prices/services outside company/policy context, and
treat examples as style guidance only.

`prior_complaint` blocking remains stronger than policy: the worker blocks before provider call, AI
run creation, or draft creation even when a policy exists.

## Frontend Behavior

`/app/response-policy` is a compact admin/founder configuration form with sections for language and
tone, greeting/closing/signature, response structure, business rules, forbidden claims, escalation
rules, offer notes, catalog summary, and example replies.

It has save and reset-local-changes controls only. It has no raw JSON panel, file input,
test-generation action, send/export/approve control, or provider integration.

## Acceptance

- Admin/founder can read and update a bounded response policy.
- Session cookie and tenant guard are required.
- API-key-only requests fail.
- Client-provided workspace identifiers fail.
- Existing workspace context fields and unrelated JSON keys are preserved.
- Draft generation can use and mark `responsePolicy`.
- No raw policy content leaks into activity logs.
- No migration or provider route call is added.
