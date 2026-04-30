# Issue 009A: Workspace Transaction Helper

## Objectif

Préparer PostgreSQL RLS sans l’activer en ajoutant un helper applicatif `withWorkspaceDb(workspaceId, fn)`.

Ce helper exécute les requêtes Drizzle dans une transaction et définit le workspace courant avec un setting PostgreSQL transaction-local.

## Pourquoi Préparer RLS Sans L’Activer

Syrantis applique déjà l’isolation tenant au niveau applicatif via `tenantGuard`, les services, et les repositories qui reçoivent `workspaceId` explicitement.

La prochaine étape de défense en profondeur sera RLS côté PostgreSQL. Cette issue prépare le runtime pattern nécessaire sans modifier le schéma, sans policy RLS, et sans migration SQL:

- ouvrir une transaction;
- définir `app.current_workspace_id` pour la durée de la transaction;
- exécuter les requêtes métier dans cette transaction.

Le setting utilise `select set_config('app.current_workspace_id', ${workspaceId}, true)`. Le troisième argument `true` rend le setting transaction-local.

## Fichiers Autorisés

- `apps/api/src/lib/db.ts`
- `apps/api/src/repositories/tasks.ts`
- `docs/specs/009a-workspace-transaction-helper.md`
- `docs/implementation/009a-workspace-transaction-helper.md`

## Fichiers Interdits

- `packages/db/src/schema.ts`
- `packages/db/migrations/*`
- `packages/db/src/migrate.ts`
- `packages/db/src/client.ts`
- `packages/db/src/health.ts`
- `ops/docker/*`
- `apps/api/src/middleware/tenant.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/tasks.ts`
- `apps/web/*`
- `.env*`
- `Caddyfile`
- `Dockerfile`

## Comportement Attendu

- `withWorkspaceDb<T>(workspaceId, fn)` vit dans `apps/api/src/lib/db.ts`.
- Le helper utilise le client global existant via `getGlobalDbClient()`.
- Le helper ne lit pas Hono `Context`.
- Le helper ne lit pas `DATABASE_URL` directement.
- Le helper ne crée pas de pool.
- Le helper ouvre une transaction Drizzle.
- La transaction exécute `select set_config('app.current_workspace_id', ${workspaceId}, true)`.
- Le résultat de `fn(tx)` est retourné.
- Le repository tasks continue de recevoir `workspaceId` explicitement.
- Chaque fonction du repository tasks exécute sa requête via `withWorkspaceDb(input.workspaceId, async (tx) => ...)`.
- Les requêtes restent en Drizzle query builder.
- Aucun comportement API ne change.

## Risques

- Le setting transaction-local ne protège rien tant que RLS n’est pas activé. L’isolation effective reste donc applicative dans cette issue.
- Les futures repositories devront adopter le même helper pour être prêtes à RLS.
- Une future policy RLS devra lire exactement le même setting PostgreSQL.

## Rollback

Rollback simple:

- restaurer `apps/api/src/repositories/tasks.ts` pour utiliser directement le client global;
- supprimer `apps/api/src/lib/db.ts`;
- supprimer les docs Issue 009A.

Aucune migration ou modification schema n’est impliquée.

## Checks

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- import safety sans `DATABASE_URL`
- audit absence migration/schema/forbidden scope
- audit présence de `set_config('app.current_workspace_id'`
- audit absence de `SET app.current_workspace_id` et `SET LOCAL app.current_workspace_id`
- audit usage de `withWorkspaceDb` dans le repository tasks
