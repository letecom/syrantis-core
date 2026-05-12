# Worker Continuous Runtime Runbook

## But

Installer et valider `syrantis-worker.service` pour que la queue `background_jobs` soit traitee en
continu sans lancement manuel de `worker:once`.

Ce runbook est human-only deployment. Les agents ne doivent pas deployer, ne doivent pas executer
`systemctl`, et ne doivent pas lire ou afficher les secrets.

## Regle Operationnelle

Ne pas lancer `pnpm --filter @syrantis/api worker:once` pendant que `syrantis-worker.service` tourne.

`worker:once` reste un fallback manuel uniquement apres:

```bash
sudo systemctl stop syrantis-worker
systemctl is-active syrantis-worker || true
```

## Prerequis

- Etre sur le serveur prod.
- Le repo prod est a jour dans `/opt/syrantis/repos/syrantis-core`.
- Le user `syrantis` existe.
- Le fichier env existe: `/opt/syrantis/env/core.prod.env`.
- `pnpm` est accessible par le runtime.
- L'API peut rester geree separement par `syrantis-api.service`.
- Ne jamais afficher les secrets.

Commandes sures:

```bash
cd /opt/syrantis/repos/syrantis-core
git status
command -v pnpm
id syrantis
test -f /opt/syrantis/env/core.prod.env
sudo -u syrantis test -r /opt/syrantis/env/core.prod.env
pnpm --filter @syrantis/api worker:check
```

Ne jamais utiliser:

```bash
cat /opt/syrantis/env/core.prod.env
echo $DATABASE_URL
grep DATABASE_URL /opt/syrantis/env/core.prod.env
grep RESEND_API_KEY /opt/syrantis/env/core.prod.env
grep GOOGLE_SHEETS_CREDENTIALS_JSON /opt/syrantis/env/core.prod.env
```

## Installer Le Service

Commandes exactes:

```bash
cd /opt/syrantis/repos/syrantis-core
sudo cp ops/systemd/syrantis-worker.service /etc/systemd/system/syrantis-worker.service
sudo chmod 644 /etc/systemd/system/syrantis-worker.service
sudo systemd-analyze verify /etc/systemd/system/syrantis-worker.service
sudo systemctl daemon-reload
```

## Start Sans Enable

Demarrer sans enable d'abord:

```bash
sudo systemctl start syrantis-worker
systemctl is-active syrantis-worker
sudo systemctl status syrantis-worker --no-pager
sudo journalctl -u syrantis-worker -n 80 --no-pager
```

Verifier que le process tourne comme `syrantis`, pas root:

```bash
ps -eo user,group,pid,cmd | grep '[s]rc/worker.ts run\\|[w]orker:run'
```

## Validation

Pendant cette validation, ne pas lancer `worker:once`.

1. Creer une entree via le public intake valide.
2. Attendre que le worker continu traite la queue.
3. Verifier que le job `score_lead` passe a `completed` automatiquement.
4. Verifier qu'une ligne `lead_scores` existe pour le lead.
5. Verifier que le job `pushback_lead_score` passe a `completed` automatiquement.
6. Verifier que `Score_Log` contient la nouvelle ligne attendue.
7. Verifier qu'un activity log `lead_score_pushback.succeeded` existe.
8. Verifier que le baseline des 5 anciens jobs `score_lead` failed n'a pas change.
9. Verifier les journaux recents sans secret:

```bash
sudo journalctl -u syrantis-worker --since "30 minutes ago" --no-pager
```

Preuve que `worker:once` n'est plus necessaire:

- aucune commande `pnpm --filter @syrantis/api worker:once` n'est lancee pendant le test
- `score_lead` est complete par `syrantis-worker.service`
- `pushback_lead_score` est complete par `syrantis-worker.service`
- `Score_Log` est append sans intervention manuelle

## Enable Apres Validation

Activer au boot seulement apres validation:

```bash
sudo systemctl enable syrantis-worker
systemctl is-enabled syrantis-worker
```

## Maintenance Courante

```bash
sudo systemctl status syrantis-worker --no-pager
sudo journalctl -u syrantis-worker -f
sudo journalctl -u syrantis-worker --since "1 hour ago" --no-pager
sudo systemctl restart syrantis-worker
```

## Rollback

Rollback vers fallback manuel:

```bash
sudo systemctl stop syrantis-worker
sudo systemctl disable syrantis-worker
sudo systemctl daemon-reload
systemctl is-active syrantis-worker || true
cd /opt/syrantis/repos/syrantis-core
pnpm --filter @syrantis/api worker:once
```

Ne relancer `worker:once` qu'apres l'arret confirme du service.

## Safety Greps

Depuis le repo:

```bash
grep -Rni "nohup\\|&$" apps/api/src ops/systemd || true
grep -Rni "User=root" ops/systemd || true
grep -Rni "agent-workspaces\\|codex" ops/systemd || true
grep -Rni "DATABASE_URL\\|RESEND_API_KEY\\|GOOGLE\\|PRIVATE_KEY\\|client_email" ops/systemd apps/api/src/worker* || true
grep -Rni "listen\\|serve\\|app.listen" apps/api/src/worker* || true
grep -Rni "setImmediate\\|process.nextTick" apps/api/src/worker* || true
grep -Rni "localStorage\\|sessionStorage\\|document.cookie" apps/web/src || true
```

Expected:

- no `nohup`, background `&`, root user, agent workspace path, listener, `setImmediate`, or
  `process.nextTick` finding in worker runtime files
- secret-name findings may appear only as forbidden-pattern checks in tests/docs, not as secret
  values in systemd or worker logs

## Troubleshooting

- `status=203/EXEC`: `pnpm` introuvable. Verifier `command -v pnpm`.
- `status=217/USER`: le user `syrantis` n'existe pas.
- preflight failed: lancer `pnpm --filter @syrantis/api worker:check` sans afficher l'env.
- restart loop: consulter journald, verifier le build et la preflight.
- queue idle: verifier qu'un job est `pending`, `run_after <= now()`, et que `scheduled_at` n'est
  pas dans le futur pour les retries `send_email`.
