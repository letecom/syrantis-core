# 022C - Google Sheets Push-back MVP

## Purpose

Implement the first concrete CRM push-back MVP for Syrantis using Google Sheets.

This builds on 022B, which validated that the production environment can write to a Google Sheet using service-account credentials.

## Scope

- Add a controlled push-back path that appends delivery proof rows to Google Sheets.
- Re-use the `google-auth-library` and service-account credential model from 022B.
- Hook into the Resend webhook handler: push back occurs after a successful `applyResendDeliveryEvent`.
- Provide a non-blocking path: a Google Sheets failure must not crash the runtime or return an error to the webhook provider.
- Output row shape must match the 17-column `Pushback_Log!A:Q` specification.
- Use explicit environment variables to control and configure push-back.

## Configuration

- `GOOGLE_SHEETS_PUSH_ENABLED=true` (must be explicitly true to push)
- `GOOGLE_SHEETS_CREDENTIALS_JSON`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_PUSHBACK_RANGE` (defaults to `Pushback_Log!A:Q`)

## Target Row Shape

1. `event_type` (e.g. `email.delivered`)
2. `occurred_at` (webhook payload occurrence time or now)
3. `syrantis_lead_id`
4. `syrantis_draft_id`
5. `syrantis_email_send_id`
6. `lead_label` (Lead `{id.split('-')[0]}`)
7. `contact_email`
8. `send_status`
9. `delivery_status`
10. `requested_at`
11. `sent_at`
12. `delivered_at`
13. `bounced_at`
14. `complained_at`
15. `delivery_error_code`
16. `safe_summary` (draft subject)
17. `synced_at` (current ISO timestamp)

## Security and Tenancy

- No raw provider message IDs exposed in the pushback row.
- No raw error text or email bodies pushed back.
- No client `workspaceId` override accepted.
- Missing credentials log a warning but do not crash the application.
- Non-blocking execution prevents webhook delivery bottlenecks.

## Exclusions

- No UI changes.
- No API routes added.
- No database schema migrations.
- No generic CRM integration abstract classes.
