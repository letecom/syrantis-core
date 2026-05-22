# 023AM Client Config Foundation v1 Implementation

## Summary

Implemented the live client `/config` page as a client-safe response behavior editor. The page uses
a new dedicated route, `GET/PUT /api/client/config/response-policy`, and does not call the existing
admin/founder response policy route.

## Files Changed

- `packages/shared/src/contracts/client-config-response-policy.ts`
- `packages/shared/src/contracts/index.ts`
- `apps/api/src/routes/client/config-response-policy.ts`
- `apps/api/src/routes/client/index.ts`
- `apps/api/src/tests/client-config-response-policy.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/ClientConfigPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023AM-client-config-foundation-v1.md`
- `docs/implementation/023AM-client-config-foundation-v1.md`
- `docs/runbooks/client-config-foundation-v1.md`
- `docs/architecture/current-state.md`
- `README.md`
- `DECISIONS.md`

## Backend

Added a strict client config response policy contract with a client-facing DTO whitelist. The new
route:

- allows `client`, `admin`, and `founder`
- blocks unauthenticated and `operator` sessions
- rejects client-provided workspace/tenant identity
- rejects unknown fields and forbidden field names
- maps client `structureLines` to stored `responseStructure`
- maps client example `body` to stored `bodyText`
- reuses the existing response policy service/repository and storage

No migration was added. No provider, worker, draft generation, Google, Gmail, Resend, or Google
Sheets behavior was added.

## Frontend

Replaced the `/config` placeholder with a French-first form inside `ClientShell`. The page includes
status, completeness, updated timestamp, sectioned editing, field-adjacent validation errors, reset,
dirty-state save disabling, and save success feedback.

The page calls only:

- `GET /api/client/config/response-policy`
- `PUT /api/client/config/response-policy`

It does not import `AdminShell`, render admin navigation, use browser storage for config, render raw
JSON/debug panels, or call `/api/client/response-policy`.

## Validation And Safety

API tests cover unauthenticated access, allowed roles, blocked operator role, valid PUT, forbidden
workspace identity, unknown fields, forbidden field names, field limits, array limits, example reply
limit, DTO non-exposure, and provider/worker non-imports.

Web tests cover the live `/config` route inside `ClientShell`, client-only navigation, no admin
shell/nav, dedicated client route loading, no admin response-policy call, French sections,
completeness card, disabled save when unchanged, dirty save enablement, reset, PUT save, safe
validation errors, and forbidden field non-rendering.

## Future Compatibility

The policy remains a bounded input for future draft behavior work, but 023AM does not change draft
generation. Future issues may add separate systems for:

- 023AN Response Profiles / Personas v1
- 023AO Services / Offers Config Pack
- 023AP Example Replies Pack
- 023AQ Draft Generation v2

Those systems are not implemented here.

## Rollback

Rollback removes the new client config contract, route mount, web API helpers, `/config` page, and
023AM tests/docs. Existing 023AD admin response policy storage and `/app/response-policy` remain
usable because storage and repository behavior were reused rather than replaced.
