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

---

## Phase 1 — API de base (17/10/2026)

### Ce qui a été fait et pourquoi

- **NestJS 12 dans `apps/api`**, compilé en CommonJS (`module: NodeNext`).
  - Préfixe versionné `/api/v1` : une future v2 pourra cohabiter avec la v1 sans
    casser les anciennes versions de l'app mobile.
  - `helmet` ajoute les en-têtes de sécurité.
  - CORS est limité aux origines de `CORS_ORIGINS`.
  - Arrêt propre : les connexions à la base sont fermées à l'arrêt de l'API.
  - Toute cette configuration HTTP est regroupée dans `setup-app.ts`, partagé
    avec les tests e2e, qui vérifient donc exactement ce qui tourne en
    production.
- **Variables d'environnement validées par zod** (`src/config/env.schema.ts`).
  L'API refuse de démarrer si la configuration est invalide, avec un message
  qui liste chaque erreur.
- **Un `.env` par app** : `apps/api/.env` contient `DATABASE_URL`, `PORT` et
  `CORS_ORIGINS`. Le `.env` racine ne sert plus qu'à Docker.
- **Prisma 7.10.1** (dernière version stable ; l'étiquette npm `latest` pointe
  vers une 8.0.0-rc) :
  - la configuration est dans `prisma.config.ts` ;
  - la connexion passe par le driver adapter `@prisma/adapter-pg` ;
  - le client est généré en CJS dans `src/generated/prisma`, ignoré par git et
    régénéré par `pnpm install`.
- **Migration `0_init`** : elle crée les extensions `postgis`, `pg_trgm` et
  `unaccent`. Le script Docker ne s'exécute qu'en local : en production, ce
  sont les migrations qui font foi.
- **Santé avec `@nestjs/terminus`** :
  - `/api/v1/health` (liveness) ne touche pas à la base ;
  - `/api/v1/health/ready` (readiness) interroge PostgreSQL et PostGIS, avec un
    délai maximal de 3 s, et répond 503 en cas de panne.

  Si la base est indisponible au démarrage, l'API démarre quand même et
  `/ready` signale le problème.

- **Swagger** sur `/api/docs`, hors production.
- **Type partagé** `LivenessResponse` (zod) ajouté dans `@buslive/shared`. Il
  sert à l'API et pourra servir à l'admin.

### Écarts par rapport au plan (dus à Node 22.19)

- **Pas de `@nestjs/cli`** : toutes ses versions 12 exigent Node ≥ 22.22.3, via
  `@nestjs/schematics` puis `@angular-devkit`. Forcer une ancienne version ne
  suffisait pas. Le build passe donc par `tsc` et le mode dev par `tsc-watch`.
  On perd seulement le générateur `nest generate`.
- **Tests Jest en mode ESM** : NestJS 12 est publié uniquement en ESM. L'API
  fonctionne en CommonJS, parce que Node 22 sait charger de l'ESM depuis du
  CommonJS. Jest, en revanche, ne le sait qu'à partir de Node 24.9. Les tests
  sont donc exécutés en ESM :
  - lancement avec `--experimental-vm-modules` ;
  - configuration dans `jest.base.cjs` et `tsconfig.jest.json` ;
  - `import { jest } from '@jest/globals'` dans les tests.

  Le jour où Node passe à 24, ces deux contournements peuvent être retirés.

- **`prisma.config.ts` lit `process.env.DATABASE_URL`** au lieu de
  `env('DATABASE_URL')`. Sinon, `pnpm install` échouait sur un clone neuf ou en
  CI : `prisma generate` tourne au `postinstall` et n'a pas besoin de la base.
- **pnpm `allowBuilds`** :
  - `prisma` et `@prisma/engines` sont autorisés : ils téléchargent le moteur
    de migrations ;
  - `@scarf/scarf`, la télémétrie de swagger-ui, est refusé.

### Fichiers créés ou modifiés

```
apps/api/package.json, README.md, .env.example (créés / remplacés)
apps/api/tsconfig.json, tsconfig.build.json, tsconfig.jest.json
apps/api/jest.base.cjs, jest.config.cjs, jest.e2e.config.cjs
apps/api/prisma.config.ts
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/migration_lock.toml
apps/api/prisma/migrations/0_init/migration.sql
apps/api/src/main.ts, setup-app.ts, app.module.ts
apps/api/src/config/env.schema.ts, env.schema.test.ts
apps/api/src/prisma/prisma.module.ts, prisma.service.ts
apps/api/src/health/health.module.ts, health.controller.ts,
                    health.controller.test.ts, postgis.health.ts
apps/api/test/health.e2e-test.ts
packages/shared/src/health.ts (créé), index.ts (modifié)
package.json (scripts build:shared, dev:api, test:e2e)
pnpm-workspace.yaml (allowBuilds), pnpm-lock.yaml
eslint.config.mjs (décorateurs NestJS, fichiers .cjs, code généré ignoré)
.gitignore, .prettierignore (client Prisma généré)
.env.example (DATABASE_URL déplacée vers apps/api)
CLAUDE.md, README.md, JOURNAL.md
```

