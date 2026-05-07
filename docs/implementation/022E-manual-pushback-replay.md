# 022E Manual Pushback Replay Implementation

## Summary

Implemented an API-only manual replay endpoint for Google Sheets pushback:

`POST /api/email-sends/:id/pushback-replay`

The endpoint is tenant guarded, admin/founder only, workspace scoped through server context, and returns compact safe replay results.

## Files Changed

- `apps/api/src/routes/email-sends.ts`
- `apps/api/src/services/email-send-pushback-replay.ts`
- `apps/api/src/services/pushback/google-sheets.ts`
- `apps/api/src/services/pushback/diagnostics.ts`
- `apps/api/src/tests/email-send-pushback-replay.test.ts`
- `apps/api/src/tests/google-sheets-pushback.test.ts`
- `packages/shared/src/contracts/email-sends.ts`
- `docs/specs/022E-manual-pushback-replay.md`
- `docs/implementation/022E-manual-pushback-replay.md`

## Behavior

Replay looks up the email send by `id` and trusted `workspaceId`.

Outcomes:

- unknown or cross-workspace email send: `404`
- invalid path UUID: `400`
- unauthenticated: `401`
- authenticated non-admin/non-founder: `403`
- ineligible email send: `200` skipped
- Google Sheets disabled: `200` skipped
- Google Sheets failure: `200` failed
- successful append: `200` succeeded

Eligible delivery statuses are `delivered`, `bounced`, and `complained`.

## Safety Notes

Replay does not:

- resend email
- call Resend send
- simulate provider webhooks
- create background jobs
- update `email_sends`
- expose provider message IDs, email addresses, subjects, or bodies in the response
- write provider message IDs, email addresses, subjects, bodies, raw Google errors, credentials, secrets, or `workspaceId` to activity metadata

Manual replay diagnostics include `source: "manual_replay"` and reuse the existing `crm_pushback.*` taxonomy.

## Checks

Targeted checks run during implementation:

```bash
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- --run src/tests/email-send-pushback-replay.test.ts src/tests/google-sheets-pushback.test.ts
```

## Risks

Duplicate manual replays can append duplicate rows to Google Sheets by design.

## Rollback

Revert the route, replay service, pushback return metadata changes, shared replay contract, and tests. No database rollback is required because this issue adds no migration or table.

## Business Value

Admins can repair or re-run Google Sheets delivery proof pushback without resending email or touching provider-facing webhook paths.
