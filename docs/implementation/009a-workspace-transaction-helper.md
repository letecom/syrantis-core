# Issue 009A: Workspace Transaction Helper Implementation

## Fichiers Modifiés

- `apps/api/src/lib/db.ts`
- `apps/api/src/repositories/tasks.ts`
- `docs/specs/009a-workspace-transaction-helper.md`
- `docs/implementation/009a-workspace-transaction-helper.md`

## Implémentation

- Ajout de `withWorkspaceDb<T>(workspaceId, fn)` dans `apps/api/src/lib/db.ts`.
- Le helper utilise `getGlobalDbClient()` et ouvre une transaction Drizzle.
- La transaction exécute `select set_config('app.current_workspace_id', ${workspaceId}, true)`.
- Le troisième argument `true` rend le setting transaction-local.
- Le helper appelle ensuite `fn(tx)` et retourne son résultat.
- Le helper ne lit pas Hono `Context`, ne lit pas `DATABASE_URL` directement, et ne crée pas de pool.
- Le repository tasks utilise maintenant `withWorkspaceDb(input.workspaceId, async (tx) => ...)` pour `listTasks`, `findTaskById`, `createTask`, et `updateTask`.

## Commandes Lancées

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `env -u DATABASE_URL node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK')).catch((e) => { console.error(e); process.exit(1); })"`
- `git status --short | grep 'packages/db/migrations' || true`
- `git status --short | grep 'packages/db/src/schema.ts' || true`
- `git status --short | grep -E ' apps/web/| ops/docker/| packages/db/| apps/api/src/middleware/tenant.ts| apps/api/src/routes/auth.ts| apps/api/src/routes/tasks.ts|(^|/)\\.env|Caddyfile|Dockerfile' || true`
- `grep -R "set_config('app.current_workspace_id'" apps/api/src/lib/db.ts`
- `grep -R "SET app.current_workspace_id\\|SET LOCAL app.current_workspace_id" apps/api/src || true`
- `grep -R "withWorkspaceDb" apps/api/src/repositories/tasks.ts`

## Résultats Des Checks

- `pnpm test`: passé, 5 fichiers de tests et 24 tests.
- `pnpm typecheck`: passé.
- `pnpm lint`: passé.
- `pnpm build`: passé.
- Import safety sans `DATABASE_URL`: passé avec `API_IMPORT_OK`.

## Audits

- Aucune migration modifiée ou créée.
- Aucun changement `packages/db/src/schema.ts`.
- Aucun changement forbidden scope détecté dans `apps/web`, `ops/docker`, `packages/db`, `tenant.ts`, `auth.ts`, `tasks.ts`, `.env*`, `Caddyfile`, ou `Dockerfile`.
- `apps/api/src/lib/db.ts` contient `select set_config('app.current_workspace_id', ${workspaceId}, true)`.
- Aucun `SET app.current_workspace_id` ou `SET LOCAL app.current_workspace_id` dans `apps/api/src`.
- `apps/api/src/repositories/tasks.ts` importe `withWorkspaceDb`.
- `listTasks`, `findTaskById`, `createTask`, et `updateTask` utilisent `withWorkspaceDb(input.workspaceId, async (tx) => ...)`.

## Risques Restants

- RLS n’est pas activé dans cette issue.
- Aucune policy PostgreSQL ne lit encore `app.current_workspace_id`.
- Les futures repositories devront utiliser ce helper pour bénéficier du même pattern.

## Mention Explicite

- Aucune migration.
- Aucun RLS activé.
- Aucun changement schema.
- Aucun changement API.
- Aucun changement auth ou tenantGuard.
