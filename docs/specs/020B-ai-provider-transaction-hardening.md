# 020B - AI Provider & Transaction Boundary Hardening

## Goal

Harden the AI scoring sandbox before product exposure or automation.

020B keeps the 020A API behavior unchanged:

- `POST /api/leads/:id/score` only enqueues `background_jobs.type = score_lead`
- no provider call from Hono routes
- no client-provided model or prompt
- no automatic mutation of `leads`

## Database

Migration `0013_ai_provider_hardening.sql` adds:

- `ai_runs.finish_reason varchar(50)`
- `ai_runs.cost_estimate_micro_usd integer not null default 0`

No new table is created. `lead_scores` and `leads` are unchanged.

## Model Allowlist

The only allowed model for 020B is:

`mistralai/mistral-small-2603`

If `AI_MODEL` is absent, Syrantis uses this model. If `AI_MODEL` is set to anything else, scoring fails before any provider call.

Pricing is isolated in `apps/api/src/services/ai/pricing.ts`. Current OpenRouter pricing used for this issue is:

- input: `$0.15 / 1M tokens`
- output: `$0.60 / 1M tokens`

The persisted cost estimate uses integer micro-USD.

## Provider Hardening

`OpenRouterProvider` is the only place where `fetch` and the OpenRouter endpoint appear.

Provider behavior:

- 15 second timeout with `AbortController`
- `response_format: { type: "json_object" }`
- Zod validation of the OpenRouter response shape
- reads `choices[0].message.content`
- reads `choices[0].finish_reason`
- reads token usage
- retries HTTP `429` and `5xx` once
- retries timeout once
- fails immediately on HTTP `400`, `401`, `403`
- retries `finish_reason = length` once with doubled `maxTokens`
- fails on second `length` with `AI_FINISH_REASON_LENGTH`
- fails on `content_filter` with `AI_CONTENT_FILTERED`
- fails on unknown/empty finish reason with `AI_FINISH_REASON_UNSUPPORTED`

No prompt, provider body, or secret is logged.

## Transaction Boundary

The `score_lead` handler owns short tenant transactions and never keeps a Postgres transaction open during the OpenRouter call.

Flow:

1. Prepare transaction:
   - load lead/contact/organization
   - redact PII
   - build prompt
   - insert `ai_runs.status = running`
   - activity log `ai_run.started`
   - commit
2. Provider call:
   - OpenRouter call happens outside any DB transaction
3. Success transaction:
   - parse/validate JSON
   - insert `lead_scores`
   - update `ai_runs.status = success`
   - persist finish reason, tokens, micro-USD cost, latency
   - activity logs `ai_run.completed` and `lead.scored`
4. Failure transaction:
   - update `ai_runs.status = error`
   - persist compact error code, finish reason if available, tokens/cost if available
   - activity log `ai_run.failed`
   - rethrow so the background job becomes `failed`

## Rollback

Rollback is code revert plus optional down migration:

```sql
ALTER TABLE ai_runs DROP COLUMN IF EXISTS finish_reason;
ALTER TABLE ai_runs DROP COLUMN IF EXISTS cost_estimate_micro_usd;
```

Existing `lead_scores` remain valid.
