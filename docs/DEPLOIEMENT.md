# HORUS — architecture et déploiement en production

> Décidé le 11 octobre 2026. HORUS suit l'architecture cible de la mairie (**plateforme-commune**) :
> PostgreSQL + API NestJS/Prisma + Keycloak, **sans Supabase**. Il est hébergé sur le serveur de
> production de la mairie (`92.222.89.206`), à l'adresse **https://horus.mairiederouffiac.fr**,
> dans une stack **cloisonnée**.

## Architecture

```
 Navigateur / PWA (index.html · fdo.html · admin.html)
        │  HTTPS
        ▼
 nginx de l'hôte ── horus.mairiederouffiac.fr ──► /var/www/horus (fichiers statiques)
        │                                    └──► /api/*  →  127.0.0.1:3110  (horus-api)
        │
        └── auth.mairiederouffiac.fr ──► Keycloak de la mairie, realm « horus » (séparé de « commune »)

 Stack Docker « horus » (réseau horus_net, aucun lien avec plateforme-commune)
   horus-api       NestJS + Prisma — gardes globaux, refus par défaut, grille des rôles côté serveur
   horus-postgres  PostgreSQL 16 dédié — AUCUN port publié
```

| Brique | Rôle | Où |
|---|---|---|
| **Keycloak, realm `horus`** | Comptes, mots de passe, **double authentification obligatoire**, rôle (un par compte) | `infra/keycloak/realm-horus.json` |
| **API `horus-api`** | Toutes les règles : lecture par quartier, actions, main courante MCG, messagerie, IA, administration des comptes | `api/` |
| **PostgreSQL `horus-postgres`** | Signalements, déclarants, main courante, messages, journal d'administration, fiches membres (nom, quartier, actif) | `api/prisma/` |
| **PWA** | 3 pages installables, hors ligne, mode démo si `config.js` vaut `null` | `horus-pwa/horus-pwa/` |

**Rôles** (rôle de realm Keycloak) : `admin` (comptes uniquement), `referent` (son quartier), `moderateur`,
`gend`, `pn`, `pm`, `asvp`. La grille est écrite **une seule fois**, en fonctions pures testées :
`api/src/domaine/regles.ts`.

