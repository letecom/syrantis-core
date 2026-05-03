# 021A - AI Draft Generation Foundation Implementation

## Summary

021A adds asynchronous AI email draft generation for leads.

`POST /api/leads/:id/generate-draft` now creates or reuses a `generate_ai_draft` background job. The worker calls OpenRouter outside DB transactions, records `ai_runs`, and creates a normal `drafts` row with `status = draft` and `channel = email`.

No approval, send request, `email_sends`, `send_email` job, or Resend path is touched.

## Files

- `apps/api/src/routes/leads.ts`
- `apps/api/src/repositories/background-jobs.ts`
- `apps/api/src/repositories/lead-draft-generation.ts`
- `apps/api/src/services/lead-draft-generation.ts`
- `apps/api/src/services/background-worker.ts`
- `apps/api/src/services/generate-ai-draft-job-handler.ts`
- `apps/api/src/services/ai/draft-generation-prompt.ts`
- `apps/api/src/services/ai/pii-redaction.ts`
- `apps/api/src/services/ai/openrouter-provider.ts`
- `apps/api/src/services/ai/providers.ts`
- `apps/api/src/tests/ai-draft-generation.test.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/background-jobs.ts`
- `packages/shared/src/contracts/leads.ts`
- `packages/db/src/schema.ts`
- `packages/db/migrations/0014_generate_ai_draft_job_type.sql`
- `packages/db/migrations/meta/_journal.json`
- `docs/specs/021A-ai-draft-generation-foundation.md`

## Migration

Added one migration:

- `0014_generate_ai_draft_job_type.sql`

It only updates the existing `background_jobs_type_check` constraint to include `generate_ai_draft`.

No table was added.

## Flow

Route:

- validates the lead id
- rejects client-provided workspace or draft-generation input
- derives workspace from `tenantGuard`
- verifies lead visibility in the current workspace
- reuses an active pending/running `generate_ai_draft` job when present
- otherwise enqueues a pending job with payload `{ leadId }`
- writes compact `draft.ai_generation_requested`
- returns `202`

Worker:

- parses `GenerateAiDraftJobPayloadSchema`
- logs `background_job.claimed`
- prepares redacted context inside `withWorkspaceDb`
- inserts `ai_runs.status = running`
- calls OpenRouter outside a transaction
- persists a draft and successful `ai_runs` update inside a transaction
- logs compact success events
- on failure, updates `ai_runs.status = error` when possible, logs compact failure events, creates no draft, and rethrows

## Privacy

The prompt builder uses `draft-email-v1` and stores only redacted prompt context in `ai_runs.prompt_json`.

The redaction path excludes raw email, phone, known contact names, organization name, website, and street-like addresses from draft-generation prompt snapshots. Metadata uses the existing safe allowlist.

Activity logs intentionally omit subject, text body, HTML body, prompt JSON, output JSON, provider raw response, and secrets.

## Checks

Commands run:

- `pnpm --filter @syrantis/api test src/tests/ai-draft-generation.test.ts`
- `pnpm test`
- `pnpm typecheck`

Additional required checks are run as part of the final verification for this issue.

## Risks

The background job system currently marks handler errors as failed through the existing path rather than scheduling retries with backoff. 021A follows that existing behavior and does not redesign the worker.

The address redaction is pattern-based and should be expanded if future CRM inputs carry structured address fields into lead raw content.

## Rollback

Revert the code and migration before deployment when possible.

If the migration has already been applied, first drain or cancel any `generate_ai_draft` jobs, then restore the previous `background_jobs_type_check` constraint that only allows `send_email` and `score_lead`.
