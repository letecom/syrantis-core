# 023R - Contextual AI Draft Generation Implementation

## Summary

023R upgrades the existing `generate_ai_draft` worker path to assemble deterministic context from the lead, latest safe score, workspace company context, and contact context before calling the AI provider.

The public contract is unchanged. `POST /api/leads/:id/generate-draft` still only creates or reuses a background job. No email is sent and no approval is created.

## Files

- `apps/api/src/services/draft-generation-context.ts`
- `apps/api/src/services/generate-ai-draft-job-handler.ts`
- `apps/api/src/services/ai/draft-generation-prompt.ts`
- `apps/api/src/repositories/lead-contact-context.ts`
- `apps/api/src/repositories/workspace-context.ts`
- `apps/api/src/tests/ai-draft-generation.test.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `docs/specs/023R-contextual-ai-draft-generation.md`
- `README.md`

## Behavior

The worker now:

- assembles safe lead snippets instead of passing raw lead content
- loads the latest safe score fields when present
- loads the 023P workspace context profile and converts `context_json` to capped safe lines
- filters unsafe company context keys before prompt assembly
- reuses the 023Q contact context service with transaction-bound repository helpers
- blocks `prior_complaint` before provider call, AI run insert, or draft insert
- adds contact-warning-specific drafting instructions for cautious, non-duplicative responses
- validates model output against the new strict JSON schema
- rejects unsafe output before draft creation

## Safety

Prompt input excludes raw `leads.raw_content`, raw `leads.normalized_json`, email, phone, contact name, `workspaceId`, external IDs, raw metadata, raw payloads, provider internals, token counts, and costs.

Activity logs contain only compact IDs, context-source booleans, warning counts, safe warnings, and blocked reasons. They do not contain prompts, output, draft subject/body, lead body, email, contact names, phone, score values, company context values, raw JSON, provider IDs, token/cost data, or secrets.

`ai_runs.output_json` can store the parsed model object for audit/proof, but only draft `subject` and `bodyText` are copied to the draft row.

## Migration

No migration was added.

Migration state remains 21 SQL files and 21 journal entries.

## Checks

Commands run during implementation:

- `pnpm --filter @syrantis/api test -- src/tests/ai-draft-generation.test.ts`
- `pnpm typecheck`

Full requested validation is run before handoff.

## Risks

Company context is intentionally conservative. Keys containing `rules` are filtered, which means profile fields such as qualification or handoff rules are not used in v1 draft generation.

Lead body extraction must support historical lead rows whose only message text is in `raw_content`; 023R sanitizes, labels, and truncates the extracted snippet, but future intake should prefer durable safe subject/body fields if schema changes are approved.

## Rollback

Rollback is code-only. Revert the files listed above. No DB rollback is required.
