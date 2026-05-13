# 023R - Contextual AI Draft Generation

## Scope

Upgrade the existing AI draft generation worker so the current `generate_ai_draft` job builds drafts from deterministic, workspace-scoped context:

- current lead safe snippets
- latest safe lead score fields
- workspace company context from 023P
- contact context and warnings from 023Q

023R is a worker, prompt, context, and validation upgrade only.

## Anti-Scope

023R does not add:

- a new route
- a new job type
- a migration
- UI
- auto-send behavior
- approval creation
- email send creation
- Gmail, OAuth, Apps Script, or Google Sheets behavior
- scoring algorithm changes
- worker runtime or systemd changes

## Route

`POST /api/leads/:id/generate-draft` remains unchanged:

- protected by `tenantGuard`
- derives `workspaceId` from trusted server context
- accepts no request body
- creates or reuses a `background_jobs.generate_ai_draft` job
- does not call an AI provider
- returns `202` with `{ jobId, leadId }`

## Worker Context

The worker assembles context internally and never calls HTTP routes.

All reads are scoped by `workspaceId`.

Prompt context includes:

- lead `id`, `source`, `status`, `receivedAt`
- lead `subjectSnippet` and `bodySnippet` only
- latest score `score`, `scoreBand`, `confidence`, and `recommendedAction` when present
- company `companyName`, `sector`, `language`, `timezone`, and capped safe context lines
- contact context booleans, counts, timestamps, delivery status, and safe warning enums

Prompt context excludes:

- raw `leads.raw_content`
- raw `leads.normalized_json`
- email
- phone
- contact name
- `workspaceId`
- external IDs
- raw payloads
- metadata JSON
- provider internals
- costs or token counts

## Guardrails

Lead snippets are external untrusted content. They are labeled as such, truncated, PII-redacted, and instruction-like tokens are neutralized before prompt assembly.

Company context is reference/profile data only. Raw JSON is never passed through. Keys containing prompt, system, instruction, override, command, rules, or developer language are filtered before safe context lines are built.

Contact warnings are enforced by backend policy:

- `prior_complaint` blocks before provider call, creates no AI run and no draft
- `prior_bounce` adds cautious drafting instructions
- `recently_contacted` avoids duplicate/repetitive outreach
- `repeated_inbound_recent` avoids first-contact language without inventing history
- `shared_inbox_possible` requires a generic greeting
- `no_contact_key` avoids relationship assumptions

## Output

The model must return strict JSON:

```json
{
  "subject": "string <= 160",
  "bodyText": "string <= 3000",
  "language": "fr | en",
  "tone": "professional | warm | direct | formal",
  "contextUsed": {
    "lead": true,
    "score": true,
    "companyContext": true,
    "contactContext": true
  },
  "safetyNotes": []
}
```

Only `subject` and `bodyText` are written to draft fields.

Unsafe output is rejected before draft creation if it contains hallucinated history, AI/system references, internal references, pricing promises, guarantees, or legal/security certification claims.

## Activity Logs

Activity logs remain compact and safe.

Allowed metadata includes:

- `leadId`
- `draftId`
- `aiRunId`
- context-source booleans
- warning counts
- safe warning enums
- blocked reason enums

Activity logs must not contain prompts, outputs, draft bodies, lead bodies, emails, contact names, phones, company context values, score values, provider IDs, token/cost values, raw JSON, or secrets.

## Migration

No migration is added.

Expected migration state remains:

- 21 SQL files
- 21 journal entries
- drift 0

## Tests

Required coverage:

- route enqueues only and does not call provider
- worker assembles lead, latest score, company context, and contact context
- company context is capped reference data, not raw JSON
- forbidden company keys are filtered
- lead injection is labeled, truncated, and neutralized
- contact warnings alter prompt instructions
- `prior_complaint` blocks before provider call
- missing score, company context, or contact context still generates
- output schema validation
- unsafe output sanitizer
- safe activity logs
- no `email_sends`
- no approval
- AI draft audit read model remains compatible
- no migration drift

## Rollback

Rollback is code-only:

- revert the context assembler
- revert prompt/output validation changes
- revert worker wiring
- revert documentation

No migration rollback is required.
