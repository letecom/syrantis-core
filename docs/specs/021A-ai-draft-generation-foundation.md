# 021A - AI Draft Generation Foundation

## Scope

Add asynchronous AI email draft generation for leads.

This issue adds:

- `POST /api/leads/:id/generate-draft`
- `generate_ai_draft` background job payload support
- worker execution through the existing OpenRouter provider
- `ai_runs` proof rows for draft generation
- draft creation in the existing `drafts` table with `status = draft` and `channel = email`
- compact activity logs for request, AI run lifecycle, generated draft, and failure states

## Anti-Scope

021A does not:

- create a new drafts table
- create a draft generation jobs table
- accept `workspaceId`, `tenantId`, prompt, model, recipient, or contact override from the client
- create approval records
- move drafts to `pending_approval`
- create `email_sends`
- enqueue `send_email`
- call Resend
- mutate leads
- expose `prompt_json`, `output_json`, prompt, generated body, or provider raw output through the route
- add fallback hardcoded drafts

## Route

### `POST /api/leads/:id/generate-draft`

Behavior:

- protected by `tenantGuard`
- derives workspace from server context only
- accepts no request body
- rejects non-empty client JSON, including prompt, model, `contactId`, or `workspaceId`
- verifies the lead exists in the current workspace
- reuses an active `generate_ai_draft` job when one exists for the same workspace and lead
- otherwise creates a pending `generate_ai_draft` background job with payload `{ leadId }`
- writes `draft.ai_generation_requested` with metadata `{ leadId, jobId }`
- returns `202` with `{ success: true, data: { jobId, leadId } }`

## Worker

The worker handles `generate_ai_draft` by:

1. Preparing inside `withWorkspaceDb(job.workspaceId)`:
   - load lead by `id` and `workspaceId`
   - load contact and organization only for allowed context/redaction
   - load latest `lead_scores` row for the lead and workspace
   - build a redacted prompt context
   - insert `ai_runs.status = running`
   - log `ai_run.started`
2. Calling OpenRouter outside any DB transaction:
   - existing allowed model resolution
   - JSON response format through the provider
   - `temperature = 0.3`
   - `timeoutMs = 30000`
   - `maxTokens = 1200`
   - one length retry with `maxTokens = 1800`
3. On success inside a transaction:
   - parse strict draft JSON
   - insert a `drafts` row
   - set `status = draft`
   - set `channel = email`
   - store compact AI provenance in `metadata_json`
   - update `ai_runs.status = success`
   - log `ai_run.completed` and `draft.ai_generated`
4. On failure:
   - update `ai_runs.status = error` when an AI run exists
   - store compact error code only
   - create no draft
   - log `ai_run.failed` when applicable
   - log `draft.ai_generation_failed`
   - rethrow to the background job failure path

## Prompt And Privacy

The prompt template is `draft-email-v1`.

Allowed context:

- `lead.source`
- `lead.status`
- safe metadata allowlist
- redacted/truncated raw lead content
- `contact.roleTitle`
- `organization.sector`
- `organization.status`
- latest score fields when present

Excluded from prompt JSON:

- email
- phone
- first name
- last name
- full name
- address
- website
- organization name
- raw arbitrary metadata
- client prompt or model choice
- recipient information

## Migration

Migration `0014_generate_ai_draft_job_type.sql` extends the existing `background_jobs_type_check` constraint to allow `generate_ai_draft`.

No table is added.

## Tests

Required validation:

- route returns `202` and creates/delegates `generate_ai_draft`
- route does not call the AI provider
- active job reuse avoids duplicates
- cross-workspace lead returns `404`
- client prompt/model/contact input is rejected
- prompt JSON is redacted
- worker creates `ai_runs` and `drafts`
- worker uses latest score when present
- score metadata is omitted when absent
- worker works without contact
- no `email_sends` or `send_email` job is created
- invalid JSON/schema creates no draft and marks `ai_runs` error
- length finish reason retries with 1800 max tokens
- activity logs stay compact and omit prompt/output/body fields

## Rollback

Rollback requires reverting code and migration before deployment if not yet applied.

If applied, replace the `background_jobs_type_check` constraint with the previous allowed job types after ensuring no pending or running `generate_ai_draft` jobs remain.
