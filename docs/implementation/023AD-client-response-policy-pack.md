# 023AD Client Response Policy Pack v0 Implementation

## Summary

Implemented a bounded Client Response Policy Pack v0 stored under
`workspace_context_profiles.context_json.responsePolicy`. Admin/founder sessions can manage it from
`GET/PUT /api/client/response-policy` and `/app/response-policy`. The `generate_ai_draft` worker now
loads configured policy into safe prompt context and records `responsePolicy` as a safe boolean in
context-used metadata.

## Files Changed

- `packages/shared/src/contracts/client-response-policy.ts`
- `packages/shared/src/contracts/activity-logs.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/routes/client/response-policy.ts`
- `apps/api/src/routes/client/index.ts`
- `apps/api/src/services/client-response-policy.ts`
- `apps/api/src/repositories/client-response-policy.ts`
- `apps/api/src/repositories/workspace-context.ts`
- `apps/api/src/services/draft-generation-context.ts`
- `apps/api/src/services/ai/draft-generation-prompt.ts`
- `apps/api/src/services/generate-ai-draft-job-handler.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/ResponsePolicyPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/AdminShell.tsx`
- `apps/api/src/tests/client-response-policy.test.ts`
- `apps/api/src/tests/ai-draft-generation.test.ts`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `README.md`
- `docs/architecture/current-state.md`

## Behavior

- `GET /api/client/response-policy` returns a safe default empty policy when no policy exists.
- `PUT /api/client/response-policy` validates bounded fields and stores the policy in
  `context_json.responsePolicy`.
- Existing workspace context columns and unrelated `context_json` keys are preserved.
- Activity logs use only compact metadata:
  - `policyConfigured`
  - `changedFields`
  - `source`
- Draft generation prompt context includes configured response policy and strict handling
  instructions.
- Successful draft generation overwrites AI output `contextUsed` with server-derived booleans,
  including `responsePolicy`.
- `prior_complaint` still blocks before provider call and before AI run/draft creation.

## Safety Notes

- No migration was added.
- No route calls providers, Gmail, Google, Resend, or `fetch`.
- No send/export/approval behavior was added.
- Response DTOs do not expose `workspaceId`, `contextJson`, `createdBy`, or `updatedBy`.
- Activity metadata does not include policy text, signatures, examples, catalog content, prompt,
  output, email/contact/subject/body, provider IDs, or credential material.

## Checks

Required checks passed:

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- client-response-policy ai-draft-generation
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/web test -- api-client app
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
git diff --check
```

Security greps were also run for migration absence, provider/Gmail/Google/Resend/fetch imports in
response policy backend files, activity metadata shape, and raw prompt/output exposure.

## Rollback

Rollback removes the response policy contract, route, service, repository, admin page, nav link, and
draft-generation policy prompt integration. Existing stored `context_json.responsePolicy` data can
remain inert because no migration or schema change was introduced.
