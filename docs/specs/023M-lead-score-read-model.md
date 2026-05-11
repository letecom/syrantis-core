# 023M - Lead Score Read Model

## Objective

Expose a safe backend read model for lead scoring state without requiring manual SQL.

The route answers:

- whether a lead has ever been scored
- whether the latest `score_lead` job is pending, running, completed, or failed
- which latest safe score row is available
- whether a newer rescore is in progress while an older score still exists

023M is backend only. It adds no UI, migration, worker change, provider call, AI call, Google
Sheets pushback, public API-key access, or activity log on GET.

## Route

### `GET /api/leads/:id/score-status`

Rules:

- authenticated internal session only
- admin/founder only
- protected by `tenantGuard`
- workspace identity comes only from trusted server context
- path `id` must be a UUID
- unknown and cross-workspace leads return 404
- response is a safe DTO validated by Zod
- no mutation, worker execution, provider call, AI call, or activity log

This is not a public intake route and does not accept workspace API-key auth.

## Data Sources

The read model reads only:

- `leads`, to verify the lead exists in the current workspace
- `background_jobs`, for `score_lead` job state
- `lead_scores`, for the latest safe score fields

`background_jobs.entity_id` does not exist and must not be used.

`score_lead` jobs are joined to leads through:

```sql
background_jobs.payload_json->>'leadId' = :leadId
```

The job query also filters `background_jobs.workspace_id` and `type = 'score_lead'`.

## DTO

The shared contract is `LeadScoreStatusDtoSchema`.

Safe response fields:

- `scoreStatus`
- `latestJob.id`
- `latestJob.status`
- `latestJob.attempts`
- `latestJob.createdAt`
- `latestJob.updatedAt`
- `latestJob.completedAt`
- `latestJob.failedAt`
- `latestJob.diagnosticTraceId`
- `latestScore.id`
- `latestScore.score`
- `latestScore.scoreBand`
- `latestScore.intent`
- `latestScore.urgency`
- `latestScore.confidence`
- `latestScore.recommendedAction`
- `latestScore.diagnosticTraceId`
- `latestScore.createdAt`
- `counts.totalScoringJobs`
- `counts.totalScores`
- `checkedAt`
- `processingNote`

The current `lead_scores` schema does not contain `intent`, `urgency`, or a safe diagnostic trace
column, so those fields are returned as `null`.

## Forbidden Response Fields

The DTO must not expose:

- `workspaceId`
- lead body, subject, sender, contact email, or contact name
- prompts
- raw AI output
- raw provider output
- model, cost, or token internals
- raw job payload
- raw score payload
- provider message IDs
- API keys, tokens, or authorization material
- `last_error_message`
- raw activity metadata

## Status Algorithm

Latest job is selected by `created_at DESC, id DESC`.

Latest score is selected by `created_at DESC, id DESC`.

Status rules:

- no job + no score: `not_requested`
- no job + score: `completed`
- latest job pending + no score: `pending`
- latest job running + no score: `running`
- latest job pending/running + previous score: `rescoring_pending_with_previous_score`
- latest job completed + score: `completed`
- latest job completed + no score: `completed_but_score_missing`
- latest job failed + no score: `failed`
- latest job failed + previous score: `failed_with_previous_score`

## Non-Goals

023M does not add:

- migrations or schema changes
- worker changes
- background job enqueueing
- Google Sheets pushback
- Gmail or provider integration
- AI calls
- UI
- Caddy, Docker, systemd, or env changes
- public API-key access

## Relationship To 023N

023N will use this read model as the safe basis for score pushback. 023M deliberately stops at
read-only score visibility.
