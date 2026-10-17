# Journal de BusLive

Une section par phase : ce qui a été fait, pourquoi, et comment le tester.

---

## Phase 0 — Initialisation du monorepo (17/10/2026)

### Ce qui a été fait et pourquoi

- **Monorepo pnpm workspaces** (`apps/*`, `packages/*`). Un seul dépôt et une
  seule installation. Les apps partagent le code de `packages/shared` sans
  publication sur npm.
- **pnpm 10.34.7 via Corepack** (champ `packageManager`). Toute l'équipe utilise
  la même version. pnpm 12 (la plus récente) ne démarre pas avec Corepack 0.34,
  et pnpm 10 est celle qui a le plus de recul avec Expo et Prisma.
  `corepack enable` échoue sans droits administrateur (écriture dans
  `C:\Program Files\nodejs`), d'où l'installation des raccourcis dans
  `%APPDATA%\npm`.
- **`.npmrc`** :
  - `engine-strict` refuse l'installation si la version de Node est trop
    ancienne ;
  - `shell-emulator=true` fait que les scripts `pnpm run` se comportent de la
    même façon sous Windows (au lieu de `cmd.exe`) et sous macOS/Linux.
- **`allowBuilds`** (dans `pnpm-workspace.yaml`) : pnpm n'exécute les scripts
  d'installation que des paquets autorisés. Seul `esbuild` (utilisé par tsup) en
  a besoin.
- **TypeScript 6.0.3 strict** (`tsconfig.base.json`). TypeScript 7 n'est pas
  encore supporté par typescript-eslint ni par ts-jest.
  `noUncheckedIndexedAccess` oblige à vérifier qu'un élément de tableau existe
  avant de l'utiliser.
- **ESLint 10 (flat config) + typescript-eslint + Prettier 3**, avec
  `eslint-config-prettier` pour éviter les conflits entre les deux outils.
  Fins de ligne LF imposées (`.gitattributes`, `.editorconfig`, Prettier) pour
  éviter les faux diffs sous Windows.
- **Husky + lint-staged 16** : avant chaque commit, ESLint (`--fix`) et Prettier
  passent sur les fichiers indexés. lint-staged 17 exige Node 22.22+, d'où la
  version 16.
- **`packages/shared`** :
  - les schémas zod `GeoPointSchema` et `TunisianGeoPointSchema`, plus la
    fonction `isInTunisia`, qui servira à rejeter les positions GPS aberrantes ;
  - les langues `fr`/`ar` avec `isRtl` ;
  - les codes de signalement (`NOT_CAME`, `PASSED`, `FULL`, `DELAYED`,
    `BREAKDOWN`, `STOP_MOVED`).

  Le tout est compilé par **tsup** en ESM (mobile, admin) et CJS (API NestJS),
  et testé avec **Jest + ts-jest** (7 tests).

- **Docker Compose** :
  - PostgreSQL 17.5 + PostGIS 3.5.2, avec les extensions `postgis`, `pg_trgm`
    (recherche approximative de noms d'arrêts) et `unaccent`, et le fuseau
    `Africa/Tunis` ;
  - Adminer optionnel (profil `tools`) ;
  - les identifiants sont lus dans `.env`, et Compose refuse de démarrer s'ils
    manquent.
- **Apps `api`, `mobile`, `admin`** : dossiers réservés (`package.json` minimal +
  README). Le vrai code est généré dans leur phase, avec les versions stables du
  moment.
- **Documentation** :
  - `CLAUDE.md` : règles de travail et conventions ;
  - `docs/ARCHITECTURE.md` : vue d'ensemble, avec la place prévue pour les
    gouvernorats activables et les paiements ;
  - `README.md` ;
  - ce journal.

### Fichiers créés

```
.editorconfig            .env.example           .gitattributes
.gitignore               .npmrc                 .nvmrc
.prettierignore          .prettierrc.json       .husky/pre-commit
.vscode/extensions.json  .vscode/settings.json
CLAUDE.md  JOURNAL.md  README.md  docs/ARCHITECTURE.md
package.json  pnpm-workspace.yaml  pnpm-lock.yaml
tsconfig.base.json  eslint.config.mjs  docker-compose.yml
docker/postgres/init/01-extensions.sql
apps/api/{package.json,README.md}
apps/mobile/{package.json,README.md}
apps/admin/{package.json,README.md}
packages/shared/{package.json,tsconfig.json,tsup.config.ts,jest.config.cjs}
packages/shared/src/{index.ts,geo.ts,geo.test.ts,i18n.ts,i18n.test.ts,reports.ts}
```

Fichier local non versionné : `.env` (copie de `.env.example`).

### Commandes pour lancer et tester

```bash
pnpm install
pnpm build && pnpm typecheck && pnpm test
pnpm lint && pnpm format:check
pnpm db:up
echo "SELECT PostGIS_Lib_Version();" | pnpm db:psql
```

Résultats obtenus : build OK, typecheck OK, 7/7 tests, lint et Prettier sans
erreur. La base est saine (healthy), PostGIS 3.5.2 répond, et la distance
Mahdia–Ksour Essef calculée par PostGIS donne 11,4 km.

### À configurer soi-même

- Changer `POSTGRES_PASSWORD` dans `.env`, ainsi que le mot de passe dans
  `DATABASE_URL`.
- Optionnel : mettre Node à jour en 22.22+ (ou en Node 24 LTS), ce qui
  permettrait de passer à lint-staged 17.
- Installer les extensions VS Code recommandées (ESLint, Prettier,
  EditorConfig).

### Message de commit proposé

```
chore: initialise le monorepo BusLive

- workspaces pnpm (apps/api, apps/mobile, apps/admin, packages/shared)
- TypeScript strict, ESLint, Prettier, Husky + lint-staged
- package shared : schémas zod (GPS, langues, signalements) et tests Jest
- Docker Compose PostgreSQL 17 + PostGIS 3.5
- documentation : README, architecture, règles de travail, journal
```
