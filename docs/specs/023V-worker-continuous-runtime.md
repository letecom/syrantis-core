# 023V - Worker Continuous Runtime

## Objective

023V turns the Syrantis worker into a continuous runtime supervised by systemd.

The target production flow is:

```txt
public intake
  -> score_lead pending
  -> continuous worker
  -> lead_scores
  -> pushback_lead_score pending
  -> continuous worker
  -> Score_Log
```

Manual `worker:once` remains available as a fallback, but it is no longer required during normal
production operation after `syrantis-worker.service` is validated and enabled.

## Scope

- Preserve `pnpm --filter @syrantis/api worker:once`.
- Harden `pnpm --filter @syrantis/api worker:run`.
- Process one background job at a time using the existing dispatcher.
- Add `ops/systemd/syrantis-worker.service`.
- Add production runbook, spec, and implementation report.
- Add worker runtime tests.

## Runtime Behavior

`worker:run` performs worker preflight first. If preflight fails, it exits `1` before claiming jobs.

After preflight, the loop:

- claims and processes at most one ready job per iteration
- uses the same `processNextBackgroundJob` business logic as `worker:once`
- sleeps `100ms` after a processed job before checking again
- sleeps `5000ms` when no ready job exists
- logs a safe error code and sleeps `5000ms` after transient loop errors
- does not process batches or run jobs concurrently

`SIGTERM` and `SIGINT` set a shutdown flag. The worker finishes any already claimed job, does not
claim another job, and exits `0`.

## Claim Safety

The existing repository claim remains the concurrency boundary:

- only `pending` ready jobs are claimed
- `run_after <= now()` is required
- `send_email` retry `scheduled_at` must be null or due
- stale `running` jobs can be reclaimed after the existing lock timeout
- `failed`, `completed`, and `cancelled` jobs are not claimed
- `FOR UPDATE SKIP LOCKED` prevents double claim between workers

## Systemd Requirements

Production worker supervision is separate from the API service.

The service must:

- run as `User=syrantis` and `Group=syrantis`
- use `WorkingDirectory=/opt/syrantis/repos/syrantis-core`
- reference `/opt/syrantis/env/core.prod.env` without embedding secrets
- use journald through stdout/stderr
- restart on crash

The service must not use `BindsTo=syrantis-api.service`, `User=root`, `nohup`, `&`, log files, agent
workspace paths, or embedded secret values.

## Out Of Scope

- migrations, tables, columns, schema changes
- routes or UI
- Caddy, Docker, or production env changes
- scoring business logic changes
- Google Sheets pushback business logic changes
- cleanup of the 5 historical failed jobs
- admin restart button or arbitrary shell execution
