# 023Q Hotfix: Public Intake Contact Link

## Summary

Production validation showed that public inbound message leads did not persist contact identity structurally. Repeated public messages with the same `fromEmail` therefore could not be found by the 023Q contact context read model unless future code parsed raw lead content, which is explicitly not allowed.

This hotfix updates `POST /api/intake/inbound-message` so new public inbound message leads create or reuse a workspace-scoped contact by normalized `fromEmail` and store that contact id on `leads.contact_id`.

## Backend

- Normalizes `fromEmail` with trim plus lowercase.
- Looks up contacts only inside the API-key workspace using `lower(btrim(contacts.email))`.
- Reuses the existing contact when present.
- Creates an email-only contact when absent, with safe metadata `{ origin: "public_inbound_message" }`.
- Inserts the public inbound lead with `contact_id`.
- Preserves idempotent replay behavior: same `externalId` in the same workspace returns the existing lead/job before contact creation, so no duplicate contact is created.
- Keeps `leads.normalized_json` limited to the existing safe markers. It does not add `fromEmail`, `email`, `contactEmail`, or `senderEmail`.

## Deliberate Non-Changes

- No migration; migration count remains 21.
- No new table, column, or index.
- No raw-content parsing for contact context.
- No public response shape change.
- No activity log PII.
- No contact-context response PII.
- No AI, worker, scoring, Google Sheets, provider, webhook, UI, or secret changes.

## Validation Focus

Added regression coverage for:

- public inbound creates a normalized contact and links `leads.contact_id`
- repeated public inbound with the same `fromEmail` reuses the contact
- idempotent replay does not insert a contact, lead, or job
- activity metadata remains safe
- normalized JSON still excludes contact email keys
- 023Q contact context returns `matchedBy = "contact_id"` and prior context for repeated linked contacts

## Risk And Rollback

Risk is limited to public inbound message creation. Existing idempotent replays are intentionally not backfilled by this hotfix. Rollback is a code revert of the repository/test/doc/README changes.
