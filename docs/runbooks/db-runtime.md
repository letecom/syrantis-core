# DB Runtime Runbook

## Purpose

Run the Syrantis Core PostgreSQL runtime safely with secrets outside the repository.

## Create Runtime Env

Create `/opt/syrantis/env/core.prod.env` manually as an operator. Agents must not read, copy, or print this file.

Generate a password:

```sh
openssl rand -base64 32
```

Required variables:

```sh
POSTGRES_DB=syrantis
POSTGRES_USER=syrantis
POSTGRES_PASSWORD=<generated-password>
DATABASE_URL=postgresql://syrantis:<generated-password>@127.0.0.1:5432/syrantis?sslmode=disable
```

Recommended permissions:

```sh
chmod 600 /opt/syrantis/env/core.prod.env
```

## Validate Compose Syntax

From the repository root:

```sh
docker compose --env-file ops/docker/.env.example -f ops/docker/docker-compose.yml config
```

This uses dummy values only.

## Start Database

Run as the `syrantis` runtime user from the production repository:

```sh
cd /opt/syrantis/repos/syrantis-core
make db-up
```

## Check Container State

```sh
docker ps --filter name=syrantis-postgres
make db-ps
```

## Check Database Health

```sh
make db-health
```

This loads `/opt/syrantis/env/core.prod.env` into the command environment and runs the DB package health check.

## Run Migrations

```sh
make db-migrate
```

Review the target environment before running migrations. Migrations are explicit and do not run automatically.

## List Tables

```sh
docker exec -it syrantis-postgres psql -U syrantis -d syrantis -c "\dt"
```

## Stop Database

```sh
make db-stop
```

Use `make db-down` only when you want to stop and remove the Compose container/network. The named volume is not removed by this target.

## Backup Warning

Use the `pg_dump` backup runbook. Do not copy the raw Docker volume while PostgreSQL is running.

## Troubleshooting

- If `make db-up` fails, confirm the command is running as the `syrantis` user with Docker access.
- If Compose reports missing `POSTGRES_PASSWORD`, create or fix `/opt/syrantis/env/core.prod.env`.
- If `make db-health` fails, check `docker logs -f syrantis-postgres`.
- If migrations fail, check that `DATABASE_URL` points to `127.0.0.1:5432` and the database container is healthy.
- If port `5432` is busy, inspect local services before changing the bind. Do not expose PostgreSQL publicly.
