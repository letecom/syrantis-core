# 023AI-B Client Inbox Live Route

## Summary

023AI-B adds `/app/client/inbox` as the live internal client Inbox route inside the current web app.
It reuses the shared 023AI-A client Inbox components and maps the existing 023AF/023AH API DTOs
into UI ViewModels before rendering.

This is not `app.syrantis.fr`. It does not add client RBAC/domain split, backend routes, migrations,
provider code, env/systemd/Caddy changes, Google Sheets behavior, direct send, or AI rewrite.

## Files Changed

- `apps/web/src/App.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/features/client-inbox/api/liveAdapter.ts`
- `apps/web/src/features/client-inbox/hooks/useInboxList.ts`
- `apps/web/src/features/client-inbox/hooks/useInboxDetail.ts`
- `apps/web/src/features/client-inbox/hooks/useDraftMutation.ts`
- `apps/web/src/features/client-inbox/hooks/useExportMutation.ts`
- `apps/web/src/features/client-inbox/pages/ClientInboxLivePage.tsx`
- `apps/web/src/features/client-inbox/types/api.ts`
- `apps/web/src/features/client-inbox/types/ui.ts`
- `apps/web/src/features/client-inbox/utils/mapApiToUi.ts`
- shared client Inbox components and design-token CSS for optional live interaction controls
- `apps/web/tests/client-inbox-live.test.tsx`
- `docs/specs/023AI-client-inbox-ui-live-shared-components.md`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Behavior

On page load, `/app/client/inbox` calls
`GET /api/client/inbox/messages?tab=all&sort=newest&limit=20`, renders list rows from
`subjectPreview` and `snippetPreview`, auto-selects the first item, and fetches selected detail.

Selection updates the selected mail item and fetches
`GET /api/client/inbox/messages/:mailItemId`. The live detail hook passes the React Query abort
signal through the central API client so stale in-flight detail requests can be cancelled.

Detail rendering is restricted to the selected-message context. The list ViewModel never receives
full body or email fields. The detail panel may render selected `subject`, `bodyText`, `fromEmail`,
and `toEmail`, plus analysis, contact context, company policy context, draft state, and export
state.

Draft editing is shown only when `actions.canEditDraft` is true. Edits call
`PATCH /api/client/inbox/messages/:mailItemId/draft`, disable the save button while pending, and
refetch list and detail after success. Draft content stays in React state only.

Gmail export request is shown only when `actions.canRequestGmailExport` is true. Before the POST,
the UI displays: `Le brouillon sera préparé dans Gmail. L’envoi final reste à valider manuellement
dans Gmail.` The request calls
`POST /api/client/inbox/messages/:mailItemId/gmail-export-request` and refetches list and detail.

Gmail export cancel is shown only when `actions.canCancelGmailExport` is true. It calls
`POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel` and refetches list and detail.

The route covers loading list, loading detail, empty list, list error, detail error, mutation
loading, mutation success, mutation error, ignored, no-draft, and export-requested states.

## Boundaries

- `/app/client-inbox-preview` remains the mock design harness.
- The Admin Client Inbox Lab remains separate and is not reused.
- The route uses existing backend routes only.
- The live route hides the preview-only Dashboard/Config sidebar entries.
- No backend/API source, DB schema, migration, provider, Google Sheets, Caddy/env/systemd, or
  deployment files were changed.
- No direct send, reply, forward, composer, archive, delete, spam, inline reply, AI rewrite, or
  Scout behavior was added.

## Tests

Added web tests for:

- `/app/client/inbox` route rendering.
- List endpoint call.
- Safe list preview rendering from `subjectPreview` and `snippetPreview`.
- List exclusion of full body, email fields, legacy subject/snippet, IDs, raw/debug fields, and
  admin labels.
- Selection fetching detail.
- Detail rendering of selected body/from/to fields.
- Ignored, no-draft, and export-requested visible states.
- Draft edit PATCH and refetch.
- Gmail export request confirmation, POST, and refetch.
- Gmail export cancel POST and refetch.
- Loading, empty, list error, and detail error states.
- Absence of raw JSON panels and send/reply/forward-style controls.

## Verification

Required checks:

- `pnpm --filter @syrantis/db verify-migration-files`: exit 0.
- `pnpm --filter @syrantis/db test`: exit 0.
- `pnpm --filter @syrantis/shared build`: exit 0.
- `pnpm --filter @syrantis/api test`: exit 0.
- `pnpm --filter @syrantis/web test`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0.
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`:
  exit 0, printed `API_IMPORT_OK`.
- `git diff --check`: exit 0.

Safety greps:

- Migration, `apps/api/src`, env/systemd/Caddy diff greps: no matches for this worktree diff.
- Client Inbox feature greps for `console.log`, `console.table`, `JSON.stringify`, admin/lab/ops
  labels, and send/reply/forward/archive/delete/spam controls: no matches.
- `bodyText`/`fromEmail`/`toEmail` grep matches are limited to allowed selected detail and draft
  edit UI paths, not list rendering.
- The broader provider grep reports pre-existing provider code/docs and this issue's anti-scope
  documentation text; this PR adds no provider code or provider dependency.
