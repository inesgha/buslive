# Déploiement de BusLive (VPS + Docker Compose)

Une seule machine (VPS), une seule instance de l'API. Tout est décrit dans
[`deploy/`](../deploy) :

| Fichier                         | Rôle                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `docker-compose.prod.yml`       | Services : base, migrations, API, Caddy, sauvegardes                   |
| `api.Dockerfile`                | Image de l'API (Node 22.19, utilisateur non-root `node`)               |
| `caddy.Dockerfile`, `Caddyfile` | Serveur web : HTTPS automatique, proxy vers l'API, admin sous `/admin` |
| `.env.production.example`       | Modèle de configuration (à copier en `.env.production` sur le serveur) |
| `backup.sh`, `restore.sh`       | Sauvegarde quotidienne (14 jours) et restauration                      |

```
Internet ──443──▶ Caddy ──┬─ /api/*, /socket.io/*, /t/*, /legal/* ──▶ api:3000 ──▶ db:5432
                          └─ /admin/*  (fichiers statiques)
```

La base n'expose **aucun port** : seuls les autres conteneurs la joignent.
L'admin est sur le même domaine que l'API : son cookie de session
(`SameSite=Strict`) fonctionne sans configuration CORS particulière.

## 1. Préparer le serveur (une seule fois)

