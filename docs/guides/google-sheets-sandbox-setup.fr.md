# Guide sandbox Google Sheets

Ce guide aide le fondateur a preparer une feuille Google Sheets de test et a verifier que le serveur Syrantis peut y ajouter une ligne puis la relire.

Ce n'est pas le connecteur CRM. Ce n'est pas un push-back de production. C'est une verification manuelle d'acces Google Sheets avant de coder le moindre flux produit.

## Pourquoi Sheets d'abord

Google Sheets est le chemin le plus rapide pour simuler le "CRM" reel d'une petite entreprise qui travaille encore avec un tableau.

Pour Syrantis, cela permet de valider vite:

- la creation d'un support commercial simple;
- l'acces API depuis le serveur;
- l'append d'une preuve compacte;
- la relecture de cette preuve;
- la gestion des variables d'environnement sans commettre de secret.

Sheets est utile pour le sandbox fondateur parce qu'il est visible, modifiable, facile a partager, et assez proche de la maniere dont beaucoup de TPE suivent leurs prospects.

## Ce que cette verification valide

- Le fondateur peut provisionner une feuille Google Sheets sandbox.
- Le projet Google Cloud peut appeler Google Sheets API.
- Le compte de service peut s'authentifier.
- La feuille est partagee avec le compte de service.
- Syrantis peut ajouter une ligne de test.
- Syrantis peut relire la plage configuree.
- Les credentials restent hors Git.

## Ce que cette verification ne valide pas

- Aucun connecteur CRM.
- Aucun push-back de production.
- Aucune synchronisation bidirectionnelle.
- Aucune idempotence metier.
- Aucun outbox.
- Aucun worker.
- Aucune route API.
- Aucun lien avec Dolibarr ou Twenty.
- Aucune garantie sur un schema client reel.
- Aucun import de leads.
- Aucune mutation de `email_sends`, `activity_logs`, ou d'une table metier.

## Etape 1 - Creer une Google Sheet sandbox

Dans Google Drive, creer une nouvelle feuille nommee par exemple:

```txt
Syrantis Sandbox - Google Sheets Verification
```

Utiliser une feuille dediee au test. Ne pas utiliser un fichier client ou une feuille contenant des donnees personnelles.

## Etape 2 - Creer les colonnes

Sur le premier onglet, nomme idealement `Sheet1`, ajouter les colonnes suivantes en ligne 1:

```txt
kind | timestamp | message | issue | verification_id
```

La plage par defaut du script est:

```txt
Sheet1!A:E
```

Si le nom d'onglet change, il faudra configurer `GOOGLE_SHEETS_RANGE`.

## Etape 3 - Creer un projet Google Cloud

Dans Google Cloud Console, creer un projet dedie au sandbox, par exemple:

```txt
syrantis-sheets-sandbox
```

Eviter de reutiliser un projet production ou un projet client.

## Etape 4 - Activer Google Sheets API

Dans le projet Google Cloud:

1. Ouvrir "APIs & Services".
2. Aller dans "Library".
3. Chercher "Google Sheets API".
4. Cliquer sur "Enable".

Le script utilise l'API Google Sheets directement. Il n'utilise pas Apps Script.

## Etape 5 - Creer un compte de service

Dans "IAM & Admin" puis "Service Accounts":

1. Creer un compte de service dedie au sandbox.
2. Lui donner un nom clair, par exemple `syrantis-sheets-sandbox`.
3. Ne pas lui donner de role large sur le projet si ce n'est pas necessaire pour le sandbox.

Le plus important est l'adresse email du compte de service. Elle ressemble a:

```txt
syrantis-sheets-sandbox@project-id.iam.gserviceaccount.com
```

## Etape 6 - Generer et telecharger la cle JSON

Depuis le compte de service:

1. Ouvrir l'onglet "Keys".
2. Creer une nouvelle cle.
3. Choisir le format JSON.
4. Telecharger le fichier.

Ne pas commettre ce fichier. Ne pas le coller dans une issue, un README, une capture d'ecran, un chat, ou un rapport.

## Etape 7 - Partager la Sheet avec le compte de service

Dans Google Sheets:

1. Cliquer sur "Share".
2. Ajouter l'adresse email du compte de service.
3. Donner le role "Editor" pour ce sandbox.
4. Confirmer le partage.

Sans ce partage explicite, le serveur peut s'authentifier mais ne peut pas lire ou modifier la feuille.

## Etape 8 - Copier le spreadsheet ID

