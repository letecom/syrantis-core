# Worker Failed Jobs Review Runbook

## Objective

Review failed background worker jobs safely enough to understand whether Ops Health is degraded
because of old debt or because new jobs are actively failing.

This runbook is for interpretation only. It does not approve retry, delete, archive, worker
restart, provider changes, AI model changes, shell operations, or arbitrary SQL.

## Safe Admin Check

Use the Ops Panel check:

- `/app/ops`
- `Worker Failed Summary`

Or the existing API route:

- `POST /api/admin/ops/checks/worker-failed-summary`

The check returns only aggregate data: total failed count, groups by type, attempt range,
oldest/latest timestamps, age bucket, and recommended next action.

## Safe SQL For Manual Review

Allowed:

```sql
select
  type,
  status,
  count(*) as count,
  min(attempts) as min_attempts,
  max(attempts) as max_attempts,
  min(created_at) as oldest_created_at,
  max(updated_at) as latest_updated_at
from background_jobs
where status = 'failed'
group by type, status
order by count desc, type asc;
```

This query shows aggregate state only. It does not read job IDs, payloads, locks, raw errors,
metadata, prompts, AI output, or lead/contact/email content.

## Forbidden Commands And Queries

Do not run:

```sql
select * from background_jobs;
select payload_json from background_jobs;
select last_error from background_jobs;
select metadata_json::text from activity_logs;
```

Also forbidden:

- any query that displays payloads
- any query that displays prompts
- any query that displays raw AI output
- any query that displays lead, contact, or email content
- any delete/update/retry/archive query
- worker restart commands
- shell or logs viewer behavior from the Ops Panel
- arbitrary SQL execution from application code

## Interpretation

`0 failed`:

- The worker queue has no failed job debt.
- Expected check status: `ok`.
- Recommended next action: `none`.

Historical failed jobs:

- Failed jobs exist, but latest updates are older than 7 days.
- Expected check status: `degraded`.
- Recommended next action: `review_historical_failures`.
- This can explain why Ops Health is degraded even when pending and running are both zero.

Fresh or recent failed jobs:

- Failed jobs were updated within the last 7 days.
- Expected check status: `degraded`.
- Recommended next action: `investigate_recent_failures`.
- Treat this as a possible active worker/runtime issue.

Unknown age:

- A failed group has no usable timestamp.
- Keep review aggregate-only and escalate to human-approved database inspection if needed.

## Why Not Retry Automatically

Automatic retry can repeat a broken operation, duplicate external side effects, or obscure the
original failure pattern. Retries require a dedicated issue defining authorization, idempotency,
audit logging, backoff behavior, and production validation.

## Why Not Delete Automatically

Deleting failed jobs destroys diagnostic evidence and may hide business impact. Deletion requires a
dedicated issue defining authorization, audit logging, rollback behavior, retention impact, legal
impact, and production validation.

## 023I Validation For New `score_lead`

When 023I or a later intake flow creates a new lead that should be scored:

1. Trigger the approved inbound/test intake path for one known safe lead.
2. Let the worker process the resulting `score_lead` job through the normal runtime.
3. Run `Worker queue summary` in `/app/ops`.
4. Run `Worker Failed Summary` in `/app/ops`.
5. Confirm no new fresh or recent `score_lead` failures appear.
6. If historical `score_lead` failures remain, confirm their latest updated timestamp predates the
   new validation.

Do not validate by reading payloads, prompts, lead content, raw errors, or job IDs.

## Rollback

Rollback is code-only:

- revert the `worker-failed-summary` check registration and service branch
- revert the aggregate repository method
- revert the `/app/ops` button and rendering
- revert related tests and docs

No database rollback is required because 023H adds no migration, table, column, worker action, or
data mutation.
