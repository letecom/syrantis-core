# Issue 013: Leads Vertical Slice

## Goal

Create the minimal tenant-isolated leads API for the Lead Response and Devis Relance wedge.

A lead represents an inbound commercial intent such as a quote request, urgent repair, callback request, or customer need.

## Schema Observed

`leads` exists in `packages/db/src/schema.ts` with these columns:

- `id`
- `workspaceId`
- `organizationId`
- `contactId`
- `source`
- `status`
- `rawContent`
- `normalizedJson`
- `score`
- `scoreReason`
- `receivedAt`
- `createdAt`
- `updatedAt`

Allowed statuses are:

- `new`
- `scored`
- `drafted`
- `responded`
- `lost`
- `won`

Allowed sources are:

- `email`
- `form`
- `phone`
- `manual`
- `import`

Relational fields available:

- `organizationId`
- `contactId`

There is no `opportunityId` on `leads`.

JSON field available:

- `normalizedJson`, exposed through the API as `metadata`

Archive support:

- No dedicated `archivedAt` field.
- No `archived` status.
- No lead archive endpoint or `lead.archived` event is approved in this issue.

## Routes

- `GET /api/leads`
- `POST /api/leads`
- `GET /api/leads/:id`
- `PATCH /api/leads/:id`

No public webhook, qualify, convert, task, approval, opportunity, scoring, draft, or email endpoint is approved.

## Security Rules

- All routes are protected by `tenantGuard`.
- `workspaceId` comes only from trusted server context.
- Client-provided `workspaceId` in body or query is rejected with `400`.
- List reads are scoped by `workspaceId`.
- Detail and update reads/mutations filter by both `id` and `workspaceId`.
- Cross-workspace resources return `404`.
- Provided `contactId` must belong to the same workspace.
- Provided `organizationId` must belong to the same workspace and must not be archived.
- No physical delete is allowed.
- No raw SQL, RLS, jobs, AI, Resend, webhooks, automatic tasks, automatic approvals, automatic opportunities, or inline organization/contact creation.

## Activity Logs

Approved events:

- `lead.created`
- `lead.updated`

All mutation logs must be written through `createActivityLog(tx, ...)` inside the same `withWorkspaceDb` transaction as the mutation.
