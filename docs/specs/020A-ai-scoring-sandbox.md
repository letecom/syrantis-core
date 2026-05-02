# 020A - AI Scoring Sandbox

## Goal

Allow an authenticated workspace user to request AI scoring for a lead through an asynchronous `score_lead` background job.

020A is a sandboxed foundation only:

- no synchronous LLM call from Hono routes
- no client-provided prompt
- no automatic mutation of `leads.score`, `leads.score_reason`, or lead status
- no provider call outside the OpenRouter provider module
- no raw PII in prompt snapshots or activity logs

## Existing Schema Audit

`ai_runs` already exists in the initial database schema and migration. 020A reuses it instead of creating a duplicate table.

The existing table had historical fields such as `skill_name`, `prompt_file`, `prompt_hash`, `input_payload`, `output_payload`, `model_used`, `cost_cents`, `latency_ms`, `status`, and `created_at`.

020A adds only additive audit columns needed for lead scoring:

- `job_id`
- `reference_type`
- `reference_id`
- `purpose`
- `provider`
- `prompt_template_id`
- `prompt_json`
- `output_json`
- `input_tokens`
- `output_tokens`
- `cost_estimate_cents`
- `updated_at`

The status check is expanded additively to allow `pending` and `running` while preserving `success`, `error`, `cached`, and `fallback`.

## Data Model

`background_jobs.type` accepts `score_lead`.

`score_lead` payload:

```json
{
  "leadId": "uuid"
}
```

`workspaceId` is not in the payload because it is already on `background_jobs.workspace_id`.

`lead_scores` stores immutable scoring results. Multiple scores per lead are allowed; the latest score is read by `created_at desc`.

`lead_scores` has forced RLS, tenant isolation policy, and app-only grants. `syrantis_worker` receives no direct access.

## API

`POST /api/leads/:id/score`

Protected by `tenantGuard`.

Behavior:

- derives `workspaceId` from trusted server context
- returns `404` for missing or cross-workspace leads
- creates `background_jobs.status = pending`, `type = score_lead`
- writes compact activity log `lead.score_requested` with `{ jobId }`
- returns `202`

No OpenRouter call, prompt construction, or lead mutation occurs in the route.

## Worker

The existing worker dispatcher handles `score_lead`.

The worker claim remains global through the worker connection. Business execution re-enters tenant context with `withWorkspaceDb(job.workspaceId, tx => ...)`.

Handler flow:

1. Load lead, contact role title, and organization sector/status inside the workspace.
2. Redact PII.
3. Create `ai_runs.status = running`.
4. Call `AiProvider.complete()`.
5. Parse strict JSON.
6. Update `ai_runs.status = success` and insert `lead_scores`.
7. Write compact activity logs `ai_run.started`, `ai_run.completed`, and `lead.scored`.

On provider or parse errors, the handler updates `ai_runs.status = error`, logs `ai_run.failed`, and rethrows so the job is marked failed.

Failure audit is durable: if scoring fails, the handler writes the final `ai_runs.status = error` row in a separate tenant-scoped `withWorkspaceDb` transaction before rethrowing. This preserves the audit even though the worker transaction rolls back and the background job is marked `failed`.

## Provider Boundary

OpenRouter is encapsulated in `apps/api/src/services/ai/openrouter-provider.ts`.

The only allowed endpoint is:

`https://openrouter.ai/api/v1/chat/completions`

The API key is read only from `OPENROUTER_API_KEY`. `AI_MODEL` can override the default model; otherwise `openai/gpt-4o-mini` is used.

## PII Redaction

The prompt uses only redacted lead signals:

- lead source/status
- redacted/truncated raw content
- safe structured metadata keys
- contact role title
- organization sector/status

Emails and phone numbers are masked by regex. Contact names, organization names, addresses, websites, emails, and phone numbers are not included in prompt snapshots.

Provider output parsing accepts strict JSON, JSON fenced in Markdown, and a single JSON object embedded in surrounding text. Invalid JSON and invalid schema remain hard failures and do not create `lead_scores`.

## Rollback

Rollback is a code revert plus a down migration if needed:

- drop `lead_scores`
- remove additive `ai_runs` columns/indexes if desired
- restore `background_jobs_type_check` without `score_lead`

Pending `score_lead` jobs may fail if the handler is removed. Source lead rows remain unmodified.
