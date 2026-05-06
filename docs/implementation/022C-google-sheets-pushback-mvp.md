# 022C - Google Sheets Push-back MVP Implementation

## What Was Implemented

Added a Google Sheets push-back service that appends a 17-column delivery proof row to a configured spreadsheet upon successful Resend webhook updates.

The implementation hooks directly into `handleResendWebhookPayload` and executes asynchronously without blocking the webhook response.

## Files Touched

- `apps/api/src/repositories/pushback.ts` (added)
- `apps/api/src/services/pushback/google-sheets.ts` (added)
- `apps/api/src/repositories/resend-webhook.ts`
- `apps/api/src/services/webhooks/resend-webhook.ts`
- `apps/api/src/tests/resend-webhook.test.ts`
- `apps/api/src/tests/google-sheets-pushback.test.ts` (added)
- `README.md`
- `docs/specs/022C-google-sheets-pushback-mvp.md` (added)

## Implementation Details

- **Repositories:** Modified `applyResendDeliveryEvent` to return the updated `emailSendId` and `workspaceId` on success. Created a new `pushback` repository function `findPushbackData` to fetch required contextual fields (lead id, draft subject, contact email, send statuses).
- **Service:** Added `pushDeliveryProofToGoogleSheets` which evaluates `GOOGLE_SHEETS_PUSH_ENABLED`, parses the JSON credential, gets an access token via `google-auth-library`, fetches context, and appends to the specified sheet using the `RAW` input option.
- **Resend Webhook Hook:** Wired the non-blocking push-back logic in `handleResendWebhookPayload`, gracefully catching unhandled rejections to prevent cascading failure in the webhook cycle.
- **Tests:** Mocked `findPushbackData` and Google `fetch` inside `google-sheets-pushback.test.ts` to ensure row generation, and updated `resend-webhook.test.ts` to assert that the pushback method is correctly triggered.

## Verification

Tests have successfully executed. The webhook unit tests and pushback mock test ensure the structural contract holds.

```bash
pnpm --filter @syrantis/db verify-migration-files
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

All 417 API tests and 46 DB tests pass. Import safety succeeds.

## Rollback

To rollback this implementation:
- Remove the call to `pushDeliveryProofToGoogleSheets` from `handleResendWebhookPayload`.
- Remove `pushDeliveryProofToGoogleSheets` entirely.
- (Optional) Remove the `repositories/pushback.ts` module if not used elsewhere.
