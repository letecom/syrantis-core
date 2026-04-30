.PHONY: install typecheck lint build format format-check db-up db-stop db-down db-logs db-ps db-health db-migrate

install:
	pnpm install

typecheck:
	pnpm typecheck

lint:
	pnpm lint

build:
	pnpm build

format:
	pnpm format

format-check:
	pnpm format:check

db-up:
	docker compose --env-file /opt/syrantis/env/core.prod.env -f ops/docker/docker-compose.yml up -d postgres

db-stop:
	docker compose --env-file /opt/syrantis/env/core.prod.env -f ops/docker/docker-compose.yml stop postgres

db-down:
	docker compose --env-file /opt/syrantis/env/core.prod.env -f ops/docker/docker-compose.yml down

db-logs:
	docker logs -f syrantis-postgres

db-ps:
	docker compose --env-file /opt/syrantis/env/core.prod.env -f ops/docker/docker-compose.yml ps

db-health:
	bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db health'

db-migrate:
	bash -lc 'set -a; source /opt/syrantis/env/core.prod.env; set +a; pnpm --filter @syrantis/db migrate'
