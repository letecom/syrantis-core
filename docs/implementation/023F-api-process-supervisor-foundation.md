# 023F API Process Supervisor Foundation Implementation

## Resume

023F prepare le remplacement du lancement manuel `nohup`/`pnpm` de l'API Syrantis Core par un
service systemd propre, redemarrable, auditable et reproductible.

Cette issue est ops-only. Elle ne modifie pas le code applicatif, ne deploie rien, n'execute pas
`systemctl`, ne modifie pas Caddy, et ne touche pas a `/opt/syrantis/env/core.prod.env`.

## Decision Systemd

systemd est choisi comme superviseur de l'API production parce qu'il est deja le mecanisme standard
du serveur Linux pour:

- demarrer un service au boot
- redemarrer apres crash
- exposer les logs dans journald
- rendre l'etat du process lisible avec `systemctl status`
- garder une definition versionnee et reproductible du runtime

Alternatives ecartees:

- `nohup`: utile comme rollback manuel, mais fragile comme mode normal.
- PM2: ajoute une couche Node specifique inutile pour ce besoin.
- Docker: hors scope, car aucun changement runtime Compose/image n'est approuve ici.
- SupervisorD: redondant avec systemd sur ce serveur.

## Pourquoi API-Only

Le verrou actuel concerne l'API publique reverse-proxyee par Caddy sur `127.0.0.1:8787`. Le service
023F supervise uniquement ce process et conserve les ports, env, routes, Caddy, et comportements
applicatifs existants.

## Worker Hors Scope

La supervision du worker est explicitement hors scope. Le worker queue montre des anciens
`score_lead` failed, mais 023F ne doit ni nettoyer ces jobs, ni creer de service worker, ni changer
la strategie d'execution background.

La suite recommandee pour ce sujet est 023H Worker Queue Cleanup / Failed Job Review.

## Scope Exact

- Ajout de `ops/systemd/syrantis-api.service`.
- Ajout du runbook human-only `docs/runbooks/api-systemd-supervisor.md`.
- Ajout du present rapport d'implementation.
- Mise a jour du README pour documenter systemd comme mode runtime API normal.

## Anti-Scope Exact

- Aucun fichier `apps/api/src/*`.
- Aucun fichier `apps/web/src/*`.
- Aucun fichier `packages/db/*`.
- Aucune migration.
- Aucun Caddyfile.
- Aucun Dockerfile ou `docker-compose`.
- Aucun fichier env prod.
- Aucune route backend.
- Aucun bouton UI.
- Aucun sudoers.
- Aucun worker service.
- Aucun secret.
- Aucun deploiement prod.

## Design Du Service

Le service `syrantis-api.service` est pret a etre copie manuellement vers
`/etc/systemd/system/syrantis-api.service`.

Design retenu:

- `User=syrantis` et `Group=syrantis`.
- `WorkingDirectory=/opt/syrantis/repos/syrantis-core`.
- `EnvironmentFile=/opt/syrantis/env/core.prod.env`.
- `PORT=8787` et `NODE_ENV=production`.
- `ExecStart=/usr/bin/env pnpm --filter @syrantis/api start`.
- `Restart=always` avec `RestartSec=5`.
- logs stdout/stderr vers journald avec `SyslogIdentifier=syrantis-api`.
- `NoNewPrivileges=true`.

Les directives de hardening plus restrictives sont presentes mais commentees avec la note
`enable only after validation`, afin de permettre une transition prudente sans changer le runtime
effectif avant validation humaine.

## Securite Env

Le service reference uniquement le chemin du fichier env. Il ne contient aucune valeur de secret,
aucune URL de base de donnees, aucune API key, et aucun champ de credential Google.

Le runbook interdit explicitement les commandes qui affichent le contenu de
`/opt/syrantis/env/core.prod.env` ou des variables secretes.

## Rollback

Le rollback documente:

- arret et disable du service systemd
- `daemon-reload`
- verification que le port `8787` est libre
- relance manuelle via `set -a`, `source /opt/syrantis/env/core.prod.env`, puis `nohup`
- verification des health checks local et public

`nohup` reste donc un mecanisme de rollback manuel, pas le mode normal.

## Validation Prod

La validation production est human-only et documentee dans le runbook:

- status systemd actif
- logs journald recents
- exactement un listener sur `8787`
- health local `http://127.0.0.1:8787/health`
- health public `https://api.syrantis.fr/health`
- admin auth smoke
- `/api/admin/ops/health` smoke
- Google Sheets setup status smoke
- pushback status smoke
- optional manual replay smoke
- webhook smoke avec reponse backend non-404
- `admin.syrantis.fr` root et `/app/ops` toujours servis en fallback SPA

## Prochaine Issue Recommandee

Recommandation principale:

- 023H Worker Queue Cleanup / Failed Job Review, si l'objectif est de traiter le worker queue
  degraded et les anciens `score_lead` failed.

Option future seulement:

- 023G Admin Controlled API Restart, uniquement si un restart UI est souhaite plus tard. Ce n'est
  pas obligatoire pour 023F.
