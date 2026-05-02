# 020C - AI Scoring Read Model Implementation

## Summary

020C exposes read-only lead scoring results from `lead_scores` through tenant-protected internal API routes.

No migration was added. The implementation uses existing `lead_scores` data and keeps `ai_runs` as a private audit table.

## Routes

Added:

- `GET /api/leads/:id/score`
- `GET /api/leads/:id/scores`

Both routes:

- are protected by `tenantGuard`
- derive `workspaceId` from server context
- use the production lead service and repository path backed by `withWorkspaceDb`
- verify lead ownership before reading scores
- return `404` for missing or cross-workspace leads
- do not create activity logs
- do not call OpenRouter or any provider
- do not mutate business tables

## DTO

The public score read model exposes only:

- `id`
- `leadId`
- `score`
- `qualification`
- `summary`
- `rationale`
- `recommendedAction`
- `confidence`
- `model`
- `promptTemplateId`
- `scoredAt`

It intentionally omits:

- tenant internals such as `workspaceId`
- audit internals such as `aiRunId`
- job identifiers
- prompt and output payloads
- provider raw responses
- error details
- token and cost fields
- finish reason

## Repository Design

`apps/api/src/repositories/lead-scores.ts` performs explicit projections from `lead_scores`.

The repository first verifies the lead with:

- `leads.id`
- `leads.workspace_id`

Only after ownership is established does it read score rows. It does not join `ai_runs` because `lead_scores` already contains the business fields required by the API.

History pagination uses `lead_scores.created_at` as an ISO cursor and fetches `limit + 1` rows to calculate `nextCursor`.

## Tests

Tests cover:

- latest score success
- latest no-score behavior
- missing lead
- cross-workspace lead
- empty history
- descending order
- cursor pagination
- max limit validation
- invalid cursor validation
- forbidden field absence
- existing score request and worker regressions

## Production Validation Plan

1. Sync and build the API.
2. Confirm no migration is pending for 020C.
3. Restart the API.
4. Use an already scored lead.
5. Verify `GET /api/leads/:id/score` returns the latest public DTO.
6. Verify `GET /api/leads/:id/scores?limit=10` returns history.
7. Verify forbidden fields are absent from JSON responses.
8. Verify an unscored lead returns `data: null` for latest and `data: []` for history.
9. Verify no activity logs are inserted by GET reads.

## Rollback

Rollback is a code revert. No database rollback is required because 020C adds no migration and performs no writes.
