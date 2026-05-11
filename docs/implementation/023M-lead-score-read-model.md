# 023M Lead Score Read Model Implementation

## Summary

Implemented `GET /api/leads/:id/score-status`, a safe admin/founder read-only backend route for
lead scoring state.

The route replaces manual SQL checks for:

- latest `score_lead` job state
- latest safe `lead_scores` row
- requested lead id
- total scoring jobs and scores for the lead
- derived score status

No migration, DB schema change, UI change, worker change, provider call, AI call, Google Sheets
pushback, public API-key auth, or activity log was added.

## Files Changed

- `packages/shared/src/contracts/lead-score-status.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/repositories/scoring-status.ts`
- `apps/api/src/services/scoring-status.ts`
- `apps/api/src/routes/leads.ts`
- `apps/api/src/tests/scoring-status.test.ts`
- `apps/api/src/tests/leads.test.ts`
- `docs/specs/023M-lead-score-read-model.md`
- `docs/implementation/023M-lead-score-read-model.md`
- `README.md`

## Behavior

Route:

```txt
GET /api/leads/:id/score-status
```

Responses:

- invalid UUID: 400
- no session: 401
- non-admin/non-founder: 403
- unknown or cross-workspace lead: 404
- known lead: 200 with `LeadScoreStatusSuccessSchema`

The route runs behind `tenantGuard`, reads the workspace from server context, and passes it into the
service/repository layer explicitly.

## Data Access

The repository uses `withWorkspaceDb` and explicit Drizzle selections.

It validates lead ownership with:

- `leads.id`
- `leads.workspace_id`

It loads scoring jobs with:

- `background_jobs.workspace_id`
- `background_jobs.type = 'score_lead'`
- `background_jobs.payload_json->>'leadId' = leadId`

It does not use `background_jobs.entity_id`.

It selects only safe job fields:

- id
- status
- attempts
- timestamps
- diagnostic trace id extracted from the job payload

It loads score rows with:

- `lead_scores.workspace_id`
- `lead_scores.lead_id`

It selects only safe score fields:

- id
- score
- qualification as `scoreBand`
- confidence
- recommended action
- created timestamp

## DTO Safety

The service maps DB rows into `LeadScoreStatusDtoSchema` and validates the DTO before returning it.

The DTO excludes:

- `workspaceId`
- lead body, subject, sender, contact email, and contact name
- prompts and raw AI outputs
- raw provider outputs
- provider message IDs
- raw job payloads
- raw score payloads
- model, cost, or token internals
- `last_error_message`
- API keys, tokens, and authorization material
- raw activity metadata

Malformed diagnostic trace IDs are sanitized to `null`.

## Status Algorithm

Latest job and latest score are each chosen by `created_at DESC, id DESC`.

Implemented status mapping:

- no job + no score: `not_requested`
- no job + score: `completed`
- pending + no score: `pending`
- running + no score: `running`
- pending/running + previous score: `rescoring_pending_with_previous_score`
- completed + score: `completed`
- completed + no score: `completed_but_score_missing`
- failed + no score: `failed`
- failed + previous score: `failed_with_previous_score`

## Tests

Added service coverage for:

- all required score statuses
- unknown/cross-workspace lead returning `not_found`
- multiple jobs where the newest row wins
- multiple scores where the newest row wins
- malformed diagnostic trace ID sanitization
- unsafe field absence in serialized DTO

Added route coverage for:

- 401 without session
- 403 for non-admin/non-founder session
- 404 for unknown lead
- 404 for cross-workspace lead
- 200 safe DTO
- GET does not create an activity log
- unsafe field absence in serialized route response

Focused checks run:

```bash
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- leads.test.ts scoring-status.test.ts
pnpm --filter @syrantis/api test -- leads.test.ts scoring-status.test.ts inbound-message-intake.test.ts public-leads.test.ts workspace-api-keys.test.ts worker-ops.test.ts
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/api typecheck
pnpm --filter @syrantis/db verify-migration-files
find packages/db/migrations -maxdepth 1 -type f -name "*.sql" | wc -l
git diff --check
pnpm exec prettier --check README.md apps/api/src/routes/leads.ts apps/api/src/repositories/scoring-status.ts apps/api/src/services/scoring-status.ts apps/api/src/tests/leads.test.ts apps/api/src/tests/scoring-status.test.ts packages/shared/src/contracts/index.ts packages/shared/src/contracts/lead-score-status.ts docs/specs/023M-lead-score-read-model.md docs/implementation/023M-lead-score-read-model.md
grep -RniE "entity_id|entityId" apps/api/src packages/shared/src | grep -E "score-status|lead-score|background" || true
grep -RniE "bodyText|body_text|fromEmail|contactEmail|contactName|subject" apps/api/src/routes apps/api/src/services packages/shared/src/contracts | grep -E "score-status|lead-score" || true
grep -RniE "prompt|rawOutput|raw_output|provider_message_id|providerMessageId|payload_json|payloadJson|last_error_message|lastErrorMessage|workspaceId" apps/api/src/routes apps/api/src/services packages/shared/src/contracts | grep -E "score-status|lead-score" || true
grep -RniE "insert|update|delete|activity_logs|activityLogs" apps/api/src/routes apps/api/src/services | grep -E "score-status|lead-score" || true
```

Results:

- shared build passed
- API typecheck passed
- focused non-regression tests passed: 93 tests
- full API test suite passed: 35 files, 578 tests
- migration verification: `MIGRATION_FILES_OK`, `sql_files=19 journal_entries=19 drift=0`
- migration SQL count: 19
- `git diff --check` passed
- Prettier check passed
- score-status sensitive body/contact grep returned no matches
- score-status mutation/activity grep returned no matches
- exact `entity_id|entityId` safety grep returned pre-existing `background-worker` and
  `background-jobs.test.ts` hits unrelated to 023M
- exact prompt/payload/workspace safety grep returned pre-existing `lead-scores.ts` and
  `lead-scoring-prompt.ts` hits unrelated to the 023M score-status route

## Rollback

Revert the shared contract, scoring status repository/service, route addition, tests, docs, and
README update. No database rollback is required because 023M adds no migration.

## Follow-Up

023N can use this read model as the safe base for score pushback without reintroducing manual SQL or
exposing raw job/score internals.