Ouvrir la feuille et copier l'identifiant dans l'URL.

Format d'URL:

```txt
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Ne pas coller un vrai `SPREADSHEET_ID` dans ce depot. Le garder dans l'environnement serveur.

## Etape 9 - Stocker les credentials hors Git

Placer le fichier JSON dans un emplacement hors depot, par exemple sous un repertoire d'environnement controle par l'operateur.

Exemple de forme attendue, sans valeur reelle:

```txt
/opt/syrantis/env/google-sheets-sandbox-service-account.json
```

Le depot Git ne doit contenir ni cle JSON, ni `.env`, ni valeur brute de credential.

## Etape 10 - Configurer les variables dans `/opt/syrantis/env/core.prod.env`

Ajouter uniquement les noms de variables et leurs valeurs reelles dans le fichier d'environnement operationnel approuve.

```txt
GOOGLE_SHEETS_CREDENTIALS_JSON
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_RANGE
```

`GOOGLE_SHEETS_CREDENTIALS_JSON` accepte deux formats:

- chemin absolu vers le fichier JSON du compte de service;
- contenu JSON brut.

Preferer le chemin absolu pour eviter d'exposer une cle dans l'historique shell ou les sorties de commande.

Ne pas creer de fichier `.env` dans le depot. Ne pas modifier ce fichier depuis un agent sans approbation humaine explicite.

## Etape 11 - Lancer le script de verification

Depuis le depot:

```bash
pnpm --filter @syrantis/api verify:sheets-sandbox
```

En cas de succes, la sortie contient:

```txt
SHEETS_SANDBOX_VERIFY_OK
```

Le script affiche aussi la plage utilisee, un identifiant de verification, et un identifiant de spreadsheet masque. Il n'affiche pas la cle privee ni le contenu des credentials.

## Depannage

### 403 permission denied

Causes probables:

- la Google Sheet n'est pas partagee avec l'email du compte de service;
- l'API Google Sheets n'est pas activee dans le bon projet;
- la cle JSON ne correspond pas au compte de service partage;
- le compte de service n'a pas le droit d'ecrire dans la feuille.

Action: verifier l'etape 7, puis relancer le script.

### 404 spreadsheet not found

Causes probables:

- `GOOGLE_SHEETS_SPREADSHEET_ID` est incorrect;
- l'ID copie contient `/edit`, `gid`, ou d'autres morceaux de l'URL;
- le compte de service n'a pas acces a cette feuille.

Action: recopier uniquement l'ID entre `/d/` et `/edit`, puis verifier le partage.

### invalid credentials

Causes probables:

- `GOOGLE_SHEETS_CREDENTIALS_JSON` pointe vers un fichier absent;
- le contenu JSON est invalide;
- la cle JSON n'est pas une cle de compte de service;
- la cle a ete supprimee ou desactivee cote Google Cloud.

Action: verifier le chemin absolu, regenerer une cle sandbox si necessaire, puis stocker le nouveau fichier hors Git.

### bad range

Causes probables:

- l'onglet ne s'appelle pas `Sheet1`;
- la plage n'a pas le format attendu;
- les colonnes A a E n'existent pas dans l'onglet cible.

Action: renommer l'onglet en `Sheet1` ou configurer `GOOGLE_SHEETS_RANGE` avec une plage comme `Sandbox!A:E`.

### service account not shared on the Sheet

Symptomes probables:

- 403 permission denied;
- 404 spreadsheet not found malgre un ID correct.

Action: partager la feuille avec l'adresse email du compte de service depuis l'interface Google Sheets. Ne pas coller cette adresse dans un document public.

## Notes de securite

- Ne jamais commettre la cle JSON.
- Ne jamais coller les credentials dans un README, une spec, une issue, un rapport, une capture d'ecran, ou un chat.
- Ne jamais exposer le spreadsheet ID dans une capture publique sauf acceptation explicite.
- Garder le compte de service en moindre privilege pour ce sandbox.
- Utiliser une feuille dediee, sans donnees client reelles.
- Supprimer ou faire tourner la cle si elle a ete exposee.

## Anti-scope explicite

Cette issue ne cree pas:

- CRM connector;
- outbox;
- worker;
- route;
- installation Dolibarr;
- installation Twenty;
- synchronisation bidirectionnelle;
- adaptateur CRM generique;
- mutation de donnees metier Syrantis;
- migration de base de donnees;
- dependance CI a des credentials Google reels.
