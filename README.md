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

3. Créer le fichier d'environnement, puis y changer le mot de passe :

   ```bash
   cp .env.example .env              # bash / Git Bash
   Copy-Item .env.example .env       # PowerShell
   ```

4. Démarrer la base de données :

   ```bash
   pnpm db:up
   ```

## Commandes utiles

| Commande         | Effet                                                  |
| ---------------- | ------------------------------------------------------ |
| `pnpm build`     | Compile les packages                                   |
| `pnpm typecheck` | Vérifie les types TypeScript                           |
| `pnpm test`      | Lance les tests Jest                                   |
| `pnpm lint`      | Analyse le code avec ESLint (`lint:fix` pour corriger) |
| `pnpm format`    | Formate le code avec Prettier                          |
| `pnpm db:up`     | Démarre PostgreSQL + PostGIS                           |
| `pnpm db:psql`   | Ouvre une console SQL                                  |
| `pnpm db:logs`   | Affiche les logs de la base                            |
| `pnpm db:down`   | Arrête les conteneurs (les données sont conservées)    |

Interface web de la base (optionnelle) :
`docker compose --profile tools up -d` puis <http://localhost:8080>
(serveur `db`, identifiants du fichier `.env`).

## Avant chaque commit

Le hook Husky lance automatiquement ESLint et Prettier sur les fichiers indexés.
Si ESLint trouve une erreur qu'il ne sait pas corriger, le commit est refusé.
