# 023R-QA2A - Separate Draft Model Config

## Scope

Add draft-only model resolution for the existing `generate_ai_draft` worker path.

Production may set `AI_DRAFT_MODEL=google/gemini-3.1-flash-lite` to test draft generation while `score_lead` continues to use the existing `AI_MODEL` behavior.

## Anti-Scope

023R-QA2A does not add:

- migration
- DB schema change
- route change
- job type change
- Google Sheets, Gmail, webhook, Caddy, systemd, worker runtime, approval, `email_sends`, or UI behavior
- scoring model behavior change

## Model Resolution

Scoring keeps the existing resolver:

```txt
input || AI_MODEL || mistralai/mistral-small-2603
```

Draft generation uses the new draft resolver:

```txt
input || AI_DRAFT_MODEL || AI_MODEL || mistralai/mistral-small-2603
```

Both resolvers validate against the shared allowed-model registry and throw `AI_MODEL_NOT_ALLOWED` for unsupported model IDs.

## Allowed Models And Pricing

Allowed models:

- `mistralai/mistral-small-2603`
- `google/gemini-3.1-flash-lite`

Pricing is stored in integer micro-USD per 1M tokens:

- `mistralai/mistral-small-2603`: input `150000`, output `600000`
- `google/gemini-3.1-flash-lite`: input `250000`, output `1500000`

## Acceptance

- `generate_ai_draft` uses `AI_DRAFT_MODEL` when present.
- `generate_ai_draft` falls back to `AI_MODEL`, then default, when `AI_DRAFT_MODEL` is absent.
- `score_lead` does not read `AI_DRAFT_MODEL`.
- `ai_runs.model_used` records the draft model used by the provider.
- No route, job, schema, migration, email, approval, or UI behavior changes.