**Cloisonnement** : base dédiée sans port, réseau Docker dédié, API sur `127.0.0.1` seulement, realm
Keycloak séparé (un gendarme ou un référent n'a **pas** de compte « commune »). Un compte désactivé
dans l'administration est refusé **immédiatement**, sans attendre l'expiration du jeton.

**Données personnelles** : les coordonnées du déclarant sont dans une table à part, servies aux seules
forces de l'ordre ; le fil public ne montre ni numéro de rue ni déclarant ; le rapport IA ne reçoit
que des **compteurs** (aucune description, adresse ni identité).

## Tester en local (poste de développement)

```bash
cd infra && docker compose -f docker-compose.dev.yml up -d --build
bash dev/dev-comptes.sh                # un compte par rôle — mot de passe Horus-Test-2026!
python dev/test-api.py                 # 43 vérifications de la grille des droits, contre la vraie API
cd dev && npm i playwright-core@1 && node parcours.js   # parcours navigateur réels (connexion Keycloak incluse)
cd ../../api && npm test               # règles métier (fonctions pures)
```
PWA : http://localhost:8090 · Keycloak : http://localhost:8180 (admin / admin).

## Mise en production — étapes (chacune validée avant la suivante)

### 0. DNS — Baptiste
Zone `mairiederouffiac.fr` : enregistrement **A** `horus` → `92.222.89.206` (TTL 3600). Rien d'autre.

### 1. Secrets
Sur le serveur, `~/horus/infra/.env` (droits 600), d'après `infra/.env.example` :
`POSTGRES_PASSWORD` et `HORUS_ADMIN_SECRET` générés (`python3 -c 'import secrets;print(secrets.token_urlsafe(32))'`),
`ANTHROPIC_API_KEY` si le rapport IA est souhaité.

### 2. Realm Keycloak `horus` — Baptiste
**Par la console** (recommandé) : https://auth.mairiederouffiac.fr/admin → menu des realms →
**Create realm** → *Resource file* : `infra/keycloak/realm-horus.prod.json` → **Create**.
Puis **Clients → horus-admin → Credentials** : copier le *Client secret* et le transmettre à Karim
par un canal sûr (jamais par e-mail en clair) → il va dans `HORUS_ADMIN_SECRET` du `.env`.

**Ou par script**, depuis le serveur : `cd ~/horus/infra && KC_ADMIN_PASSWORD=… bash keycloak/creer-realm.sh`
(le secret est alors celui du `.env`).

⛔ Dans les deux cas : on **crée** un realm neuf. Ne pas toucher au realm `commune`, ne pas recréer le
conteneur Keycloak. ⚠ Ne pas modifier un client par un `PUT` partiel de l'Admin API : Keycloak remplace
toute la représentation et réinitialise les autres réglages (constaté en test) — passer par la console.

### 3. Stack HORUS + PWA (depuis le poste de dev, racine git)
```bash
ssh ubuntu@92.222.89.206 'sudo mkdir -p /var/www/horus && sudo chown ubuntu:ubuntu /var/www/horus'
./infra/deploy.sh
```
Construit l'image, applique les migrations Prisma, démarre `horus-api` et `horus-postgres`, publie la
PWA avec le `config.js` de production. Vérifier : `curl http://127.0.0.1:3110/api/health` sur le serveur,
et que l'API joint Keycloak : `docker exec horus-api wget -qO- https://auth.mairiederouffiac.fr/realms/horus`.

### 4. nginx + certificat
```bash
sudo install -m644 ~/horus/infra/nginx/horus-securite.conf ~/horus/infra/nginx/horus-proxy.conf /etc/nginx/snippets/
# a) bloc 80 seul (le certificat n'existe pas encore) :
sed '/listen 443/,$d' ~/horus/infra/nginx/horus.conf | sed '$d' | sudo tee /etc/nginx/sites-available/horus >/dev/null
sudo ln -sf /etc/nginx/sites-available/horus /etc/nginx/sites-enabled/horus && sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/html -d horus.mairiederouffiac.fr
# b) fichier complet :
sudo install -m644 ~/horus/infra/nginx/horus.conf /etc/nginx/sites-available/horus && sudo nginx -t && sudo systemctl reload nginx
```
Puis tester **depuis une autre machine** : `curl -I https://horus.mairiederouffiac.fr`.

### 5. Premier administrateur
Par la console Keycloak (realm `horus`) : **Users → Create new user** (e-mail comme nom d'utilisateur,
prénom, nom, *Email verified*, *Required user actions* : **Configure OTP**) → **Credentials → Set
password** (temporaire) → **Role mapping → Assign role → admin**.
Ou par script, une fois la stack démarrée :
```bash
cd ~/horus/infra && bash keycloak/premier-admin.sh prenom.nom@mairiederouffiac.fr "Prénom" "Nom"
```
Mot de passe provisoire affiché une fois ; à la première connexion : nouveau mot de passe +
double authentification. Ensuite, **tous les comptes se gèrent dans `admin.html`**.

### 6. Sauvegardes
```bash
chmod +x ~/horus/infra/backup.sh && ~/horus/infra/backup.sh      # 1er passage : crée la clé de chiffrement
( crontab -l; echo "20 3 * * * ~/horus/infra/backup.sh >> ~/horus/backups/backup.log 2>&1" ) | crontab -
```
⚠ Copier `~/horus/backups/.cle` en lieu sûr, et brancher une copie hors serveur (`HORUS_BACKUP_COPIE`).
Faire **un test de restauration** avant l'ouverture.

### 7. Recette
Recette habitant / référent / FDO / admin sur `horus.mairiederouffiac.fr`.
Fly.io (`horus-rouffiac.fly.dev`) reste une **démonstration figée** (bandeau « aucun signalement n'est
transmis », déploiement manuel uniquement) : ne pas le détruire. Les PWA installées depuis Fly sont
la démo, pas la production.

## Mises à jour ultérieures
`./infra/deploy.sh` (tout) ou `./infra/deploy.sh --front` (pages seules). Bumper `CACHE_NAME` dans
`sw.js` à chaque évolution du front. Une nouvelle migration Prisma s'applique au déploiement suivant.

## Reste à décider par la mairie
- **SMTP** pour « mot de passe oublié » (sinon : réinitialisation par l'administrateur, déjà en place).
- **Durée de conservation** des signalements et des coordonnées des déclarants (RGPD).
- **Référents réels** (prénom + initiale affichés sur la page publique, **aucun téléphone**) avec leur accord.
