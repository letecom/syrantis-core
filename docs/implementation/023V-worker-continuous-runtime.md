# 023V - Worker Continuous Runtime Implementation

## Summary

023V hardens the existing `worker:run` script into a continuous runtime suitable for systemd
supervision. It preserves `worker:once` and keeps all background job business handling in
`processNextBackgroundJob`.

## Files Changed

- `apps/api/src/worker.ts`
- `apps/api/src/tests/worker-runtime.test.ts`
- `apps/api/src/tests/background-jobs.test.ts`
- `ops/systemd/syrantis-worker.service`
- `docs/specs/023V-worker-continuous-runtime.md`
- `docs/implementation/023V-worker-continuous-runtime.md`
- `docs/runbooks/worker-continuous-runtime.md`
- `README.md`

## Architecture

`worker:once` and `worker:run` share the same processing function:

```txt
runWorkerMode
  -> preflight
  -> processNextBackgroundJob
```

`worker:run` wraps that same processor in a single-job loop:

```txt
preflight
  -> while not shutting down
    -> process one job
    -> sleep 100ms when a job was processed
    -> sleep 5000ms when idle
    -> log safe transient code and sleep 5000ms on loop errors
```

There is no batch processing, no parallel job execution, no `Promise.all` over jobs, and no CPU spin.

## Shutdown Behavior

`SIGTERM` and `SIGINT` set a shutdown flag. If no job has been claimed, the worker exits without
processing. If a job is already running, it finishes that job, skips the next sleep, does not claim a
new job, and exits `0`.

## Systemd

`ops/systemd/syrantis-worker.service` is a separate production service from
`syrantis-api.service`.

It uses:

- `User=syrantis`
- `Group=syrantis`
- `WorkingDirectory=/opt/syrantis/repos/syrantis-core`
- `EnvironmentFile=/opt/syrantis/env/core.prod.env`
- `ExecStart=/usr/bin/env pnpm --filter @syrantis/api worker:run`
- journald stdout/stderr logging
- `Restart=always`

It intentionally does not use `BindsTo=syrantis-api.service`, `nohup`, background shell operators,
log files, agent workspace paths, or embedded secrets.

## Safety

023V adds no migration, route, UI, Caddy change, Docker change, production env change, scoring logic
change, pushback business logic change, or failed-job cleanup.

The claim repository already uses `FOR UPDATE SKIP LOCKED` and only claims ready jobs. Additional
tests cover failed jobs and future `run_after` jobs remaining untouched.

## Validation

Expected validation commands:

```bash
git diff --check
pnpm install --frozen-lockfile
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db test
pnpm --filter @syrantis/shared build
pnpm --filter @syrantis/api test -- worker background-jobs ai-scoring lead-score-pushback scoring-status public-leads
pnpm --filter @syrantis/api test
pnpm --filter @syrantis/api typecheck
pnpm --filter @syrantis/web test
pnpm typecheck
pnpm lint
pnpm build
env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"
```

Safety greps are listed in the runbook and should produce no forbidden findings for the worker
service or worker runtime.