Fichier local non versionné : `apps/api/.env`.

### Commandes pour lancer et tester

```bash
pnpm install
pnpm db:up
pnpm --filter @buslive/api prisma:deploy
pnpm dev:api
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/ready
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```

Résultats obtenus :

- lint, format, typecheck et build sans erreur ;
- tests unitaires : 7 dans shared et 7 dans l'API ; tests e2e : 4 sur la vraie
  base ;
- `/health` répond 200 et `/health/ready` répond 200 avec PostGIS 3.5.2 ;
- base arrêtée : `/ready` répond 503 pendant que `/health` reste à 200, puis
  `/ready` revient à 200 au redémarrage de la base, sans relancer l'API.

### À configurer soi-même

- Si tu changes le mot de passe dans `.env`, change-le aussi dans `DATABASE_URL`
  de `apps/api/.env`. Les caractères spéciaux doivent y être encodés (`@` →
  `%40`).
- Ignorer la notification « Update available 7.10.1 -> 8.0.0-rc » de Prisma.
- Recommandé : passer à Node 24 LTS (≥ 24.9) pour retirer les deux
  contournements ci-dessus.

### Message de commit proposé

```
feat(api): socle NestJS, Prisma 7 et routes de santé

- NestJS 12 : préfixe /api/v1, helmet, CORS, arrêt propre, Swagger (/api/docs)
- validation des variables d'environnement avec zod
- Prisma 7 (adapter pg) et migration initiale des extensions PostGIS
- /health (liveness) et /health/ready (PostgreSQL + PostGIS, 503 si panne)
- tests unitaires et e2e (Jest en mode ESM)
```

---

## Phase 2 — Authentification (17/10/2026)

### Ce qui a été fait et pourquoi

- **Identifiant : email + mot de passe**, comme tu l'as choisi. La colonne
  `phone` (+216, unique, facultative) et le schéma `TunisianPhoneSchema` sont
  prêts pour une future connexion par SMS.
- **Mots de passe hachés avec argon2id** (`@node-rs/argon2`, paramètres OWASP :
  19 Mio, 2 itérations). Le paquet fournit des binaires précompilés : aucun
  script d'installation à autoriser.
- **Deux jetons** :
  - un access token JWT HS256 de 15 min, avec émetteur et destinataire
    vérifiés, et seul l'algorithme HS256 accepté ;
  - un refresh token opaque de 256 bits valable 30 jours, dont **seule
    l'empreinte SHA-256** est stockée.
- **Rotation avec détection de réutilisation** : chaque `/auth/refresh`
  remplace le jeton. Si un ancien jeton revient, toute la « famille » (la
  session) est révoquée. Une mise à jour conditionnelle garantit qu'une seule
  requête peut utiliser un jeton donné, même si deux arrivent en même temps.
- **Sécurisé par défaut** : `JwtAuthGuard` est global, et `@Public()` ouvre
  explicitement une route. `@MinRole()`, avec la hiérarchie
  USER < MODERATOR < ADMIN, est prêt pour la modération.
- **Routes** : `register`, `login`, `refresh`, `logout` et `me` sous
  `/api/v1/auth`.
  - Même message pour un email inconnu et pour un mauvais mot de passe, avec un
    temps de réponse constant (hachage factice).
  - Un champ `role` envoyé par le client est ignoré.
  - Un email déjà pris renvoie 409.
- **Validation avec zod** : les schémas de `@buslive/shared` (`RegisterSchema`,
  `LoginSchema`, `AuthResponseSchema`…) serviront aussi à l'app mobile. Côté
  API :
  - `ZodValidationPipe` renvoie 400 avec, pour chaque champ en erreur, son
    chemin, un code et un message ;
  - Swagger affiche les formats grâce à `z.toJSONSchema`, et le bouton
    « Authorize » permet d'utiliser un jeton.
- **Base de données** : tables `users` et `refresh_tokens` en snake_case. Les
  enums `Role` et `Locale` sont vérifiés par un test contre `@buslive/shared`.
- **Tests e2e sur une base séparée `buslive_test`**, créée et migrée
  automatiquement. Le vidage des tables refuse toute base qui ne finit pas par
  `_test`.

### Écarts par rapport au plan

