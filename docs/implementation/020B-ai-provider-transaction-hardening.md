# 020B - AI Provider & Transaction Boundary Hardening Implementation

## Summary

Implemented provider hardening and removed the long transaction around OpenRouter calls for `score_lead`.

## Changes

- Added migration `0013_ai_provider_hardening.sql`.
- Added `ai_runs.finish_reason`.
- Added `ai_runs.cost_estimate_micro_usd`.
- Added strict model allowlist for `mistralai/mistral-small-2603`.
- Added integer pricing helper and micro-USD cost calculation.
- Hardened `OpenRouterProvider` with timeout, retry, finish reason handling, and Zod response validation.
- Refactored `score_lead` execution into prepare, provider, success persist, and failure persist phases.
- Adjusted worker dispatcher so `score_lead` is not executed inside the worker transaction wrapper.

## Transaction Boundary

`send_email` keeps the existing transactional worker path.

`score_lead` now follows this pattern:

1. `withWorkspaceDb` prepare transaction commits the redacted prompt and `ai_runs.running`.
2. OpenRouter is called with no DB transaction open.
3. `withWorkspaceDb` success or failure transaction persists the result.
4. Errors are rethrown so `background_jobs` still becomes `failed`.

This is the main 020B hardening point.

## Security

- No provider call from routes.
- No client model selection.
- No client prompt.
- No prompt or output logging.
- No OpenRouter secret in DB/logs/repo.
- No `leads` mutation.
- Activity logs remain compact.

## Cost

Pricing is centralized in `apps/api/src/services/ai/pricing.ts`.

The current OpenRouter price used is from the Mistral Small 2603 OpenRouter model page:

- `$0.15 / 1M` input tokens
- `$0.60 / 1M` output tokens

Costs are calculated and stored as integer micro-USD. `cost_estimate_cents` is derived conservatively with integer rounding.

## Production Validation

After merge:

1. Run migration `0013_ai_provider_hardening.sql`.
2. Confirm `ai_runs.finish_reason` and `ai_runs.cost_estimate_micro_usd` exist.
3. Set `AI_MODEL=mistralai/mistral-small-2603`.
4. Run `pnpm --filter @syrantis/api worker:check`.
5. Create a lead test with email and phone in `rawContent`.
6. `POST /api/leads/:id/score`.
7. Run `pnpm --filter @syrantis/api worker:once`.
8. Verify:
   - job completed
   - `ai_runs.status = success`
   - `finish_reason = stop`
   - `cost_estimate_micro_usd > 0`
   - `lead_scores` created
   - source `leads` row unchanged
   - prompt has no raw email or phone

## Rollback

Revert code and optionally drop:

```sql
ALTER TABLE ai_runs DROP COLUMN IF EXISTS finish_reason;
ALTER TABLE ai_runs DROP COLUMN IF EXISTS cost_estimate_micro_usd;
```
