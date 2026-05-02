# 020A - AI Scoring Sandbox Implementation

## Summary

Implemented asynchronous lead scoring through a `score_lead` background job. The HTTP route only enqueues work; all provider interaction happens in the worker path.

## Files

- Database schema adds `score_lead`, additive `ai_runs` audit columns, and `lead_scores`.
- Migration `0012_ai_scoring_sandbox.sql` applies the additive DB changes with RLS/FORCE.
- Shared contracts expose `score_lead`, strict scoring output, and compact activity log actions.
- API route `POST /api/leads/:id/score` enqueues a pending job.
- Worker dispatcher now handles `score_lead`.
- AI modules include PII redaction, versioned prompt, provider interface, and OpenRouter provider.

## Audit Decision

`ai_runs` already existed in `packages/db/src/schema.ts` and migration `0000`. 020A reuses that table. No duplicate table was created.

The migration adds only compatible columns needed for job audit and prompt/output snapshots. The existing status values are preserved, and `pending`/`running` are added for the worker lifecycle.

## Security Notes

- `workspaceId` comes only from tenant context or `background_jobs.workspace_id`.
- The score route rejects client `workspaceId` and non-empty bodies.
- No prompt is accepted from the client.
- No OpenRouter call occurs in routes.
- No mutation is made to `leads`.
- Prompt snapshots store redacted data only.
- Activity logs omit prompt content, raw provider output, email, phone, raw lead content, and secrets.
- `syrantis_worker` receives no direct grants to `ai_runs` or `lead_scores`.

## Provider

`OpenRouterProvider` is the only module with the OpenRouter endpoint and the only module that reads `OPENROUTER_API_KEY`.

Default model: `openai/gpt-4o-mini`.

Override with `AI_MODEL`.

## Production Validation Plan

After merge:

1. Sync main and install dependencies.
2. Run tests, typecheck, lint, build, and API import safety.
3. Apply migration `0012_ai_scoring_sandbox.sql`.
4. Set `OPENROUTER_API_KEY` and optional `AI_MODEL`.
5. Run `worker:check`.
6. Create a test lead with email/phone in raw content.
7. `POST /api/leads/:id/score`.
8. Verify `background_jobs.type = score_lead`, `status = pending`.
9. Run `pnpm --filter @syrantis/api worker:once`.
10. Verify job completed, `ai_runs.status = success`, `lead_scores` row exists, and `leads` row is unchanged.
11. Verify `prompt_json` contains no raw email or phone.
12. Verify activity logs are compact.

## Rollback

Default rollback is a code revert.

If the migration must be reversed, drop `lead_scores`, remove additive `ai_runs` columns/indexes, and restore the `background_jobs_type_check` to `send_email`.

No source lead data is corrupted by rollback because 020A never mutates `leads`.