- **Limitation des tentatives : guard maison au lieu de `@nestjs/throttler`.**
  `@nestjs/throttler` est publié en CommonJS et charge NestJS 12 (ESM). Il
  fonctionne à l'exécution, mais Jest ne peut pas le charger sous Node 22.19.
  Tu as choisi de garder Node 22.19, donc j'ai écrit `@RateLimit()` :
  - fenêtre fixe en mémoire, par route et par IP ;
  - réponse 429 avec l'en-tête `Retry-After` ;
  - nettoyage automatique des compteurs expirés ;
  - 6 tests unitaires et 1 test e2e.

  Les variables s'appellent `RATE_LIMIT_MAX` et `RATE_LIMIT_WINDOW_SECONDS`.

- **Décorateur `@MinRole()`** au lieu de `@Roles()` : le nom dit clairement
  « au moins ce rôle ».
- **Ajouts trouvés en testant** :
  - Prisma 7 ne régénère plus le client après `migrate dev`. Le script
    `prisma:migrate` enchaîne donc `generate` ;
  - un nom mal encodé (caractère `U+FFFD`, par exemple envoyé par `curl` sous
    Windows) est refusé, plutôt qu'enregistré abîmé. L'UTF-8, y compris
    l'arabe, a été vérifié de bout en bout jusqu'à la base.

### Fichiers créés ou modifiés

```
packages/shared/src/auth.ts, auth.test.ts, user.ts, user.test.ts (créés)
packages/shared/src/index.ts (modifié)
apps/api/prisma/schema.prisma (User, RefreshToken, enums Role et Locale)
apps/api/prisma/migrations/20261017205443_auth/migration.sql
apps/api/src/auth/auth.module.ts, auth.controller.ts, auth.service.ts, auth.types.ts
apps/api/src/auth/password.service.ts (+ test), refresh-token.service.ts
apps/api/src/auth/decorators/public.decorator.ts, min-role.decorator.ts,
                              current-user.decorator.ts
apps/api/src/auth/guards/jwt-auth.guard.ts (+ test), roles.guard.ts (+ test)
apps/api/src/users/users.module.ts, users.service.ts, enums-sync.test.ts
apps/api/src/common/zod-validation.pipe.ts (+ test), zod-openapi.ts
apps/api/src/common/rate-limit/rate-limit.decorator.ts, rate-limit.guard.ts (+ test),
                               rate-limit.store.ts, rate-limit.module.ts
apps/api/src/config/env.schema.ts (+ test) : JWT_*, REFRESH_TOKEN_TTL_DAYS, RATE_LIMIT_*
apps/api/src/app.module.ts, setup-app.ts (Swagger bearer), health/health.controller.ts (@Public)
apps/api/test/test-env.cjs, global-setup.cjs, setup-env.cjs, utils.ts (créés)
apps/api/test/auth.e2e-test.ts (créé), health.e2e-test.ts (modifié)
apps/api/jest.e2e.config.cjs, package.json, .env.example, README.md
pnpm-lock.yaml, CLAUDE.md, docs/ARCHITECTURE.md, JOURNAL.md
```

Fichier local non versionné : `apps/api/.env` (secret JWT aléatoire de 64
caractères ajouté).

### Commandes pour lancer et tester

```bash
pnpm db:up
pnpm --filter @buslive/api prisma:deploy
pnpm dev:api                       # puis http://localhost:3000/api/docs
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```

Résultats obtenus :

- lint, format, typecheck et build sans erreur ;
- tests unitaires : 25 dans shared et 36 dans l'API ; tests e2e : 22 sur la
  base `buslive_test` ;
- essai manuel avec `curl` : inscription 201, `/me` 401 sans jeton puis 200
  avec, et login refusé 5 fois (401) puis bloqué (429) ;
- Swagger affiche les 7 routes, avec le schéma de sécurité « bearer ».

### À configurer soi-même

- **En production** : générer un `JWT_ACCESS_SECRET` propre à chaque
  environnement, avec la commande indiquée dans `apps/api/.env.example`. L'API
  refuse de démarrer en production avec la valeur d'exemple.
- **Si un ancien `.env` contient encore `AUTH_THROTTLE_*`** : ces variables
  sont renommées `RATE_LIMIT_MAX` et `RATE_LIMIT_WINDOW_SECONDS` (j'ai déjà
  mis à jour ton `apps/api/.env`).
- **Pour le mobile (phase 4)** : stocker le refresh token dans
  `expo-secure-store`, et ne lancer qu'un seul `/auth/refresh` à la fois.

### Message de commit proposé

```
feat(auth): inscription, connexion et jetons JWT avec rotation

- comptes email + mot de passe (argon2id), rôles USER/MODERATOR/ADMIN
- access token JWT 15 min + refresh token opaque 30 j (empreinte SHA-256)
- rotation des refresh tokens avec révocation de session en cas de réutilisation
- guard global (@Public, @MinRole, @CurrentUser) et limitation des tentatives (@RateLimit)
- schémas zod partagés, validation des requêtes et documentation Swagger
- tests e2e sur une base de test séparée créée automatiquement
```