Un VPS Ubuntu 24.04 LTS, **2 vCPU et 2 Go de RAM** suffisent au lancement
(voir le test de charge dans [SECURITE.md](SECURITE.md#test-de-charge)).

```bash
# Connexion en root la première fois, puis création d'un utilisateur
adduser buslive && usermod -aG sudo buslive
# Clé SSH : depuis ton PC, « ssh-copy-id buslive@IP »
# Puis dans /etc/ssh/sshd_config : PasswordAuthentication no, PermitRootLogin no
sudo systemctl restart ssh

# Mises à jour de sécurité automatiques
sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades

# Pare-feu : SSH, HTTP (redirection + certificat), HTTPS (TCP et UDP pour HTTP/3)
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443
sudo ufw enable

# Docker (dépôt officiel)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker buslive   # se reconnecter ensuite
```

> ⚠ Docker publie ses ports **en contournant ufw**. Seuls 80 et 443 (Caddy) sont
> publiés dans `docker-compose.prod.yml` : ne jamais ajouter `ports:` à la base.

**DNS** : créer un enregistrement `A` (et `AAAA` en IPv6) du domaine vers l'IP du
VPS **avant** le premier démarrage : Caddy en a besoin pour obtenir le certificat.

## 2. Premier déploiement

```bash
git clone <url-du-dépôt> buslive && cd buslive/deploy
cp .env.production.example .env.production
nano .env.production              # domaine, mots de passe, secrets (openssl rand -hex 32)
chmod 600 .env.production

# Clé Firebase (notifications push), copiée depuis ton PC :
mkdir -p secrets && chmod 700 secrets
#   scp firebase-service-account.json buslive@IP:~/buslive/deploy/secrets/
# Le conteneur lit ce fichier avec l'utilisateur « node » (uid 1000) :
chmod 640 secrets/firebase-service-account.json && sudo chown 1000 secrets/firebase-service-account.json

mkdir -p backups
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Ordre de démarrage, géré par Compose : `db` (sain) → `migrate` (applique les
migrations Prisma puis s'arrête) → `api` (saine sur `/api/v1/health/ready`) → `caddy`.

Données initiales (les 24 gouvernorats, **sans** les données de démonstration,
car `NODE_ENV=production`) :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm -w /app/apps/api migrate node_modules/.bin/tsx prisma/seed/index.ts
```

(Dans l'image, `prisma db seed` ne trouve pas `tsx` : on appelle le script directement.)

Puis :

1. donner le rôle ADMIN à ton compte (après l'avoir créé dans l'app) :
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production \
     run --rm -w /app/apps/api migrate node_modules/.bin/tsx prisma/scripts/set-role.ts <email> ADMIN
   ```
2. importer les vraies lignes (GTFS, voir [gtfs/README.md](gtfs/README.md)) : copier
   le dossier sur le serveur (ici `deploy/gtfs/`), faire un essai à blanc, puis
   relancer avec `--apply` :
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production \
     run --rm -w /app/apps/api -v "$PWD/gtfs:/gtfs:ro" migrate \
     node_modules/.bin/tsx prisma/scripts/gtfs-import.ts /gtfs \
     --governorate TN-53 --prefix MAH --line-type URBAN
   ```
3. activer le gouvernorat dans l'admin (`https://<domaine>/admin/`).

Vérifications :

```bash
curl https://<domaine>/api/v1/health/ready      # {"status":"ok",…}
curl -I https://<domaine>/admin/                # 200
docker compose -f docker-compose.prod.yml ps    # api « healthy », migrate « exited (0) »
```

## 3. Mettre à jour

```bash
cd ~/buslive && git pull
cd deploy && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Les nouvelles migrations sont appliquées automatiquement avant le redémarrage
de l'API. Pendant quelques secondes, l'API est indisponible (une seule
instance) : l'app mobile garde les horaires en cache et réessaie.

**Avant une mise à jour qui contient une migration**, faire une sauvegarde à la
main (section 5).

### Revenir en arrière

```bash
git log --oneline -5                 # repérer la version précédente
git checkout <commit>                # ou git revert <commit>
cd deploy && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

⚠ Prisma ne défait **pas** une migration déjà appliquée. Si la version fautive
contenait une migration incompatible avec l'ancien code : restaurer la
sauvegarde faite avant la mise à jour (section 5).

## 4. Journaux

```bash
docker compose -f docker-compose.prod.yml logs -f api            # API (JSON, une ligne par événement)
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '"level":"error"'
docker compose -f docker-compose.prod.yml logs -f caddy          # accès HTTP et certificats
docker compose -f docker-compose.prod.yml logs backup            # résultat des sauvegardes
```

Les journaux de l'API ne contiennent ni adresse IP, ni corps de requête, ni
position ; les liens de suivi (`/t/<jeton>`) sont masqués. Chaque requête porte
un `requestId` (renvoyé dans l'en-tête `X-Request-Id`) pour retrouver une erreur
signalée. Docker garde au plus 5 × 10 Mo par service.

## 5. Sauvegardes et restauration

Le service `backup` fait un `pg_dump` chaque jour dans `deploy/backups/` et
supprime les fichiers de plus de 14 jours. Le premier passage a lieu au démarrage.

**Copier les sauvegardes hors du serveur** (sinon une panne du disque emporte
tout), par exemple chaque nuit depuis une autre machine :

```bash
rsync -a buslive@IP:~/buslive/deploy/backups/ ~/sauvegardes-buslive/
```

Sauvegarde à la main (avant une mise à jour) :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec db \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backups/avant-maj-$(date +%F).dump
```

Restauration (arrête l'API, remplace toutes les données, redémarre) :

```bash
./restore.sh backups/buslive-20261019-030000.dump
```

**Tester la restauration** une fois par trimestre, sur une machine de test :
une sauvegarde jamais restaurée n'est pas une sauvegarde.

## 6. Secrets

| Secret                    | Où                       | Rotation                                                               |
| ------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`       | `.env.production`        | Changer puis redémarrer : les access tokens (15 min) sont invalidés,   |
|                           |                          | les sessions continuent grâce aux refresh tokens                       |
| `POSTGRES_PASSWORD`       | `.env.production` (×2)   | `ALTER USER` dans la base, puis modifier les deux lignes et redémarrer |
| Clé Firebase              | `secrets/`               | Nouvelle clé dans la console Firebase, supprimer l'ancienne            |
| Clé Google Maps (Android) | EAS (variables de build) | Restreinte au nom du paquet et à l'empreinte SHA-1 de l'app            |

Aucun de ces fichiers n'est dans git (`.gitignore`) ni dans les images Docker
(`.dockerignore`).

## 7. Plusieurs instances (plus tard)

L'API garde en mémoire les bus en direct, la limitation des requêtes et le
cache des alertes : elle doit rester **une seule instance**. Pour en lancer
plusieurs, il faudra d'abord passer ces trois éléments sur Redis (adaptateur
Redis de Socket.io, compteurs partagés) ; voir [SECURITE.md](SECURITE.md).
