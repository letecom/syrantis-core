# 023AH Client Inbox Safe Preview Policy Implementation

## Files Changed

- `packages/shared/src/contracts/client-inbox.ts`
- `apps/api/src/repositories/client-inbox.repository.ts`
- `apps/api/src/services/client-inbox.service.ts`
- `apps/api/src/tests/client-inbox.test.ts`
- `apps/api/src/tests/inbound-message-intake.test.ts`
- `apps/web/src/pages/ClientInboxLabPage.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023AH-client-inbox-safe-preview-policy.md`
- `docs/implementation/023AH-client-inbox-safe-preview-policy.md`
- `docs/runbooks/clean-gmail-client-inbox-pilot.md`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Implementation

023AH extends the shared Client Inbox list item contract with:

- `subjectPreview: string | null`
- `snippetPreview: string | null`

The legacy `subject` and `snippet` fields remain in the list contract and continue to return
`null` for v1 compatibility.

The API service now maps list rows through one preview sanitizer:

- `subjectPreview` comes only from `client_mail_items.subject`
- `snippetPreview` uses stored `client_mail_items.snippet` when distinct enough, then falls back to
  a bounded body-derived preview
- whitespace and newlines are collapsed
- subject previews are capped at 140 characters
- snippet previews are capped at 220 characters
- body-derived previews omit at least one character so the full body is not reproduced
- internal key-value material, provider/workspace identifiers, lease tokens, prompt/output labels,
  and API-key-like tokens are redacted before truncation

The repository selects `body_text` for list rows only as internal preview input. The list DTO still
does not expose `bodyText`, `fromEmail`, `toEmail`, workspace ids, raw metadata, provider ids,
prompt/output, lease tokens, or API key material.

The detail route behavior is unchanged. It remains the dedicated selected-message context that may
return full `subject`, `bodyText`, `fromEmail`, and `toEmail`.

## Admin Lab

`/app/client-inbox-lab` now displays the preview fields separately from the compatibility fields:

- `Subject preview`
- `Snippet preview`
- `Subject value` remains `null`
- `Snippet value` remains `null`

The data completeness panel now removes:

- `listSubjectPreview` when `subjectPreview` is present
- `listSnippetPreview` when `snippetPreview` is present

The lab still shows `Internal validation only · Not final client UI` and remains an admin runtime
validation surface, not the final client Inbox.

## Safety Guarantees

Preview exposure is approved only for `GET /api/client/inbox/messages`.

Previews remain forbidden in public intake responses, activity log metadata, background job
payloads, Google Sheets pushback, admin generic queues, provider payloads, prompt/output logs, and
raw metadata.

023AH adds no migration, no new backend route, no intake behavior change, no worker behavior change,
no provider call, no Gmail/App Script/googleapis behavior, no Resend behavior, no Google Sheets
behavior, no Caddy/env/systemd change, no final client UI, no `app.syrantis.fr`, no client RBAC, no
AI rewrite, no direct send, and no Scout behavior.

## Tests

API tests cover:

- subject preview derivation, whitespace collapse, redaction, and 140-character cap
- snippet preview derivation from stored snippet and body fallback, redaction, and 220-character cap
- ignored and leadable items receiving previews
- legacy `subject:null` and `snippet:null`
- absence of list `bodyText`, `fromEmail`, `toEmail`, workspace/raw/provider/prompt/output/lease/API
  key internals
- exact full-body marker absence from list responses
- allowed truncated markers appearing only inside preview fields
- detail still returning full selected mail subject/body/email fields
- public intake safety helpers forbidding preview/body/subject values in public responses, activity
  logs, and background job payloads

Web tests cover:

- central API-client parsing of preview fields while stripping unsafe list fields
- lab rendering of subject/snippet previews and legacy null compatibility fields
- data completeness no longer reporting list preview gaps when previews are present
- continued absence of final client UI primitives, raw JSON panels, and secret/API-key input

## Verification

Targeted checks run during implementation:

- `pnpm --filter @syrantis/shared build`: exit 0.
- `pnpm --filter @syrantis/api build`: exit 0.
- `pnpm --filter @syrantis/api test -- client-inbox`: exit 0.
- `pnpm --filter @syrantis/web test -- app.test.tsx api-client.test.ts`: exit 0.

Final required checks:

- `pnpm --filter @syrantis/db verify-migration-files`: exit 0,
  `MIGRATION_FILES_OK`, `drift=0`.
- `pnpm --filter @syrantis/db test`: exit 0.
- `pnpm --filter @syrantis/shared build`: exit 0.
- `pnpm --filter @syrantis/api test`: exit 0. The suite emitted the existing safe Google Sheets
  setup stderr line while passing.
- `pnpm --filter @syrantis/web test`: exit 0. The suite emitted existing React Router future-flag
  warnings while passing.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0.
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`:
  exit 0, `API_IMPORT_OK`.
- `git diff --check`: exit 0.

Safety greps:

- `git diff --name-only origin/main...HEAD | grep -E '^packages/db/migrations/.*\.sql$' || true`:
  no output.
- `git diff --name-only origin/main...HEAD | grep -E '(^ops/systemd/|Caddyfile|\.env|core\.prod\.env|/etc/systemd)' || true`:
  no output.
- Worktree greps for changed migration, env/systemd/Caddy, and API route files returned no output.
- `grep -RIn "GmailApp\|googleapis\|gmail\.users\|OpenRouter\|openrouter\|Resend\|resend" apps packages docs 2>/dev/null || true`:
  returned pre-existing provider/Gmail/Resend/OpenRouter references and 023AH documentation
  non-goal language only. Added 023AH code does not introduce provider, Gmail, Resend, Google
  Sheets, worker, route, migration, env, Caddy, or systemd behavior.
- `git diff -U0 | grep -E '^\+.*(GmailApp|googleapis|gmail\.users|OpenRouter|openrouter|Resend|resend)' || true`:
  returned only documentation lines stating those behaviors are not added.
