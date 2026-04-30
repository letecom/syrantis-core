# Issue 005: Runtime DB Foundation Implementation

## Files Changed

- `ops/docker/docker-compose.yml`
- `ops/docker/.env.example`
- `docs/specs/005-runtime-db-foundation.md`
- `docs/implementation/005-runtime-db-foundation.md`
- `docs/runbooks/db-runtime.md`
- `Makefile`

## Docker Service Design

- Defines only one service: `postgres`.
- Uses `postgres:16-alpine`.
- Uses container name `syrantis-postgres`.
- Persists data in named volume `syrantis-postgres-data`.
- Binds PostgreSQL to `127.0.0.1:5432:5432` only.
- Adds a `pg_isready` healthcheck.
- Connects the service to the `syrantis-internal` bridge network.

## Env Strategy

- Real runtime values stay outside the repository in `/opt/syrantis/env/core.prod.env`.
- The repository contains only `ops/docker/.env.example` with dummy values.
- Makefile commands reference the external env path but do not print it.
- Agents must not read or copy the external runtime env file.

## Commands Added

- `make db-up`
- `make db-stop`
- `make db-down`
- `make db-logs`
- `make db-ps`
- `make db-health`
- `make db-migrate`

## Checks Run

- `docker compose --env-file ops/docker/.env.example -f ops/docker/docker-compose.yml config`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --name-only -- apps packages/db packages/shared ops/docker/README.md ops/README.md ops/docker/Dockerfile Dockerfile Caddyfile`
- `find . -name '.env*' ! -path './ops/docker/.env.example' -o -name 'Caddyfile' -o -name 'Dockerfile'`
- `rg -n "0\\.0\\.0\\.0|5432:5432|127\\.0\\.0\\.1:5432:5432|POSTGRES_PASSWORD|change-me|core\\.prod\\.env|/opt/syrantis/env" ops/docker/docker-compose.yml ops/docker/.env.example Makefile docs/specs/005-runtime-db-foundation.md docs/implementation/005-runtime-db-foundation.md docs/runbooks/db-runtime.md`
- `git status --short`

## Checks Result

- Docker Compose config validation: passed with dummy `ops/docker/.env.example`; no container was started.
- `pnpm test`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- Forbidden path audit: passed; no `apps`, `packages/db`, `packages/shared`, Caddy, Dockerfile, or unrelated `ops` files changed.
- Forbidden runtime file audit: passed; no real `.env`, Caddyfile, or Dockerfile was created. The only `.env*` file is the allowed dummy `ops/docker/.env.example`.
- Public bind audit: passed; Compose binds PostgreSQL to `127.0.0.1:5432:5432` and contains no `0.0.0.0` bind.
- Secret audit: passed; no real secret values were added. The repository contains only dummy example values and external env path references.

## Deviations

- Commands ran outside the sandbox because command startup still fails with `bwrap: loopback: Failed RTM_NEWADDR`.
- Docker Compose validation was syntax/config only. No containers were started because `syrantis-ai` is not the Docker runtime user.

## Risks Remaining

- Docker lifecycle commands must be run manually by the `syrantis` runtime user.
- Migration execution is explicit and should only run against the intended database.
- No app deployment, auth, tenant guard, RLS, jobs, email, UI, or business routes were added.

## Manual Post-Merge Steps

Run as the `syrantis` runtime user after creating `/opt/syrantis/env/core.prod.env` manually:

```sh
cd /opt/syrantis/repos/syrantis-core
docker compose --env-file ops/docker/.env.example -f ops/docker/docker-compose.yml config
make db-up
make db-ps
docker ps --filter name=syrantis-postgres
make db-health
make db-migrate
docker exec -it syrantis-postgres psql -U syrantis -d syrantis -c "\dt"
```

## Next Issue Recommendation

Add the next narrow runtime-backed foundation slice, such as auth/session persistence, after the database is healthy and migrated.
