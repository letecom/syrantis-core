# Client Inbox Backend Contract

Issue: 023AE Client App Design System + Inbox Product Contract

## Dedicated Domain Required

The target client Inbox requires a dedicated Client Inbox Domain. It must not directly reuse the
current admin/founder validation read models.

Current surfaces such as Mail Queue, Draft Queue, Gmail Export Ops, Google Sheets, API Keys, and Ops
exist to validate the backend loop. They are not the live client product contract.

## Future Storage

Future live Inbox work should add a dedicated `client_mail_items` domain table or equivalent domain
model after approval.

The domain must support full client-visible mail body storage because the Inbox reading panel needs
the selected message body. That permission is narrow:

- full mail body is allowed only in the dedicated client Inbox domain
- never put mail body in `activity_logs`
- never put mail body in admin generic queues
- never put mail body in Google Sheets
- never put raw provider or Gmail payloads in logs, DTOs, activity metadata, or debug panels

When the table is added later, it must be workspace scoped and protected with RLS plus FORCE RLS.

## Future Intake Write Path

Future intake should write a client Inbox item after classification and tenant-safe normalization.
The client Inbox item should be the source for client-visible reading, prioritization, context, and
draft workflow.

The write path must still avoid provider calls from routes and must not store raw Gmail/provider
payloads. It should store only the fields approved for the client product domain.

## Future Routes

The future live contract should be mounted under tenant-scoped client routes:

```txt
GET /api/client/inbox/messages
GET /api/client/inbox/messages/:mailItemId
PATCH /api/client/inbox/messages/:mailItemId/draft
POST /api/client/inbox/messages/:mailItemId/gmail-export-request
POST /api/client/inbox/messages/:mailItemId/gmail-export-cancel
POST /api/client/inbox/messages/:mailItemId/draft/rewrite
```

`draft/rewrite` is later-only and requires a separate approved issue because it may trigger provider
work through the approved worker path.

## Route Doctrine

Future routes must:

- be protected by `tenantGuard` or an explicitly approved equivalent guard
- derive workspace identity only from trusted server context
- never accept workspace identity from body, query params, URL params, headers, or client state
- filter list reads by workspace
- filter detail reads by both `mailItemId` and workspace
- filter updates by both `mailItemId` and workspace
- return `404` for cross-workspace resources
- use Drizzle query builder by default
- keep raw SQL out of business routes, services, and repositories unless separately approved
- keep direct send out of scope until a dedicated issue approves it

## DTO Doctrine

Client Inbox DTOs may include client-visible fields needed by the product:

- sender display name
- safe sender/company labels
- subject
- client-visible body for the dedicated detail read
- category
- score band and score value
- review state
- contact state
- draft state
- AI analysis summary
- contact context summary
- company and policy context summary
- AI draft reply content for review
- Gmail export request state

Client Inbox DTOs must not include:

- raw provider payloads
- raw Gmail objects
- provider message IDs unless separately approved and masked
- workspace IDs
- API keys, tokens, secrets, leases, or credential material
- prompt text or raw AI output
- raw metadata JSON
- log payloads
- admin diagnostic fields

## 023AE Boundary

023AE creates only documentation, design tokens, and a mock preview page. It does not add the
`client_mail_items` table, migrations, backend services, routes, intake behavior, provider calls,
Gmail logic, client auth, deployment, draft editing, or export logic.
