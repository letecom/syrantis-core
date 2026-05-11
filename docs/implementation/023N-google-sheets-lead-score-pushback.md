# 023N - Google Sheets Lead Score Pushback Implementation

## Summary

Implemented a separate `pushback_lead_score` background job for successful lead scoring. The
`score_lead` handler now creates `lead_scores` first, then best-effort enqueues pushback with an
IDs-only payload. Pushback failure cannot fail the scoring job.

## Files Changed

- `packages/db/migrations/0019_pushback_lead_score_job_type.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/db/src/schema.ts`
- `packages/db/src/verify/registry.ts`
- `packages/db/src/verify/verifier.test.ts`
- `packages/shared/src/contracts/background-jobs.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `apps/api/src/repositories/background-jobs.ts`
- `apps/api/src/repositories/lead-score-pushback.ts`
- `apps/api/src/services/score-lead-job-handler.ts`
- `apps/api/src/services/background-worker.ts`
- `apps/api/src/services/lead-score-pushback-job-handler.ts`
- API tests for scoring, dispatch, and lead score pushback safety
- `README.md`
- `DECISIONS.md`

## Behavior

Successful scoring now enqueues:

```json
{
  "leadId": "uuid",
  "scoreId": "uuid",
  "diagnosticTraceId": "uuid-or-null",
  "source": "score_lead"
}
```

The pushback handler validates the payload with Zod, reloads lead and score data using server-side
workspace context, checks idempotence through `activity_logs`, builds a safe `Score_Log!A:P` row,
and appends through the existing Google Sheets service-account configuration.

`Score_Log` is append-only. 023N does not update the Intake Log.

## Safety

Sheet rows may include only the intentionally allowed lead PII fields:

- `from_email`
- `contact_name`
- `subject`

The handler does not append body text, summaries, HTML, raw payloads, prompts, raw AI output,
provider payloads, credentials, tokens, API keys, or `workspaceId`.

Activity log metadata is PII-free and uses only closed safe fields. Google errors are classified to
safe codes and raw Google response/error text is not stored.

## Known Limitation

Idempotence is activity-log based. If append succeeds and the succeeding activity log write fails,
a retry can duplicate the Sheet row. This is accepted for append-only v1 and should be revisited in a
future 023O replay/status hardening issue if operational replay becomes necessary.

## Validation

Expected validation:

```bash
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- lead-score-pushback background-jobs ai-scoring scoring-status public-leads
pnpm --filter @syrantis/api typecheck
```
