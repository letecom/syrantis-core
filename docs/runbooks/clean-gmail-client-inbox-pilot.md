# Clean Gmail Client Inbox Pilot Runbook

Issue: 023AG Clean Gmail Pilot + Admin Inbox Runtime Harness

## Objective

Validate a clean Gmail pilot before building the final client Inbox UI:

```txt
fresh Gmail test account -> existing Apps Script bridge -> public intake
  -> client_mail_items -> /app/client-inbox-lab
  -> Inbox detail -> draft edit -> Gmail export request/cancel wrappers
```

This runbook does not approve final client UI, `app.syrantis.fr`, Gmail OAuth, direct send,
provider calls, new backend routes, migrations, Google Sheets behavior changes, deployment,
production env edits, Caddy edits, or systemd edits.

Use synthetic messages only. Never paste real customer mail content, API keys, cookies, raw API
responses, raw Gmail payloads, prompts, AI output, or secrets into docs, tickets, screenshots, logs,
or terminal output.

## 1. Prepare A Clean Gmail Pilot Account

1. Create or use a fresh Gmail test account dedicated to the pilot.
2. Install or reuse the existing Syrantis Apps Script Gmail bridge template.
3. Store the temporary Syrantis workspace API key only in Apps Script `PropertiesService`.
4. Never commit, paste, print, screenshot, or log the API key.
5. Use a temporary workspace API key that can be revoked after the pilot.
6. Confirm the bridge sends no client-provided tenant identity. Syrantis must resolve workspace
   context only from the API key.

If an agent participates in the pilot, the agent must not receive the API key and must not access
the database directly.

## 2. Send Synthetic Gmail Messages

Send a small batch to the clean Gmail account:

- quote/devis request
- urgent request
- newsletter or bulk message that should be ignored
- follow-up from the same sender
- ambiguous human-looking message

Use placeholders and non-customer addresses. Keep message bodies short enough for safe manual
inspection.

## 3. Run The Existing Bridge

Run the existing Apps Script bridge manually first, then by timer only after the manual run behaves
as expected.

Confirm for each synthetic message:

- public intake returns a safe `created`, `ignored`, or `idempotent/replay` outcome
- no API key appears in Apps Script logs
- no raw response body, message body, or secret appears in logs
- duplicate processing of the same message follows idempotency semantics

## 4. Open The Admin Inbox Lab

Use a founder/admin session in the existing admin app:

```txt
/app/client-inbox-lab
```

Confirm the page shows:

- `Client Inbox Lab`
- `Internal validation only · Not final client UI`
- the subject/snippet omission warning
- no final client app sidebar primitives
- no raw response panel
- no secret or API-key input

## 5. Validate List Behavior

Use the lab controls for:

```txt
tab: all, needs_review, ignored, ready_draft, hot
sort: newest, score, urgency
limit: 5, 10, 20, 50
```

Confirm:

- the ignored synthetic newsletter/bulk message is visible with the `ignored` filter
- list items show mail item id, received time, category, score, score band, contact status,
  draft status, Gmail export status, pipeline state, and attention flags
- list `subject` is `null`
- list `snippet` is `null`
- body text and email addresses are absent from list cards

Record the final UI gap:

```txt
List v1 intentionally omits subject and snippet. Final client UI may require a separately approved
safe preview policy.
```

## 6. Validate Detail Behavior

Select each synthetic message in the lab.

Confirm the detail route exposes enough approved selected-message data:

- `hasBodyText`
- `hasFromEmail`
- `hasToEmail`
- `hasSubject`
- received timestamp
- analysis
- contact context
- company/policy context
- draft state
- Gmail export state
- action availability

Also record whether these fields are present or missing:

- `toEmail`
- thread id, currently expected as `not exposed` unless the DTO changes later
- attachments metadata, currently expected empty unless the bridge sends supported metadata later
- sender display
- company display

Do not copy full message bodies or email addresses into the report. Record only presence/absence and
synthetic scenario labels.

## 7. Validate Draft Backfill And Edit

For a message that should produce a draft:

1. Confirm draft generation can backfill `draftId` onto the Inbox item.
2. Confirm the lab enables the draft edit smoke form only when `actions.canEditDraft` is true.
3. Submit a synthetic subject and body through:

```txt
PATCH /api/client/inbox/messages/:mailItemId/draft
```

Expected:

- response shows only safe status fields
- edited subject/body are not returned
- no provider call occurs
- no direct send occurs
- no Gmail export is requested by the edit itself

## 8. Validate Gmail Export Wrappers

For a mail item linked to a draft, use the lab buttons:

```txt
POST /api/client/inbox/messages/:mailItemId/gmail-export-request
POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel
```

Expected:

- buttons appear only when the detail action flags allow them
- response status is safe
- Syrantis does not call Gmail directly from the frontend
- Syrantis does not call Apps Script directly from the frontend
- no direct send, approval, `email_sends`, or background job side effect is introduced by the
  wrappers

## 9. Confirm Storage Through Approved Human Path

Confirm `client_mail_items` rows are created for the synthetic pilot messages through an approved
human database/admin validation path.

Expected:

- leadable/review messages have mail items
- ignored messages have mail items
- replay/idempotent messages do not create duplicate mail items for the same workspace/external id
- `client_mail_items` is the only approved storage location for selected inbound body text

Agents must not access the database directly.

## 10. Record Gaps Before Final UI

Record answers before any final client Inbox implementation:

- Does the final list need an approved subject preview policy?
- Does the final list need an approved body snippet preview policy?
- Must the bridge send `toEmail`, thread id, message id, contact name, or body snippet more
  consistently?
- Should attachments metadata be added later?
- Is sender display derivation enough?
- Is company display derivation enough?
- Is thread context required for the first paid-client Inbox?

If the answer requires exposing new fields in list DTOs or adding bridge fields, open a separate
approved issue. Do not widen 023AF/023AG ad hoc during pilot validation.

## 11. Local Checks

Before review, run:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Safety greps:

```bash
git diff --name-only origin/main...HEAD | grep -E '^packages/db/migrations/.*\.sql$' || true
git diff --name-only origin/main...HEAD | grep -E '^apps/api/src/routes/' || true
git diff --name-only origin/main...HEAD | grep -E '(^ops/systemd/|Caddyfile|\.env|core\.prod\.env|/etc/systemd)' || true
grep -RIn "GmailApp\|googleapis\|gmail\.users\|OpenRouter\|openrouter\|Resend\|resend" apps packages docs 2>/dev/null || true
```

Expected for 023AG:

- no migration
- no backend route
- no env/systemd/Caddy change
- no provider/Gmail/Resend behavior change
- all checks green
