# BusLive

Savoir où est son bus en temps réel, grâce aux autres passagers.

BusLive est une application de transport en commun pour la Tunisie. Un passager
dans le bus partage sa position, qui devient la position du bus pour tout le
monde. Les passagers peuvent aussi signaler un bus qui n'est pas venu, un bus
plein, un retard, etc. Lancement à Mahdia et Ksour Essef.

## Structure

```
apps/
  api/       API NestJS + Prisma + PostGIS + Socket.io
  mobile/    App React Native (Expo)
  admin/     Tableau de bord React + Vite
packages/
  shared/    Types et schémas zod partagés
docker/      Scripts d'initialisation de la base
docs/        Documentation (architecture…)
```

Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Historique des
étapes dans [JOURNAL.md](JOURNAL.md).

## Prérequis

- **Node.js 22.18 ou plus** (voir `.nvmrc`)
- **Corepack** (fourni avec Node) pour pnpm
- **Docker Desktop** (PostgreSQL + PostGIS)
- **Git**

## Installation

1. Activer pnpm (une seule fois par poste). La version utilisée est figée dans
   le champ `packageManager` du `package.json`.

   ```powershell
   # Windows sans droits administrateur (PowerShell) : raccourcis dans le dossier npm de l'utilisateur
   corepack enable pnpm --install-directory "$env:APPDATA\npm"
   ```

   ```bash
   # macOS / Linux, ou Windows en administrateur
   corepack enable
   ```

2. Installer les dépendances (cette commande installe aussi le hook git
   pre-commit) :

   ```bash
   pnpm install
   ```

3. Créer les fichiers d'environnement, puis y mettre **le même mot de passe**
   (`POSTGRES_PASSWORD` dans `.env`, et dans `DATABASE_URL` de `apps/api/.env`) :

   ```bash
   # bash / Git Bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   ```

   ```powershell
   # PowerShell
   Copy-Item .env.example .env
   Copy-Item apps/api/.env.example apps/api/.env
   ```

4. Démarrer la base de données, appliquer les migrations et insérer les données
   initiales (gouvernorats + réseau de démonstration de Mahdia et Ksour Essef) :

   ```bash
   pnpm db:up
   pnpm --filter @buslive/api prisma:deploy
   pnpm --filter @buslive/api db:seed
   ```

   ⚠️ Les lignes et horaires de démonstration sont **inventés** (voir
   `apps/api/prisma/seed/data/mahdia-demo.ts`).

5. Lancer l'API :

   ```bash
   pnpm dev:api
   ```

   - Santé : <http://localhost:3000/api/v1/health>
   - Santé de la base : <http://localhost:3000/api/v1/health/ready>
   - Documentation Swagger : <http://localhost:3000/api/docs>

6. Lancer l'app mobile sur un téléphone Android avec Expo Go (dans un second
   terminal). La configuration à faire une seule fois (adresse IP du PC,
   pare-feu Windows) est décrite dans [apps/mobile/README.md](apps/mobile/README.md).

   ```bash
   pnpm dev:mobile    # puis scanner le QR code avec Expo Go
   ```

## Commandes utiles

| Commande          | Effet                                                  |
| ----------------- | ------------------------------------------------------ |
| `pnpm build`      | Compile les packages                                   |
| `pnpm typecheck`  | Vérifie les types TypeScript                           |
| `pnpm test`       | Lance les tests unitaires Jest                         |
| `pnpm test:e2e`   | Lance les tests de bout en bout (base démarrée)        |
| `pnpm dev:api`    | Lance l'API avec rechargement automatique              |
| `pnpm dev:mobile` | Lance l'app mobile (Expo, QR code pour Expo Go)        |
| `pnpm lint`       | Analyse le code avec ESLint (`lint:fix` pour corriger) |
| `pnpm format`     | Formate le code avec Prettier                          |
| `pnpm db:up`      | Démarre PostgreSQL + PostGIS                           |
| `pnpm db:psql`    | Ouvre une console SQL                                  |
| `pnpm db:logs`    | Affiche les logs de la base                            |
| `pnpm db:down`    | Arrête les conteneurs (les données sont conservées)    |

Interface web de la base (optionnelle) :
`docker compose --profile tools up -d` puis <http://localhost:8080>
(serveur `db`, identifiants du fichier `.env`).

## Avant chaque commit

Le hook Husky lance automatiquement ESLint et Prettier sur les fichiers indexés.
Si ESLint trouve une erreur qu'il ne sait pas corriger, le commit est refusé.
