# 020C - AI Scoring Read Model

## Scope

Expose tenant-protected read-only APIs for consuming business scoring results stored in `lead_scores`.

This issue adds:

- `GET /api/leads/:id/score`
- `GET /api/leads/:id/scores`
- public DTO contracts for lead score read models
- repository/service reads backed by explicit `lead_scores` projections
- tests for latest score, history, pagination, forbidden fields, and regressions

No migration is required.

## Anti-Scope

020C does not:

- call OpenRouter or any AI provider
- trigger scoring
- mutate `leads`
- insert activity logs for GET reads
- expose `ai_runs`
- expose prompt, output, provider, job, token, cost, or raw error fields
- add UI
- add worker behavior
- add Resend or email sending behavior

## Routes

### `GET /api/leads/:id/score`

Returns the latest score for a lead, ordered by `lead_scores.created_at DESC`.

Behavior:

- protected by `tenantGuard`
- uses `withWorkspaceDb`
- verifies lead ownership with `leads.id` and `leads.workspace_id`
- missing or cross-workspace lead returns `404`
- no score returns `200` with `data: null`
- no mutation and no activity log

### `GET /api/leads/:id/scores`

Returns score history for a lead, ordered by `lead_scores.created_at DESC`.

Query:

- `limit`: default `20`, max `50`
- `cursor`: ISO 8601 datetime based on `lead_scores.created_at`

Behavior:

- protected by `tenantGuard`
- uses `withWorkspaceDb`
- verifies lead ownership with `leads.id` and `leads.workspace_id`
- missing or cross-workspace lead returns `404`
- empty history returns `200` with `data: []`
- uses `limit + 1` to calculate `nextCursor`
- invalid cursor or limit returns `400`
- no mutation and no activity log

## Public DTO

Allowed fields:

- `id`
- `leadId`
- `score`
- `qualification`
- `summary`
- `rationale`
- `recommendedAction`
- `confidence`
- `model`
- `promptTemplateId`
- `scoredAt`

Forbidden fields:

- `workspaceId`
- `aiRunId`
- `jobId`
- `promptJson`
- `prompt_json`
- `inputPayload`
- `input_payload`
- `outputJson`
- `output_json`
- `outputPayload`
- `output_payload`
- `outputText`
- `output_text`
- `errorMessage`
- `error_message`
- `finishReason`
- `finish_reason`
- `inputTokens`
- `input_tokens`
- `outputTokens`
- `output_tokens`
- `costEstimateMicroUsd`
- `cost_estimate_micro_usd`
- `costEstimateCents`
- `cost_estimate_cents`
- raw provider output
- raw prompt
- raw error body

## Security

`workspaceId` is never accepted from the client. Routes derive tenant context from `tenantGuard` and pass it into the service layer.

Repository reads filter by both `workspaceId` and `leadId`. Cross-workspace leads are invisible and return the same `404` as missing leads.

The read model selects only explicit `lead_scores` columns and does not join or expose `ai_runs`.

## Tests

Required validation:

- latest score success
- latest no-score behavior
- missing lead `404`
- cross-workspace lead `404`
- empty history
- descending order
- cursor pagination
- limit and cursor validation
- forbidden fields absent from responses
- existing score request, worker, worker ops, and email send regressions

## Production Validation

1. Deploy code after normal checks.
2. Confirm no migration is expected.
3. Use a lead with an existing `lead_scores` row.
4. Call `GET /api/leads/:id/score`.
5. Call `GET /api/leads/:id/scores?limit=10`.
6. Verify forbidden fields are absent.
7. Verify missing or cross-workspace lead returns `404`.
8. Verify GET calls do not create `activity_logs`.

## Rollback

Rollback is code revert only. No migration or data cleanup is required.
