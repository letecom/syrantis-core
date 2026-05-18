# 023AG Clean Gmail Pilot + Admin Inbox Runtime Harness Implementation

## Files Changed

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/web/src/pages/ClientInboxLabPage.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023AG-clean-gmail-pilot-admin-inbox-lab.md`
- `docs/runbooks/clean-gmail-client-inbox-pilot.md`
- `docs/architecture/current-state.md`
- `README.md`

## Implementation

023AG adds `/app/client-inbox-lab` inside the existing protected admin shell. The page is explicitly
labelled:

```txt
Internal validation only · Not final client UI
```

It uses current admin UI patterns and does not change `ClientInboxPreviewPage`, import client design
tokens, create a client app shell, or apply the 023AE premium client UI.

The lab consumes only existing 023AF routes through the central web API client:

- `GET /api/client/inbox/messages`
- `GET /api/client/inbox/messages/:mailItemId`
- `PATCH /api/client/inbox/messages/:mailItemId/draft`
- `POST /api/client/inbox/messages/:mailItemId/gmail-export-request`
- `POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel`

The list panel supports `tab`, `sort`, and `limit`, displays the approved operational list fields,
and makes the v1 omission of list subject/snippet explicit. The detail panel renders only allowlisted
fields from the approved detail DTO, where `bodyText`, `fromEmail`, and `toEmail` are permitted for
selected-message validation.

The data completeness panel computes the clean Gmail pilot signals for final UI readiness:
body/from/to/subject presence, draft/action availability, attachment presence, thread id exposure,
and `missingForFinalUI` gaps such as list subject/snippet preview, sender/company display,
attachments, and thread context.

Draft edit and Gmail export controls call the Inbox wrapper routes only. They show safe response
status, do not call Gmail or Apps Script directly, and do not expose edited draft body in responses.

## Tests

Web tests were added for:

- protected `/app/client-inbox-lab` rendering
- required lab title/banner
- absence of final client sidebar primitives
- list subject/snippet omission warning
- no default raw response panel
- no secret/API-key input
- list fixture with `subject:null` and `snippet:null`
- detail fixture with approved `bodyText`, `fromEmail`, and `toEmail`
- body text not rendering in list cards
- API-client helper route/method coverage for list, detail, draft edit, request, and cancel

## Safety

023AG adds no migration, backend route, API service/repository change, intake change, worker change,
provider call, Gmail backend call, Google Sheets behavior, Caddy/env/systemd change, deployment,
client RBAC, AI rewrite, direct send, or Scout behavior.

The frontend continues to use cookie credentials through the existing API client and sends no tenant
identity or authorization header.

## Verification

- `pnpm --filter @syrantis/db verify-migration-files`: exit 0,
  `MIGRATION_FILES_OK`, `drift=0`.
- `pnpm --filter @syrantis/db test`: exit 0.
- `pnpm --filter @syrantis/shared build`: exit 0.
- `pnpm --filter @syrantis/api test`: exit 0. The suite emitted the existing Google Sheets setup
  safe-error stderr line while passing.
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
- `git diff --name-only origin/main...HEAD | grep -E '^apps/api/src/routes/' || true`: no output.
- `git diff --name-only origin/main...HEAD | grep -E '(^ops/systemd/|Caddyfile|\.env|core\.prod\.env|/etc/systemd)' || true`:
  no output.
- Worktree `git diff --name-only` greps for migrations, API routes, and env/systemd/Caddy also
  returned no output.
- The broad provider grep returned pre-existing OpenRouter/Resend/Gmail bridge references plus the
  023AG runbook's documented grep command. No 023AG app code adds provider, Gmail, Resend,
  Google Sheets, backend route, worker, migration, env, Caddy, or systemd behavior.
