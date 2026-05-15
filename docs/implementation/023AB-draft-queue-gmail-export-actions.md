# 023AB Draft Queue Gmail Export Actions Implementation

## Summary

Added controlled Gmail export request/cancel actions to `/app/draft-queue` using the existing 023U
backend routes.

## Files Changed

- `packages/shared/src/contracts/draft-queue.ts`
- `apps/api/src/services/draft-queue.service.ts`
- `apps/api/src/tests/client-draft-queue.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/DraftQueuePage.tsx`
- `apps/web/tests/api-client.test.ts`
- `apps/web/tests/app.test.tsx`
- `docs/specs/023AB-draft-queue-gmail-export-actions.md`
- `docs/runbooks/gmail-client-e2e.md`
- `docs/implementation/023AB-draft-queue-gmail-export-actions.md`

## Behavior

- Draft Queue list/detail DTOs include safe action flags.
- List responses include a non-null pagination object with `limit`, `offset`, and `total`.
- The frontend shows `Request Gmail export` only when the queue DTO says it is safe.
- The frontend shows `Cancel request` only for pending, unleased, unexported requests.
- Successful actions refetch the list and any open detail drawer.
- Error states are shown without optimistic export status.

## Safety Notes

- No migration was added.
- No new `/api/client` mutation route was added.
- No provider, Gmail, Google, Resend, send, approval, or edit behavior was added.
- Draft Queue GET paths still do not create activity logs, background jobs, email sends, approvals,
  or provider calls.
- Queue DTOs still omit workspace IDs, raw metadata, provider payloads, prompts/outputs, lease
  tokens, contact emails, API key material, and raw inbound email content.

## Validation

The runbook section `023AB Draft Queue Gmail Export Action Validation` was added to
`docs/runbooks/gmail-client-e2e.md` for realistic production validation with a temporary API key.

## Rollback

Remove the DTO action/pagination additions, the Draft Queue page action controls, the API client
alias, and the associated tests/docs. No database rollback is required.

## Business Value

Completes the controlled bridge from generated draft review to Gmail draft creation while keeping
final editing and sending in Gmail.
