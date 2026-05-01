# Issue 014B1: Task Relationship Ownership Hardening

## Objective

Prevent a task in the current workspace from referencing `organizationId`, `contactId`, `leadId`, or `opportunityId` from another workspace, and prevent internally inconsistent same-workspace task relationships.

This issue resolves the task relationship blocker identified by the 014A RLS readiness audit.

## Context

Syrantis Core uses API-level tenant isolation today:

- Business routes are protected by `tenantGuard`.
- `workspaceId` comes only from trusted server context.
- Business repositories receive `workspaceId` explicitly.
- Business mutations use `withWorkspaceDb`.
- Cross-workspace access returns `404`.

Future RLS readiness requires task relationship fields to be tenant-safe before policies are enabled.

## Scope

Allowed task relationship fields:

- `organizationId`
- `contactId`
- `leadId`
- `opportunityId`

Allowed changes:

- Task shared contract updates needed to accept and clear task relationship fields.
- Task repository validation inside the task mutation transaction.
- Task service and route result handling for `404` and `400`.
- Task tests for ownership and consistency behavior.
- Docs for this issue.

## Anti-Scope

- No migrations
- No Drizzle schema changes
- No RLS activation
- No `CREATE POLICY`
- No `ENABLE ROW LEVEL SECURITY`
- No `FORCE ROW LEVEL SECURITY`
- No auth changes
- No `tenantGuard` changes
- No `withWorkspaceDb` changes
- No `activity_logs` nullability fix
- No webhook, AI, drafts, jobs, Resend, UI, agents, or background workers
- No raw SQL in business logic
- No business `.delete()`

## Relation Validation Rules

Missing or cross-workspace relation IDs return `404`.

Same-workspace inconsistent relation IDs return `400`.

Rules:

- `contactId + organizationId`: if `contact.organizationId` exists and `organizationId` is non-null, they must match.
- `leadId + organizationId`: if `lead.organizationId` exists and `organizationId` is non-null, they must match.
- `leadId + contactId`: if `lead.contactId` exists and `contactId` is non-null, they must match.
- `opportunityId + organizationId`: if `opportunity.organizationId` exists and `organizationId` is non-null, they must match.
- `opportunityId + contactId`: if `opportunity.contactId` exists and `contactId` is non-null, they must match.
- `opportunityId + leadId`: if `opportunity.leadId` exists and `leadId` is non-null, they must match.

Archived organizations are treated as not found for task relationship validation.

## PATCH Semantics

- If PATCH includes no relationship field, task relationship validation is not re-run.
- If PATCH includes at least one relationship field, the repository loads the existing task in the same transaction, merges current relationship values with provided values, and validates the final relationship state before persisting.
- Explicit `null` clears that relationship.
- Null IDs are not looked up.

## Status Code Matrix

| Case | Status |
| --- | --- |
| Missing relation in current workspace | `404 TASK_NOT_FOUND` |
| Relation exists only in another workspace | `404 TASK_NOT_FOUND` |
| Same-workspace inconsistent relationships | `400 INVALID_REQUEST` |
| Invalid body or invalid UUID | `400 INVALID_REQUEST` |
| Cross-workspace task update/detail | `404 TASK_NOT_FOUND` |
| Successful create | `201` |
| Successful update | `200` |

No `403` or `409` is introduced by this issue.

## Transaction Requirement

Relationship validation and task mutation must occur inside the same `withWorkspaceDb` transaction.

Successful mutations keep existing transactional activity logs:

- `task.created`
- `task.updated`

Failed validation must not write activity logs.

## Acceptance Criteria

- Task create validates all provided relationship IDs against the current workspace.
- Task update validates final relationship state when any relationship field is patched.
- Cross-workspace relation IDs return `404`.
- Same-workspace inconsistent relationships return `400`.
- Explicit null relationship patches clear the relation.
- Successful create/update still write transactional activity logs.
- Failed validation writes no activity log.
- Existing task behavior remains intact.
- No forbidden scope is touched.
