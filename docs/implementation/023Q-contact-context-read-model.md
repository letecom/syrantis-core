# 023Q Contact Context Read Model

## Summary

Implemented `GET /api/leads/:id/contact-context`, a read-only admin/founder contact context aggregate for a lead.

## Backend

- Added shared Zod DTO contracts in `packages/shared/src/contracts/contact-context.ts`.
- Exported the contract from the shared contracts index.
- Added a repository that:
  - checks the current lead under the session workspace
  - treats `contact_id` as usable only when the linked contact is visible in the same workspace
  - extracts only whitelisted `normalized_json` keys: `fromEmail` and `email`
  - computes prior lead, draft, outbound, delivery, bounce, and complaint aggregates
  - scopes every CTE/subquery by `workspace_id`
- Added a deterministic service for email normalization, warning derivation, and DTO validation.
- Added the route under the existing leads router with session auth, `tenantGuard`, admin/founder role checks, UUID validation, query/header workspace-injection rejection, and the existing error shape.

## Deliberate Non-Changes

- No migration; migration count remains 21.
- No schema, index, or runtime file changes.
- No UI.
- No public API-key route.
- No Gmail, IMAP, Apps Script, provider, AI, scoring, worker, or Google Sheets changes.
- No draft generation.
- No activity log or background job creation on GET.
- No `lead_scores` join.

## Safety

The DTO excludes `workspaceId`, email addresses, contact names, subject, body fields, raw JSON, provider IDs, API keys, tokens, prompts, raw output, costs, and token counts.

The route is contact-context only. It does not claim conversation or thread context because Gmail thread history is not present in Syrantis Core yet.

## Validation

Target validation commands:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

## Risk And Rollback

Risk is limited to one new internal read route and read-only aggregate query. Rollback is a code revert of the shared contract, repository, service, route, tests, docs, and README edits.
