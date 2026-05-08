# API Systemd Supervisor Runbook

## But

Remplacer le lancement manuel `nohup` par systemd pour l'API Syrantis Core uniquement.

Ce runbook est human-only deployment. Les agents ne doivent pas deployer, ne doivent pas executer
`systemctl`, et ne doivent pas lire ou afficher les secrets.

Aucun changement Caddy, env ou app n'est inclus dans cette transition. Le worker reste hors scope.

## Prerequis

- Etre sur le serveur prod.
- Le repo prod est a jour dans `/opt/syrantis/repos/syrantis-core`.
- Le user `syrantis` existe.
- Le fichier env existe: `/opt/syrantis/env/core.prod.env`.
- `pnpm` est accessible par le runtime.
- Ne jamais afficher les secrets.

## Verifications Pre-Transition

Commandes exactes:

```bash
cd /opt/syrantis/repos/syrantis-core
git status
command -v pnpm
id syrantis
test -f /opt/syrantis/env/core.prod.env
sudo -u syrantis test -r /opt/syrantis/env/core.prod.env
ss -ltnp | grep ':8787'
curl http://127.0.0.1:8787/health
curl https://api.syrantis.fr/health
```

Ne jamais utiliser:

```bash
cat /opt/syrantis/env/core.prod.env
echo $DATABASE_URL
grep DATABASE_URL /opt/syrantis/env/core.prod.env
grep SYRANTIS_SESSION_SECRET /opt/syrantis/env/core.prod.env
grep RESEND_API_KEY /opt/syrantis/env/core.prod.env
grep GOOGLE_SHEETS_CREDENTIALS_JSON /opt/syrantis/env/core.prod.env
```

Plus generalement, ne pas utiliser de `grep` qui affiche des valeurs secretes.

## Installer Le Service

Commandes exactes:

```bash
sudo cp ops/systemd/syrantis-api.service /etc/systemd/system/syrantis-api.service
sudo chmod 644 /etc/systemd/system/syrantis-api.service
sudo systemd-analyze verify /etc/systemd/system/syrantis-api.service
sudo systemctl daemon-reload
```

## Stop Ancien Nohup

Commandes sures:

```bash
ss -ltnp | grep ':8787'
kill -TERM <PID>
sleep 5
ss -ltnp | grep ':8787' || true
```

Si le process ne s'arrete pas apres `SIGTERM`, utiliser `SIGKILL` seulement si necessaire:

```bash
kill -KILL <PID>
sleep 2
ss -ltnp | grep ':8787' || true
```

Le port `127.0.0.1:8787` doit etre libre avant le start systemd.

## Start Systemd

Commandes:

```bash
sudo systemctl enable syrantis-api
sudo systemctl start syrantis-api
sudo systemctl status syrantis-api --no-pager
```

## Validation Post-Transition

Commandes exactes:

```bash
systemctl is-active syrantis-api
journalctl -u syrantis-api -n 80 --no-pager
ss -ltnp | grep ':8787'
curl http://127.0.0.1:8787/health
curl https://api.syrantis.fr/health
curl https://admin.syrantis.fr/
curl https://admin.syrantis.fr/app/ops
```

Verifier qu'il existe exactement un listener sur `8787`.

Smokes applicatifs a executer depuis un navigateur ou un client authentifie:

- admin auth smoke
- `/api/admin/ops/health` smoke
- Google Sheets setup status smoke
- pushback status smoke
- optional manual replay smoke
- webhook route smoke should return `MISSING_WEBHOOK_HEADERS` or equivalent non-404 backend response
- `admin.syrantis.fr` root and `/app/ops` SPA fallback still 200

## Maintenance Courante

```bash
sudo systemctl status syrantis-api
sudo systemctl restart syrantis-api
sudo journalctl -u syrantis-api -f
sudo journalctl -u syrantis-api --since "1 hour ago" --no-pager
```

## Rollback Vers Nohup

Commandes exactes:

```bash
sudo systemctl stop syrantis-api
sudo systemctl disable syrantis-api
sudo systemctl daemon-reload
ss -ltnp | grep ':8787' || true
cd /opt/syrantis/repos/syrantis-core
set -a
source /opt/syrantis/env/core.prod.env
set +a
PORT=8787 nohup pnpm --filter @syrantis/api start > /tmp/syrantis-api.log 2>&1 &
curl http://127.0.0.1:8787/health
curl https://api.syrantis.fr/health
```

Ne pas afficher le contenu de `/opt/syrantis/env/core.prod.env` pendant le rollback.

## Troubleshooting

- `status=203/EXEC`: `pnpm` introuvable. Verifier `command -v pnpm` et `ExecStart`.
- `status=217/USER`: le user `syrantis` n'existe pas.
- env unreadable: verifier les permissions du fichier env sans afficher son contenu.
- port in use: un ancien process ecoute encore sur `127.0.0.1:8787`.
- restart loop: consulter `journalctl`, verifier `API_IMPORT_OK`, puis `pnpm build`.
- Caddy 502: l'API n'est pas joignable sur `127.0.0.1:8787`.
