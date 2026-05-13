# 023R-QA2A Hotfix - Provider Boundary

## Summary

Fixed the draft model path so `AI_DRAFT_MODEL=google/gemini-3.1-flash-lite` passes through the OpenRouter provider boundary end to end.

The provider now validates only the explicit model argument it receives from the caller. It no longer calls the env-aware scoring resolver and does not re-read `AI_MODEL` or `AI_DRAFT_MODEL`.

## Files

- `apps/api/src/services/ai/pricing.ts`
- `apps/api/src/services/ai/openrouter-provider.ts`
- `apps/api/src/tests/ai-draft-generation.test.ts`
- `apps/api/src/tests/ai-scoring.test.ts`
- `README.md`

## Behavior

- Added `assertAllowedAiModel(model)` as a pure registry validator with no env fallback.
- Kept scoring resolver behavior unchanged:
  `input || AI_MODEL || mistralai/mistral-small-2603`
- Kept draft resolver behavior unchanged:
  `input || AI_DRAFT_MODEL || AI_MODEL || mistralai/mistral-small-2603`
- Updated `OpenRouterProvider` to validate `input.model` with the pure helper.
- Provider completion metadata and cost calculation now use the explicit validated model, not a provider-echoed model name.

## Safety

No route, schema, migration, job type, worker runtime, email, approval, Google Sheets, Gmail, Caddy, systemd, or UI behavior changed.

Activity log safety remains unchanged: no prompt, output, cost, token, provider raw response, draft body, or PII is written to activity metadata.

## Migration

No migration was added.

Migration state remains 21 SQL files and 21 journal entries.

## Validation

Regression tests cover:

- pure validator accepts `google/gemini-3.1-flash-lite`
- pure validator rejects unsupported IDs
- provider accepts explicit Gemini even when env model variables are invalid
- draft generation passes Gemini to provider and records it in `ai_runs.model_used`
- scoring ignores `AI_DRAFT_MODEL`
- unsupported `AI_DRAFT_MODEL` fails before provider call or AI run creation

## Rollback

Rollback is code-only. Revert the files listed above.
