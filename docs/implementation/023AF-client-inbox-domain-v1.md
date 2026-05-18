# 023AF Client Inbox Domain v1 Implementation

## Files Changed

- `packages/db/migrations/0022_client_mail_items.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/db/src/schema.ts`
- `packages/db/src/verify/*`
- `packages/shared/src/contracts/client-inbox.ts`
- `packages/shared/src/contracts/inbound-message.ts`
- `apps/api/src/repositories/inbound-message-intake.ts`
- `apps/api/src/repositories/client-inbox.repository.ts`
- `apps/api/src/services/client-inbox.service.ts`
- `apps/api/src/services/generate-ai-draft-job-handler.ts`
- `apps/api/src/routes/client/inbox.ts`
- `apps/api/src/routes/client/index.ts`
- `apps/api/src/tests/client-inbox.test.ts`
- `apps/api/src/tests/inbound-message-intake.test.ts`
- `apps/api/src/tests/ai-draft-generation.test.ts`
- `docs/specs/023AF-client-inbox-domain-v1.md`
- `docs/runbooks/client-inbox-domain-v1.md`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Migration

Migration `0022_client_mail_items.sql` creates `client_mail_items` with:

- workspace-scoped tenant isolation
- nullable links to `intake_classifications`, `leads`, `contacts`, and `drafts`
- client-visible mail fields approved for the dedicated Inbox domain
- inbound-only direction check
- non-empty source check
- attachment JSON array check
- partial unique index on `(workspace_id, external_id)` for idempotency
- list/detail lookup indexes
- standard updated-at trigger
- RLS enabled and FORCE RLS
- `tenant_isolation_client_mail_items`

No physical delete or cascade behavior is introduced for business records.

## Intake

Public inbound intake now writes `client_mail_items` after request validation and classification.
The write path uses the same workspace API-key resolution and existing 023Z classifier behavior.

Ignored messages create a classification and mail item, then stop with no lead, no score job, no
draft, no approval, no send, no `email_sends`, and no provider call. Leadable and review messages
continue the existing lead/contact/job behavior and link the mail item where those records exist.

External id replay reuses the existing mail item instead of creating duplicates. Messages without
external id can create multiple mail items, matching the existing non-idempotent intake behavior.

The lead raw content stored by intake was tightened to a safe placeholder so body, subject, and
email addresses remain in the dedicated Inbox domain instead of leaking into generic lead state.

## Client Inbox API

New session-only founder/admin routes are mounted under `/api/client/inbox`.

`GET /messages` returns a safe list DTO for prioritized Inbox cards. It reads from
`client_mail_items` and joins safe classification, lead, contact, organization, score, draft,
export, and workspace policy context. It supports the approved filters and pagination and does not
return subject values, full body, email addresses, raw metadata, workspace id, provider ids,
prompt/output, lease tokens, or API key material. The nullable `subject` field is present in the
contract but returns `null` in v1 list responses.

`GET /messages/:mailItemId` returns the dedicated detail DTO. This route may return the selected
mail body and email addresses because it is the client Inbox reading context. It still omits raw
metadata, provider payloads, provider ids, prompt/output, lease tokens, workspace id, and API key
material.

`PATCH /messages/:mailItemId/draft` updates the linked draft subject/body through a workspace-safe
mail item lookup. The response is safe and excludes subject/body. The activity log contains only
safe ids/source/timestamp metadata.

`POST /messages/:mailItemId/gmail-export-request` and
`POST /messages/:mailItemId/gmail-export-cancel` resolve the mail item to its draft and reuse the
existing 023U Gmail export request/cancel service. No Gmail, Apps Script, provider, send, approval,
`email_sends`, or background job side effect is added.

## Draft Linking

When `generate_ai_draft` creates a draft, matching `client_mail_items` rows for the same workspace
and lead are backfilled with the draft id when they do not already have one. This keeps Inbox
draft/edit/export actions available without changing the public intake response.

## Safety Guarantees

Full mail body is stored only in `client_mail_items` and returned only by the Inbox detail route.
List DTOs, public intake responses, activity logs, background job payloads, admin queues, prompt
context, provider payloads, and Google Sheets paths do not receive full inbound body or sender/
recipient email addresses from 023AF.

023AF adds no live UI, provider call, Gmail backend call, Resend behavior, Google Sheets change,
direct send, AI rewrite, Caddy/systemd/env change, or deployment behavior.

## Verification

- `pnpm --filter @syrantis/db build`: exit 0.
- `pnpm --filter @syrantis/api typecheck`: exit 0.
- `pnpm --filter @syrantis/api test -- src/tests/client-inbox.test.ts src/tests/inbound-message-intake.test.ts src/tests/ai-draft-generation.test.ts`: exit 0.
- `pnpm --filter @syrantis/db verify-migration-files`: exit 0.
- `pnpm --filter @syrantis/db test`: exit 0.
- `pnpm --filter @syrantis/shared build`: exit 0.
- `pnpm --filter @syrantis/api test`: exit 0.
- `pnpm --filter @syrantis/web test`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0.
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`:
  exit 0.
- `git diff --check`: exit 0.

Safety greps:

- `git diff --name-only origin/main...HEAD | grep -E '^apps/web/src/' || true`: no output.
- `git diff --name-only origin/main...HEAD | grep -E '(^ops/systemd/|Caddyfile|\.env|core\.prod\.env|/etc/systemd)' || true`:
  no output.
- `grep -RIn "GmailApp\|googleapis\|gmail\.users\|OpenRouter\|openrouter\|Resend\|resend" apps packages docs 2>/dev/null || true`:
  returned pre-existing AI/email/Gmail bridge references plus 023AF non-goal documentation; no
  023AF route, repository, service, migration, or shared contract introduced provider calls.
