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

---

## Phase 3 — Modèle de données du réseau (18/10/2026)

### Ce qui a été fait et pourquoi

- **Modèle inspiré de GTFS**, le format standard des réseaux de transport, en
  plus simple. Les tables : `governorates`, `localities`, `operators`, `lines`,
  `line_directions` (aller/retour, avec le tracé), `stops`, `line_stops`
  (arrêts dans l'ordre et temps de trajet), `service_calendars` et
  `departures`. Le modèle reste familier, et on pourra importer des données
  GTFS plus tard.
- **Horaires : seulement les départs du terminus**, en minutes depuis minuit.
  L'heure à chaque arrêt vaut le départ plus `minutesFromStart`. Il y a donc
  beaucoup moins de données à saisir et à vérifier.
- **Calendriers** avec des jours, une période et une priorité. Le Ramadan
  (priorité 10) remplace les horaires normaux pour les lignes qui en ont, et
  les autres lignes gardent leurs horaires habituels.
- **PostGIS** :
  - `stops.location` est calculé automatiquement par un trigger à partir de
    latitude et longitude, avec un index spatial GIST ;
  - `line_directions.shape` contient le tracé ;
  - des contraintes `CHECK` garantissent des coordonnées plausibles.
- **Statuts** `PENDING` / `ACTIVE` / `REJECTED` / `ARCHIVED` et
  `proposedById` sur les lignes et les arrêts, déjà prêts pour les propositions
  des utilisateurs. L'API ne montre que les éléments `ACTIVE` d'un gouvernorat
  actif.
- **Calculs d'horaires dans `@buslive/shared/schedule.ts`** (`departuresForDate`,
  `passingMinutes`, `isCalendarActiveOn`…) : l'API et le mobile, hors ligne,
  feront exactement le même calcul.
- **Routes publiques** : `GET /governorates`, `/lines?governorate=`,
  `/lines/:id` et `/stops/:id`. Leurs schémas zod sont partagés et documentés
  dans Swagger, y compris les réponses. Le détail d'une ligne, environ 7,5 Ko,
  suffit pour calculer les horaires de n'importe quel jour.
- **Seed idempotent** (`db:seed`) :
  - les 24 gouvernorats sont des **données réelles**, et seul Mahdia est
    activé ;
  - le réseau de démonstration contient 4 localités, 14 arrêts, 4 lignes,
    4 calendriers et 372 départs ;
  - les **lignes et les horaires sont inventés**, et les coordonnées sont
    approximatives : tout est marqué « données de test » ;
  - en production, seuls les gouvernorats sont insérés.

### Écarts et problèmes rencontrés

- **Colonne générée remplacée par un trigger.** Comme prévu dans le plan, j'ai
  vérifié comment Prisma réagit à une colonne générée : il prend son expression
  pour une valeur par défaut, et voudrait la supprimer à chaque migration. Pour
  éviter un `prisma migrate reset` (que Prisma refuse sans ton accord
  explicite), j'ai laissé la migration `network` intacte et ajouté une
  migration corrective, `stops_location_trigger`. Celle-ci transforme la
  colonne en colonne normale (`DROP EXPRESSION`, sans perte de données) et
  crée le trigger. Résultat : `migrate diff` est vide, et Prisma ne voit plus
  aucun écart.
- **`prisma migrate dev` bloqué**, lancé hors d'un terminal interactif : il
  attendait un nom de migration et gardait un verrou sur la base. Le processus
  a été arrêté. La règle est notée dans CLAUDE.md : `--create-only`, puis
  `migrate deploy`.
- **Routes « arrêts proches » et « prochains bus »** : prévues en phase 5,
  comme annoncé. La requête PostGIS `ST_DWithin` est déjà testée en e2e.

### Fichiers créés ou modifiés

```
apps/api/prisma/schema.prisma (modèles du réseau + relations User)
apps/api/prisma/migrations/20261018121216_network/migration.sql
apps/api/prisma/migrations/20261018122044_stops_location_trigger/migration.sql
apps/api/prisma/seed/index.ts, seed.ts, types.ts
apps/api/prisma/seed/data/governorates.ts, mahdia-demo.ts
apps/api/prisma.config.ts (commande de seed), package.json (db:seed, tsx), tsconfig.json
apps/api/src/network/network.module.ts, network.controller.ts, network.service.ts, network.mapper.ts
apps/api/src/common/zod-openapi.ts (réponses Swagger), src/app.module.ts
apps/api/test/network.e2e-test.ts (créé), test/utils.ts (TRUNCATE étendu)
packages/shared/src/network.ts, schedule.ts, schedule.test.ts (créés), index.ts
apps/api/README.md, README.md, CLAUDE.md, docs/ARCHITECTURE.md, JOURNAL.md, pnpm-lock.yaml
```

### Commandes pour lancer et tester

```bash
pnpm db:up
pnpm --filter @buslive/api prisma:deploy
pnpm --filter @buslive/api db:seed
pnpm dev:api        # http://localhost:3000/api/docs → section « Réseau »
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```

Résultats obtenus :

- lint, format, typecheck et build sans erreur ;
- tests unitaires : 42 dans shared et 36 dans l'API ; tests e2e : 39 ;
- seed lancé deux fois : comptes identiques, 14 arrêts tous avec leur point
  PostGIS, 8 sens tous avec leur tracé ;
- distance Mahdia–Ksour Essef calculée par PostGIS : environ 11 km ;
- calcul hors ligne avec le seul détail de la ligne 10 : 9 passages un lundi,
  3 un dimanche et 5 pendant le Ramadan ;
- écart schéma ↔ base : « empty migration ».

### À configurer soi-même

- Ta base de développement contient maintenant les gouvernorats et le réseau de
  démonstration (seed lancé).
- **Remplacer les données de test** dès que tu as les vraies lignes et les vrais
  horaires : modifier `apps/api/prisma/seed/data/mahdia-demo.ts`, puis relancer
  `db:seed`. Vérifier aussi les coordonnées des arrêts sur place.
- Les dates du Ramadan 2027 sont approximatives : à ajuster le moment venu.

### Message de commit proposé

```
feat(network): modèle du réseau, horaires et données de démonstration

- gouvernorats (24, activables), localités, opérateurs, lignes, sens, arrêts
- arrêts géolocalisés avec PostGIS (point calculé par trigger, index GIST)
- horaires par départ du terminus + calendriers (semaine, samedi, Ramadan…)
- calculs d'horaires partagés API / mobile (hors ligne) dans @buslive/shared
- routes publiques /governorates, /lines, /lines/:id, /stops/:id
- seed idempotent : 24 gouvernorats réels + réseau de démonstration Mahdia / Ksour Essef
```

---

## Phase 4 — Squelette de l'app mobile (18/10/2026)

### Ce qui a été fait et pourquoi

- **Expo SDK 58** (React Native 0.88, React 19.3), compatible avec Node 22.19,
  avec **expo-router**. Je suis parti du modèle vide : seules les images ont
  été reprises, il n'y a donc aucun écran d'exemple à nettoyer. Les modules
  natifs ont été installés avec `npx expo install`, qui choisit les versions
  du SDK.
  - **pnpm** : les `node_modules` isolés fonctionnent avec Metro. Pas besoin du
    mode `hoisted`.
- **Navigation** : barre Carte · Lignes · [Signaler] · Alertes · Profil. Le
  bouton central Signaler est un cercle jaune surélevé. En arabe, l'ordre des
  onglets s'inverse tout seul. La connexion et l'inscription s'ouvrent en
  fenêtres modales.
- **Thème** : jetons de couleur tirés de ta maquette, en clair et en sombre.
  - Le mode suit le téléphone par défaut, et peut être choisi dans Profil.
  - **Un test vérifie le contraste WCAG AA** (≥ 4,5:1) de chaque couleur de
    texte sur chaque fond, dans les deux thèmes. Les statuts sont éclaircis en
    mode sombre.
  - La couleur du texte sur la pastille d'une ligne (blanc ou bleu nuit) est
    choisie automatiquement selon le contraste.
- **Police Readex Pro**, importée graisse par graisse : seules les 4 graisses
  utilisées sont embarquées, soit environ 200 Ko de moins.
- **Langues** : i18next, avec la langue détectée sur le téléphone ou choisie
  dans Profil.
  - Les clés de traduction sont typées : une clé mal écrite est une erreur
    TypeScript.
  - **Un test garantit que `fr.json` et `ar.json` ont les mêmes clés et les
    mêmes variables**.
  - **RTL natif** (`I18nManager`). Changer de sens d'écriture redémarre l'app
    (`reloadAppAsync` d'`expo`, ce qui rend `expo-updates` inutile), avec un
    garde-fou contre les boucles de redémarrage.
- **Connexion à l'API** :
  - chaque réponse est validée avec les schémas zod partagés ;
  - délai maximal de 15 s par requête ;
  - erreurs typées (`ApiError`, `NetworkError`, `InvalidResponseError`) ;
  - TanStack Query gère le cache et le rechargement.
- **Onglet Lignes avec de vraies données** (`GET /lines`) :
  - tirer vers le bas pour recharger ;
  - états chargement, erreur avec « Réessayer », et liste vide ;
  - noms affichés en français ou en arabe.
- **Connexion et inscription** (ton choix) :
  - formulaires validés avec les schémas partagés, et messages d'erreur
    traduits (champ et code zod → clé de traduction) ;
  - refresh token dans **expo-secure-store**, access token en mémoire ;
  - **une seule requête `/auth/refresh` à la fois** (testé avec 3 requêtes
    simultanées) ;
  - déconnexion automatique si la session est révoquée ;
  - profil mis en cache pour l'affichage hors ligne.
- **Composants réutilisables** : `AppText`, `Button`, `Card`, `TextField`
  (aligné en RTL), `EmptyState`, `LineBadge`, `LineRow`, `SegmentedControl` et
  `ReportTabButton`. Les zones tactiles font au moins 48 px, avec des libellés
  d'accessibilité.
- **ESLint** : règles React Hooks pour l'app mobile, avec un fichier
  volontairement fautif pour vérifier qu'elles s'appliquent.

### Problèmes rencontrés et corrections

- **Un caractère `U+FFFD` stocké tel quel** dans `@buslive/shared` (phase 2) au
  lieu de sa forme échappée. Remplacé par une constante
  `REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd)`, plus lisible. J'ai
  vérifié qu'aucun autre fichier n'en contient.
- **Testing Library 14** : `render` est devenu asynchrone, il faut l'attendre
  (`await render(…)`).
- **Expo 58 refuse `REACT_NATIVE_PACKAGER_HOSTNAME` dans `.env`** : la
  configuration locale de l'app est donc dans `apps/mobile/.env.local`.
- **Ton PC a des cartes réseau VMware et WSL** : Expo aurait pu annoncer une
  adresse injoignable. L'adresse Wi-Fi est forcée, et j'ai vérifié que le
  manifeste annonce bien `10.35.111.93`.
- **Expo réécrit `tsconfig.json#include`** au démarrage : j'ai gardé sa
  version.

### Fichiers créés ou modifiés

```
apps/mobile/package.json, app.json, tsconfig.json, .env.example, README.md
apps/mobile/jest.config.cjs, jest.setup.cjs
apps/mobile/assets/ (icônes et écran de démarrage provisoires d'Expo)
apps/mobile/app/_layout.tsx, (tabs)/_layout.tsx, (tabs)/index.tsx, (tabs)/lines.tsx,
               (tabs)/report.tsx, (tabs)/alerts.tsx, (tabs)/profile.tsx,
               auth/login.tsx, auth/register.tsx
apps/mobile/src/api/http.ts, client.ts, errors.ts, auth.ts, network.ts, queryClient.ts,
                    client.test.ts
apps/mobile/src/auth/session.ts, tokenStorage.ts, AuthProvider.tsx, errorMessages.ts,
                     errorMessages.test.ts
apps/mobile/src/components/AppText.tsx, Button.tsx, Card.tsx, TextField.tsx, EmptyState.tsx,
                           LineBadge.tsx, LineRow.tsx (+ test), SegmentedControl.tsx,
                           ReportTabButton.tsx, Screen.tsx
apps/mobile/src/i18n/index.ts, direction.ts, localized.ts, i18next.d.ts, locales.test.ts,
                     locales/fr.json, locales/ar.json
apps/mobile/src/storage/preferences.ts
apps/mobile/src/theme/tokens.ts, contrast.ts (+ test), ThemeProvider.tsx
packages/shared/src/auth.ts (constantes DISPLAY_NAME_*, REPLACEMENT_CHARACTER), auth.test.ts
eslint.config.mjs (React Hooks), package.json (dev:mobile, eslint-plugin-react-hooks)
.gitignore, .prettierignore, pnpm-lock.yaml
README.md, CLAUDE.md, docs/ARCHITECTURE.md, JOURNAL.md
```

Fichier local non versionné : `apps/mobile/.env.local` (adresse Wi-Fi
`10.35.111.93`).

### Commandes pour lancer et tester

```bash
pnpm db:up
pnpm dev:api        # terminal 1
pnpm dev:mobile     # terminal 2 → scanner le QR code avec Expo Go
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Résultats obtenus :

- lint, format et typecheck (shared, API, mobile) sans erreur ;
- tests unitaires : 42 dans shared, 36 dans l'API et **43 dans le mobile** ;
  tests e2e : 39 ;
- `expo-doctor` : 20 vérifications sur 20 réussies ;
- bundle Android construit avec `expo export` (4,9 Mo), et l'URL de l'API y est
  bien intégrée ;
- serveur Expo démarré : le manifeste annonce l'adresse Wi-Fi ;
- l'API répond sur `http://10.35.111.93:3000`, avec ses 4 lignes.

**Pas encore testé sur un vrai téléphone** : c'est à toi de faire ce premier
essai avec Expo Go, après la configuration du pare-feu ci-dessous.

### À configurer soi-même

- **Pare-feu Windows** : aucune règle n'autorise les connexions entrantes, et
  ton Wi-Fi est classé « Public ». Dans PowerShell **en administrateur** :

  ```powershell
  New-NetFirewallRule -DisplayName "BusLive API (3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
  New-NetFirewallRule -DisplayName "BusLive Expo (8081)" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
  ```

  Ensuite, passe le Wi-Fi en « Privé », mais **seulement si c'est un réseau
  de confiance**. Sur un réseau d'université ou d'entreprise (ton adresse
  `10.35.x.x` le laisse penser), les appareils sont souvent isolés entre eux :
  utilise plutôt le point d'accès du téléphone, et mets à jour l'IP dans
  `apps/mobile/.env.local`.

- **Expo Go** : l'installer depuis le Play Store, en version compatible avec le
  SDK 58.
- **Relire les textes arabes** (`apps/mobile/src/i18n/locales/ar.json`) avec une
  personne arabophone.
- **Avant la publication** : une vraie icône et un vrai écran de démarrage
  (ceux d'Expo sont provisoires), et vérifier l'identifiant `tn.buslive.app`.

### Message de commit proposé

```
feat(mobile): squelette de l'app Expo (navigation, thème, fr/ar RTL, connexion)

- Expo SDK 58 + expo-router : barre Carte · Lignes · Signaler · Alertes · Profil
- thème clair/sombre d'après la maquette (contrastes AA testés), police Readex Pro
- i18n français / arabe avec RTL natif et redémarrage au changement de sens
- client API validé par les schémas zod partagés, liste des lignes depuis l'API
- connexion / inscription, jetons dans expo-secure-store, rafraîchissement unique
```

---

## Phase 5 — Écran Carte : arrêts proches et prochains bus (18/10/2026)

### Ce qui a été fait et pourquoi

**Partagé (`@buslive/shared`)**

- **`tunisClock()`** donne l'heure de Tunis (Intl, fuseau `Africa/Tunis`, avec un
  repli sur UTC+1 puisque la Tunisie n'a plus d'heure d'été). Les horaires ne
  dépendent jamais du fuseau du serveur ou du téléphone.
- **`upcomingPassages()`** calcule les prochains passages à un arrêt, tous sens
  confondus. Il gère le calendrier du jour (dont le Ramadan) et les bus après
  minuit, rattachés à la journée de la veille, et regarde jusqu'au lendemain.
  L'API et le mobile hors ligne utilisent cette même fonction.
- `distanceMeters()` (haversine), et les schémas `NearbyStop`, `StopPassage` et
  `StopDepartures`.

**API**

- **`GET /stops/nearby`** :
  - PostGIS filtre les arrêts dans le rayon (`ST_DWithin`) et les trie par
    distance (`<->`), avec l'index GIST ;
  - rayon ≤ 3 km et au plus 50 résultats ;
  - **la position n'est ni stockée ni journalisée**.
- **`GET /stops/:id/departures`** : prochains passages sur 24 h, renvoyés en
  **heures absolues** (journée de service + minutes). L'app calcule le compte à
  rebours elle-même, qui reste donc juste depuis le cache hors ligne. Le champ
  `live: null` est réservé à la phase 6.
- Nouveau `StopsService`, et filtres de visibilité regroupés dans
  `network.filters.ts`.

**Mobile**

- **Écran Carte** :
  - Google Maps (react-native-maps), avec un style sombre en mode sombre ;
  - position avec la permission « pendant l'utilisation » seulement ;
  - si la permission est refusée, la carte se centre sur Mahdia ;
  - marqueurs jaunes pour les arrêts, liste des arrêts proches (distance et
    lignes), et bouton « Rechercher dans cette zone » quand on déplace la
    carte ;
  - en touchant un arrêt : ses prochains passages, avec un compte à rebours
    mis à jour toutes les 30 s et un rechargement chaque minute.
- **Écran Détail d'une ligne** (ajouté à cette phase) :
  - accessible depuis l'onglet Lignes ;
  - choix du sens, tracé sur une petite carte, et arrêts dans l'ordre avec
    leur prochain passage ;
  - départs du jour, ceux déjà passés étant grisés ;
  - **tout est calculé sur le téléphone** à partir du détail de la ligne.
- **Hors ligne** :
  - cache TanStack Query sauvegardé 24 h dans AsyncStorage, limité aux lignes,
    aux arrêts proches et aux passages (rien de personnel) ;
  - bandeau « Hors ligne — horaires théoriques », grâce à NetInfo ;
  - les passages déjà passés sont retirés du cache affiché.
- Formatage traduit des distances (« 350 m », « 1,2 km » ; « 350 م »,
  « 1,2 كم ») et des heures (« dans 12 min », « à 14:30 », « demain à 06:30 »).

### Écarts par rapport au plan

- Aucun dans le périmètre. L'écran Détail d'une ligne a été ajouté, comme tu
  l'as validé. La recherche d'arrêt par nom reste à faire plus tard.
- **Améliorations trouvées en cours de route** :
  - le centre de recherche est **déduit** (choix manuel, sinon position, sinon
    Mahdia) au lieu d'être recopié dans un état par un `useEffect` ;
  - 999 m s'affiche « 1 km » plutôt que « 1000 m ».

### Fichiers créés ou modifiés

```
packages/shared/src/clock.ts, passages.ts, passages.test.ts (créés)
packages/shared/src/geo.ts (+ distanceMeters), geo.test.ts, network.ts (schémas), index.ts
apps/api/src/network/stops.service.ts, network.filters.ts (créés)
apps/api/src/network/network.controller.ts, network.service.ts, network.module.ts
apps/api/test/network.e2e-test.ts (11 tests ajoutés)
apps/mobile/app/(tabs)/index.tsx (carte), (tabs)/lines.tsx, lines/[id].tsx (créé), _layout.tsx
apps/mobile/src/api/network.ts, queryClient.ts (+ test)
apps/mobile/src/components/NearbyStopRow.tsx, PassageRow.tsx (+ test), StopPassagesPanel.tsx,
                           StopMarker.tsx, OfflineBanner.tsx (créés), LineBadge.tsx (taille)
apps/mobile/src/hooks/useServiceClock.ts, useUserLocation.ts, useIsOnline.ts (créés)
apps/mobile/src/time/format.ts (+ test), src/theme/mapStyle.ts (créés)
apps/mobile/src/i18n/locales/fr.json, ar.json
apps/mobile/app.json (plugin expo-location), package.json, jest.setup.cjs (NetInfo)
apps/api/README.md, apps/mobile/README.md, CLAUDE.md, docs/ARCHITECTURE.md, JOURNAL.md, pnpm-lock.yaml
```

### Commandes pour lancer et tester

```bash
pnpm db:up
pnpm dev:api        # terminal 1
pnpm dev:mobile     # terminal 2 → Expo Go → onglet Carte
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Résultats obtenus :

- lint, format et typecheck sans erreur ;
- tests unitaires : 54 dans shared, 36 dans l'API et 63 dans le mobile ;
  tests e2e : 50 ;
- `expo-doctor` : 20 vérifications sur 20, et le bundle Android se construit
  (5,1 Mo) ;
- essai réel sur l'API (dimanche 18/10, 14:59 à Tunis) : à « Ksour Essef –
  Centre », la ligne 10 passe à 17:30 (vers Ksour Essef) et à 18:04 (vers
  Mahdia), et la ligne 11, sans service le dimanche, n'apparaît que lundi.
  C'est exact au regard des horaires de démonstration.

**Pas encore testé sur un vrai téléphone** : carte, permission de localisation,
mode hors ligne et RTL sont à vérifier sur ton Android.

### À configurer soi-même

- Comme en phase 4 : pare-feu (ports 3000 et 8081) et Expo Go, pour essayer
  sur le téléphone.
- **Pour une version publiée (phase 11)** : une clé Google « Maps SDK for
  Android », dans un projet Google Cloud. Elle n'est pas nécessaire dans Expo
  Go.
- **Pour tester le mode hors ligne** : ouvrir la carte et une ligne avec le
  réseau, passer en mode avion, puis rouvrir l'app.

### Message de commit proposé

```
feat(map): carte des arrêts proches, prochains passages et détail des lignes

- API : /stops/nearby (PostGIS ST_DWithin + tri par distance) et /stops/:id/departures
- calcul partagé des prochains passages (heure de Tunis, Ramadan, bus après minuit)
- écran Carte : position, arrêts proches, prochains passages avec compte à rebours
- écran Détail d'une ligne : tracé, arrêts et prochain passage, départs du jour
- cache hors ligne persistant (24 h) et bandeau « horaires théoriques »
```

---

## Phase 6 — « Je suis dans le bus » : partage en direct (18/10/2026)

### Ce qui a été fait et pourquoi

**Partagé (`@buslive/shared`)**

- **`route.ts`**, de la géométrie en pur TypeScript, rapide et testable :
  - `projectOnRoute` projette une position sur le tracé, en donnant sa distance
    au tracé et la distance parcourue ;
  - `progressMinutes` convertit cette distance en minutes depuis le terminus,
    par interpolation entre les arrêts ;
  - `etaMinutes` donne le temps d'arrivée à un arrêt.
- **`live.ts`** :
  - règles de validation (`LIVE_RULES`) ;
  - `isSpeedPlausible` ;
  - `groupIntoVehicles` : des passagers à moins de 150 m sur le même sens
    forment un seul bus, avec leur position moyenne ;
  - schémas des requêtes, des réponses et des messages Socket.io.

**API**

- **Partage en REST** : `POST /live/sessions`, `POST /live/sessions/:id/positions`
  (lots de 20 au plus) et `DELETE /live/sessions/:id`.
  - **Pourquoi REST ?** Une tâche d'arrière-plan Android envoie des lots de
    positions ; une requête HTTP y est bien plus fiable qu'un socket
    permanent.
- **Diffusion par Socket.io** : espace `/live`, `watch:line`, puis `vehicles`
  au plus toutes les 3 s par ligne (`LiveBroadcaster`). Il est public et
  anonyme.
- **Vérification de chaque position** :
  - âge ≤ 10 min et précision ≤ 100 m ;
  - position en Tunisie ;
  - ≥ 5 s depuis la précédente, et vitesse ≤ 120 km/h ;
  - **≤ 300 m du tracé de la ligne**.
- **Fin automatique** au terminus, après 10 min sans position, ou au bout de
  3 h. Un nouveau partage remplace le précédent.
- **Vie privée** : registre **en mémoire** (`LiveRegistry`), et en base
  (`live_sessions`) seulement la session et sa dernière position, **jamais le
  trajet**. Les bus diffusés ne contiennent aucune information sur les
  passagers. Les deux points sont vérifiés par des tests.
- **Arrivées en direct aux arrêts** : `liveArrivals` dans
  `/stops/:id/departures`.
- `ConfiguredIoAdapter` applique `CORS_ORIGINS` à Socket.io, et la passerelle
  est marquée `@Public()`.

**Mobile**

- **Écran « Je suis dans le bus »** (`app/share.tsx`) :
  - choix de la ligne et du sens ;
  - texte d'information affiché avant la demande de position en
    arrière-plan, **exigé par Google Play** ;
  - pendant le partage : nombre de passagers sur le bus, avertissement « loin
    du parcours » et bouton Arrêter ;
  - à la fin : message adapté (terminus, inactivité…).
- **Deux modes** (`ShareProvider`) :
  - **arrière-plan** (build EAS + permission « Toujours ») : la tâche
    `backgroundTask.ts` envoie les positions même app fermée, avec la
    notification permanente exigée par Android ;
  - **app ouverte** (Expo Go, ou permission refusée) : suivi de la position
    dans l'app, écran gardé allumé, et message clair.
- **Bus en direct** (Socket.io, `useLineVehicles`) :
  - sur la carte (couleur de la ligne, bordure verte), avec le bouton « Je suis
    dans le bus » ;
  - dans le détail d'une ligne : bus sur le tracé, « En direct · 4 min » à
    chaque arrêt, et bouton « Je suis dans ce bus » ;
  - dans le panneau d'un arrêt : arrivées en direct au-dessus des horaires.
  - Le direct est **masqué hors ligne et après 2 min sans position**.
- **EAS** : `eas.json` (profil `development` → APK) et `expo-dev-client`.

### Écarts par rapport au plan

- **`live: null` remplacé par une liste `liveArrivals`.** Associer un bus
  observé à un horaire théorique précis serait hasardeux ; deux listes
  séparées sont plus honnêtes et plus simples à afficher. Le cache hors ligne
  passe en version `v2`, puisque le format a changé.
- **Corrigé en cours de route** :
  - la première version du calcul « passagers sur le même bus » était fausse.
    Elle est remplacée par une liste `sessionIds` dans chaque groupe,
    interne à l'API et jamais diffusée ;
  - une variable inutile dans `eas.json` a été retirée (en build de
    développement, le JS vient de ton PC).

### Fichiers créés ou modifiés

```
packages/shared/src/route.ts, route.test.ts, live.ts, live.test.ts (créés)
packages/shared/src/network.ts (liveArrivals), index.ts
apps/api/prisma/schema.prisma (LiveSession), migrations/20261018143729_live_sessions/
apps/api/src/live/live.module.ts, live.controller.ts, live.service.ts, live.registry.ts,
                 live.broadcaster.ts, live.gateway.ts, route-cache.service.ts (créés)
apps/api/src/common/io-adapter.ts (créé), setup-app.ts, app.module.ts, config/env.schema.ts
apps/api/src/network/stops.service.ts, network.module.ts, users/enums-sync.test.ts
apps/api/test/live.e2e-test.ts (créé), network.e2e-test.ts, utils.ts, test-env.cjs
apps/api/package.json (websockets, socket.io), .env.example, README.md
apps/mobile/app/share.tsx (créé), (tabs)/index.tsx, lines/[id].tsx, _layout.tsx
apps/mobile/src/live/api.ts, backgroundTask.ts, environment.ts, positions.ts, ShareProvider.tsx,
                     sharingStore.ts, socket.ts, useLineVehicles.ts, live.test.ts (créés)
apps/mobile/src/components/BusMarker.tsx, LiveArrivalRow.tsx (créés), StopPassagesPanel.tsx,
                           PassageRow.test.tsx
apps/mobile/src/time/format.ts (+ formatEta), format.test.ts, i18n/locales/fr.json, ar.json
apps/mobile/app.json (localisation en arrière-plan), eas.json (créé), package.json
apps/mobile/README.md, CLAUDE.md, docs/ARCHITECTURE.md, JOURNAL.md, pnpm-lock.yaml
```

### Commandes pour lancer et tester

```bash
pnpm --filter @buslive/api prisma:deploy    # nouvelle table live_sessions
pnpm dev:api                                # terminal 1
pnpm dev:mobile                             # terminal 2 (Expo Go : partage app ouverte)
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Résultats obtenus :

- lint, format et typecheck sans erreur ;
- tests unitaires : 66 dans shared, 39 dans l'API et 70 dans le mobile ;
  tests e2e : **69**, dont 19 sur le temps réel, avec un vrai client
  Socket.io. Ils ont été lancés deux fois de suite, sans instabilité ;
- `expo-doctor` : 20 vérifications sur 20, et le bundle Android se construit
  (5,2 Mo) ;
- permissions Android vérifiées : `ACCESS_BACKGROUND_LOCATION` et
  `FOREGROUND_SERVICE_LOCATION` sont bien présentes ;
- écart schéma ↔ base : « empty migration ».

**Pas encore testé sur un vrai téléphone**, en particulier l'arrière-plan, qui
demande le build EAS.

### À configurer soi-même

- **Build de développement EAS** (détail dans `apps/mobile/README.md`) :
  1. créer un compte sur expo.dev, puis `npm install -g eas-cli` ;
  2. **commiter** tes changements ;
  3. dans `apps/mobile` : `eas login`, `eas init`, puis
     `eas build --profile development --platform android` ;
  4. installer l'APK sur ton téléphone.

  `eas init` ajoutera un identifiant de projet dans `app.json` : c'est normal,
  à commiter. Si le premier build échoue (monorepo pnpm sur les serveurs
  EAS), envoie-moi le journal du build et je corrigerai.

- **Pour tester le direct** : deux téléphones (ou un téléphone et Swagger, pour
  envoyer des positions à la main), sur une ligne de démonstration, près du
  tracé. Avec les données inventées, il faut être physiquement près des
  arrêts de démonstration ; sinon tes positions seront refusées car « hors
  parcours ».
- **Avant la publication (phase 11)** :
  - retirer les permissions Android inutiles ajoutées par défaut
    (`READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`) ;
  - remplir le formulaire Google Play de justification de la localisation en
    arrière-plan ;
  - passer le registre du direct sur Redis s'il y a plusieurs instances de
    l'API.

### Message de commit proposé

```
feat(live): partage « Je suis dans le bus » et bus en direct

- API : sessions de partage (REST), validation des positions (précision, vitesse, tracé)
- regroupement des passagers en bus, progression sur le parcours et temps d'arrivée
- diffusion temps réel par Socket.io (/live), sans donnée personnelle ni historique
- mobile : écran de partage, localisation en arrière-plan (build EAS) ou app ouverte
- bus en direct sur la carte, le détail d'une ligne et les arrêts (« En direct · 4 min »)
```

---

## Phase 7 — Signalements, score de confiance et statistiques (18/10/2026)

### Ce qui a été fait et pourquoi

**Règles (fonctions pures dans `@buslive/shared`, testées)**

- `TRUST_RULES` rassemble les règles chiffrées.
  - **Poids d'un avis** : 1 + score/50, entre 0,25 et 3 (`voteWeight`).
  - **Confirmé** quand le total « pour » (auteur compris) atteint 3 ;
    **démenti** quand le total « contre » dépasse le total « pour » de 2
    (`resolveReport`).
  - **Points** : +10 signalement confirmé, −15 démenti, +2 vote juste, −3 vote
    contredit, +2 partage mené à bien (3 par jour au plus). **Les erreurs
    coûtent plus qu'elles ne rapportent.**
- **Niveaux** : Nouveau, Fiable et Expert. **Durée de vie** selon le type
  (`reportLifetimeMinutes`), comptée à partir de l'horaire concerné quand il
  est connu.
- `computeLineStats` : aucun pourcentage sous 10 passages observés.

**API**

- **Base de données** (migration `reports_trust`) :
  - `reports`, `report_votes` et `trust_events` (l'historique des points) ;
  - `stop_passage_observations`, les passages réels observés, **anonymes** ;
  - `users.trust_score`.
- **`POST /reports`** :
  - contrôles selon le type : sens, arrêt desservi, horaire à −3 h / +2 h au
    plus, arrêt déplacé de moins de 1 km ;
  - **doublon = confirmation** de l'existant ;
  - 10 signalements par heure au plus ;
  - signalement caché si l'auteur a un score < −50 ;
  - **pas de texte libre**, et la position de l'auteur n'est **pas** gardée
    (seulement sa distance à l'arrêt).
- **`POST /reports/:id/votes`** :
  - pas de vote sur son propre signalement (403), un seul vote par
    utilisateur (409) ;
  - la décision et le versement des points se font **dans une transaction**,
    avec une mise à jour conditionnelle : les points ne sont versés qu'une
    fois ;
  - la ligne de l'utilisateur est verrouillée (`FOR UPDATE`) pendant le
    versement des points.
- **Preuves automatiques** : quand un bus en direct dépasse un arrêt, l'API
  enregistre un passage observé, rapproché de l'horaire le plus proche (avec
  le retard). Ce passage **dément les « pas venu »** et **confirme les « bus
  passé »** de cet arrêt (poids 3), y compris pour un signalement envoyé après
  le passage.
- **Événements internes** (`LiveEvents` : `stopPassed`, `sharingCompleted`) :
  le module des signalements écoute le temps réel, sans dépendance circulaire.
- **Les positions des passagers sont maintenant pondérées par leur score** dans
  la position du bus, comme annoncé en phase 6.
- **Lecture** : `GET /lines/:id/reports`, signalements inclus dans
  `/stops/:id/departures`, `GET /lines/:id/stats` (30 jours) et
  `GET /me/trust`.
- **Diffusion** : Socket.io `reports`, dans la room de la ligne.
- **Routes publiques avec identification facultative** : un jeton valide est lu
  sans jamais refuser l'accès, pour afficher « mon signalement » et « mon
  vote ».

**Mobile**

- **Onglet Signaler** :
  - 6 tuiles aux couleurs de statut, puis ligne, sens, arrêt, bus concerné et
    retard ;
  - choix par défaut **déduits** : le bus partagé, puis l'arrêt le plus
    proche ;
  - message différent quand le problème était déjà signalé (« ta confirmation
    a été ajoutée »).
- **Carte de signalement** avec « Je confirme » et « Ce n'est pas vrai »,
  affichée dans le panneau d'un arrêt et dans le détail d'une ligne (mise à
  jour en direct).
- **Carte Statistiques** dans le détail d'une ligne, et **carte Confiance**
  (niveau, score, poids, derniers points) dans le Profil.

### Écarts et problèmes rencontrés

- **Limite de débit par utilisateur connecté au lieu de par IP.** Les tests
  ont révélé un vrai défaut de conception : les opérateurs mobiles font
  partager une même adresse IP à de nombreux abonnés (CGNAT). Une limite par IP
  bloquerait des passagers innocents.
  - Le guard compte donc par utilisateur quand il est connecté, et par IP
    seulement sinon (connexion, inscription).
  - Il s'exécute maintenant **après** l'authentification (nouvel ordre des
    modules).
- **`departures.ts` séparé de `network.ts`** dans shared, pour éviter une
  dépendance circulaire avec les signalements. Les noms exportés restent les
  mêmes.
- **Règle du rendu pur** (React) : `Date.now()` n'est plus appelé pendant
  l'affichage ; le hook `useNow()` le remplace.
- **Couleur écrite en dur** retirée de l'écran de succès, et **précision GPS
  inventée** remplacée par la vraie (`useUserLocation`).
- **Une exécution des tests a bloqué plus de 10 minutes** : un socket resté
  ouvert après un test en échec empêchait Jest de s'arrêter. Les sockets sont
  maintenant fermés dans un `finally`, et les tests sont toujours lancés avec
  une limite de temps.
- **Une erreur passagère « base injoignable »** (P1001) s'est produite une
  fois. Le conteneur était sain, et elle ne s'est pas reproduite.

### Fichiers créés ou modifiés

```
packages/shared/src/trust.ts, trust.test.ts, stats.ts, departures.ts (créés)
packages/shared/src/reports.ts (schémas), network.ts (passages déplacés), live.ts (poids), index.ts
apps/api/prisma/schema.prisma, migrations/20261018171634_reports_trust/
apps/api/src/reports/reports.module.ts, reports.controller.ts, reports.service.ts,
                    reports.mapper.ts, trust.service.ts, observations.service.ts, stats.service.ts (créés)
apps/api/src/live/live.events.ts (créé), live.service.ts, live.registry.ts, live.broadcaster.ts,
                 route-cache.service.ts, live.module.ts
apps/api/src/auth/guards/jwt-auth.guard.ts (+ test), common/rate-limit/rate-limit.guard.ts (+ test)
apps/api/src/app.module.ts (ordre des modules), network/stops.service.ts, network.controller.ts,
             network.module.ts, users/enums-sync.test.ts
apps/api/test/reports.e2e-test.ts (créé), utils.ts
apps/mobile/app/(tabs)/report.tsx (réécrit), (tabs)/profile.tsx, lines/[id].tsx, _layout.tsx
apps/mobile/src/api/reports.ts, src/reports/reportForm.ts (+ test), reportVisuals.ts,
           useReportUpdates.ts, useVote.ts (créés), src/api/network.ts (clés)
apps/mobile/src/components/ReportCard.tsx (+ test), LineReportsSection.tsx, StatsCard.tsx,
                           TrustCard.tsx (créés), StopPassagesPanel.tsx
apps/mobile/src/hooks/useNow.ts (créé), useUserLocation.ts, src/live/socket.ts
apps/mobile/src/i18n/locales/fr.json, ar.json, jest.setup.cjs (icônes)
CLAUDE.md, docs/ARCHITECTURE.md, apps/api/README.md, apps/mobile/README.md, JOURNAL.md
```

### Commandes pour lancer et tester

```bash
pnpm --filter @buslive/api prisma:deploy    # nouvelles tables
pnpm dev:api && pnpm dev:mobile
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Résultats obtenus :

- lint, format et typecheck sans erreur ;
- tests unitaires : 88 dans shared, 46 dans l'API et 81 dans le mobile ;
  tests e2e : **92**, dont 23 sur les signalements. On y trouve le parcours
  complet avec les points, le démenti par un expert, les doublons, la
  visibilité, la limite horaire, l'expiration, la diffusion Socket.io, et la
  **preuve automatique par un vrai partage de position** qui dément un faux
  « pas venu » ;
- `expo-doctor` : 20 vérifications sur 20, et le bundle Android se construit
  (5,3 Mo) ;
- écart schéma ↔ base : « empty migration ».

**Pas encore testé sur un vrai téléphone.**

### À configurer soi-même

- Rien de nouveau, à part appliquer la migration (`prisma:deploy`).
- **À décider plus tard** : les valeurs de `TRUST_RULES` (points, seuils,
  limites) sont des choix de départ raisonnables. Il faudra les ajuster selon
  l'usage réel (en phase 10, le tableau de bord aidera à les observer).
- **Relire les nouveaux textes arabes** (signalements, confiance,
  statistiques).

### Message de commit proposé

```
feat(reports): signalements, score de confiance et statistiques par ligne

- signalements (pas venu, passé, plein, retard, panne, arrêt déplacé) avec contrôles et doublons fusionnés
- votes pondérés par la confiance, décision automatique et points (historique)
- preuves automatiques : un bus en direct passé dément « pas venu », confirme « bus passé »
- passages observés anonymes et statistiques (ponctualité, retard moyen) sur 30 jours
- limitation des requêtes par utilisateur connecté (CGNAT) ; mobile : onglet Signaler, votes, confiance
```

## Phase 8 — Favoris, alertes et notifications push (18/10/2026)

Choix validés avant de commencer :

- envoi **par FCM directement** (firebase-admin), comme prévu au cahier des charges ;
- favoris **liés au compte** ;
- **pas de rappels** fondés sur les horaires théoriques, pour l'instant.

### Ce qui a été fait et pourquoi

**Règles et textes (fonctions pures dans `@buslive/shared`, testées)**

- `alerts.ts` :
  - `ALERT_RULES` : 10 alertes par compte ; délais de 5, 10 ou 15 min ; une seule
    notification « approche » toutes les 30 min ; perturbations prises en compte
    60 min avant le début de la plage ;
  - `isAlertActive` (jour et plage horaire, heure de Tunis) ;
  - `approachingEta` : même sens, bus pas encore passé, arrivée dans le délai ;
  - `incidentConcernsAlert` : un « pas venu », un retard ou une panne touchent
    tout le sens ; « bus passé » ne touche que son arrêt, « arrêt déplacé »
    l'arrêt dans les deux sens. « Plein » n'est pas notifié : c'est trop
    passager.
- `notifications.ts` : types, canaux Android, et **textes en français et en
  arabe écrits une seule fois** (`renderNotification`). L'API les envoie dans la
  langue du compte, et l'app les réutilise pour l'historique. `arabicCount`
  accorde le nom au nombre (دقيقتين, 5 دقائق, 15 دقيقة).
- `favorites.ts`, `UpdateProfileSchema`, et le champ `notifyReportOutcome` du
  profil.

**API**

- **Base** (migration `favorites_alerts_notifications`) :
  - `favorite_lines` et `favorite_stops` (la clé primaire empêche les doublons) ;
  - `alerts` ;
  - `push_devices` (jeton unique) ;
  - `notifications`, avec la contrainte unique `(user_id, dedupe_key)` ;
  - `users.notify_report_outcome` ;
  - deux contraintes CHECK écrites à la main (jours et plage horaire), en
    garde-fou côté base.
- **Routes `/me/…`** :
  - favoris : `PUT` et `DELETE`, **idempotents** ;
  - alertes : CRUD, en vérifiant que l'arrêt est bien desservi par le sens
    choisi ;
  - téléphones (enregistrement, retrait à la déconnexion) ;
  - historique, lecture, notification d'essai ;
  - `PATCH /me` : langue et préférence.
- **Moteur d'alertes** :
  - le module temps réel émet un nouvel événement interne, `vehiclesUpdated`,
    au rythme de la diffusion Socket.io ;
  - le module des signalements émet `reportResolved` **après** la transaction
    de décision ;
  - le moteur écoute les deux, sans dépendance circulaire.
- **Anti-spam, sûr même avec des déclenchements simultanés ou après un
  redémarrage** :
  - « bus qui approche » : une mise à jour conditionnelle de
    `alerts.last_approach_at` (30 min) ;
  - perturbations et résultats : la clé unique, qui garantit une seule
    notification par signalement et par personne. L'auteur et les votants ne
    reçoivent pas la perturbation : ils sont déjà au courant.
- **Envoi** : interface `PushSender`, choisie par `PUSH_PROVIDER` :
  - `log` (par défaut) : la notification s'affiche dans la console, **tout
    marche sans Firebase** ;
  - `fcm` : firebase-admin, chargé seulement à ce moment-là ;
  - `memory` : tests.

  Les jetons refusés par FCM sont supprimés. Un échec d'envoi ne fait jamais
  échouer l'action qui l'a déclenché.

- **Nettoyage** toutes les heures : historique au-delà de 30 jours, téléphones
  muets depuis 60 jours, 5 téléphones au plus par compte.

**Mobile**

- **Étoile « favori »** dans l'en-tête du détail d'une ligne et dans le panneau
  d'un arrêt. Elle change **immédiatement**, et revient en arrière si la requête
  échoue. Sans compte, elle mène à la connexion.
- **Onglet Lignes** : « Mes favoris » en tête (lignes, puis arrêts). Un arrêt
  favori s'ouvre sur la carte.
- **Onglet Alertes** (il était vide jusqu'ici) :
  - mes alertes, avec leur interrupteur ;
  - historique des notifications (non lues en évidence, « tout marquer comme
    lu ») ;
  - avertissement si les push ne peuvent pas arriver sur ce téléphone ;
  - place réservée aux alternatives de la phase 9.

  La pastille rouge de l'onglet donne le nombre de notifications non lues.

- **Formulaire d'alerte** (`alerts/edit`), ouvert par la cloche d'un arrêt ou par
  « Nouvelle alerte » :
  - choix de l'arrêt (favoris, puis arrêts proches), puis de la ligne et du
    sens (déduits s'il n'y en a qu'un) ;
  - délai, jours, et heures par quart d'heure avec « − » et « + » (sans
    nouvelle dépendance native) ;
  - logique en fonctions pures (`alertForm.ts`).
- **Profil → Notifications** :
  - état sur ce téléphone, avec « Autoriser » ou « Ouvrir les réglages » ;
  - essai ;
  - préférence « résultat de mes signalements ».
- **Notifications natives** (`src/notifications/`) :
  - `expo-notifications` est **chargé à la demande**, jamais dans Expo Go ;
  - trois canaux Android traduits ;
  - toucher une notification ouvre la ligne concernée ;
  - la permission est demandée à la **création de la première alerte**, pas au
    lancement ;
  - l'icône de notification est un bus blanc de 96×96 px, comme l'exige
    Android ;
  - `app.config.ts` ajoute `google-services.json` au build par une variable
    d'environnement.
- **Déconnexion** : le téléphone est retiré du compte (3 s au plus, hors ligne
  compris), et les favoris, alertes et notifications sont effacés du cache.

### Écarts et problèmes rencontrés

- **Destinations** : les données écrivent déjà « vers Ksour Essef ». Mes
  premiers textes auraient affiché « Bus 10 vers vers Ksour Essef ». Les textes
  reprennent maintenant la destination telle quelle (vu en préparant les tests
  e2e).
- **Expo Go** : importer `expo-notifications` y affiche un avertissement à chaque
  lancement, et la récupération du jeton y lève une erreur sur Android. D'où le
  chargement à la demande, et la détection `pushSupport()`.
- **Pluriels** : pas de suffixes i18next (`_one`, `_other`). L'arabe a six formes,
  et le test de parité des clés aurait cassé. J'ai choisi des formulations sans
  pluriel.
- **Avertissement `pg`** pendant les tests e2e (« client.query() when the client
  is already executing a query ») : il existait déjà en phase 6. Il vient de
  Prisma et n'a aucun effet avec `pg` 8 ; c'est noté dans CLAUDE.md pour une
  future mise à jour.
- **`expo-doctor`** a échoué deux fois sur un contrôle qui interroge l'API
  d'Expo (« fetch failed »), puis a validé ses 20 contrôles : c'était une coupure
  réseau passagère.
- Une commande d'écriture de documentation passée par le shell a mal interprété
  les accents graves ; la section a été réécrite avec l'outil d'édition. Ces
  messages d'erreur n'ont touché aucun fichier.

### Fichiers créés ou modifiés

```
packages/shared/src/alerts.ts, notifications.ts, favorites.ts (+ tests) (créés)
packages/shared/src/user.ts (préférence, PATCH /me), index.ts
apps/api/prisma/schema.prisma, migrations/20261018183418_favorites_alerts_notifications/
apps/api/src/favorites/ (créé) : favorites.module.ts, favorites.controller.ts, favorites.service.ts
apps/api/src/alerts/ (créé) : alerts.module.ts, alerts.controller.ts, alerts.service.ts
apps/api/src/notifications/ (créé) : notifications.module.ts, notifications.controller.ts,
     notifications.service.ts, alert-engine.service.ts,
     push/push-sender.ts, push.provider.ts, fcm-push-sender.ts, log-push-sender.ts,
     memory-push-sender.ts, push-senders.test.ts
apps/api/src/users/users.controller.ts (créé), users.service.ts, users.module.ts, enums-sync.test.ts
apps/api/src/reports/reports.events.ts (créé), reports.service.ts, reports.module.ts
apps/api/src/live/live.events.ts, live.broadcaster.ts, live.registry.ts
apps/api/src/network/network.mapper.ts (toLineSummary), network.service.ts
apps/api/src/config/env.schema.ts (+ test), app.module.ts, .env.example, package.json
apps/api/test/notifications.e2e-test.ts (créé), utils.ts, test-env.cjs
apps/mobile/app/alerts/edit.tsx (créé), (tabs)/alerts.tsx (réécrit), (tabs)/_layout.tsx,
     (tabs)/lines.tsx, (tabs)/index.tsx, (tabs)/profile.tsx, lines/[id].tsx, _layout.tsx
apps/mobile/src/notifications/push.ts, PushProvider.tsx (créés)
apps/mobile/src/favorites/favorites.ts (+ test), useFavorites.ts (créés)
apps/mobile/src/alerts/alertForm.ts (+ test), alertText.ts (créés)
apps/mobile/src/api/me.ts (créé), network.ts, queryClient.ts (+ test), http.ts, client.test.ts
apps/mobile/src/auth/AuthProvider.tsx, session.ts
apps/mobile/src/components/AlertRow.tsx, NotificationRow.tsx, NotificationsCard.tsx,
     FavoriteButton.tsx, IconButton.tsx, ChoiceChips.tsx, TimeStepper.tsx, ToggleRow.tsx,
     AlertsComponents.test.tsx (créés), StopPassagesPanel.tsx
apps/mobile/src/time/format.ts (+ test), i18n/locales/fr.json, ar.json
apps/mobile/app.json (plugin), app.config.ts (créé), assets/notification-icon.png (créé),
     eas.json (environnement EAS), .env.example, package.json
.gitignore (clés Firebase), pnpm-workspace.yaml, pnpm-lock.yaml
CLAUDE.md, README.md, docs/ARCHITECTURE.md, apps/api/README.md, apps/mobile/README.md, JOURNAL.md
```

### Commandes pour lancer et tester

```bash
pnpm install
pnpm --filter @buslive/api prisma:deploy    # nouvelles tables
pnpm dev:api && pnpm dev:mobile
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Résultats obtenus :

- lint, format et typecheck sans erreur ;
- tests unitaires : 107 dans shared, 53 dans l'API et 101 dans le mobile ;
- tests e2e : **109**, dont 17 nouveaux. Parmi eux :
  - un **vrai partage de position** à environ 10 min de l'arrêt déclenche **une
    seule** notification « bus qui approche », en arabe pour un compte en
    arabe ; rien pour un délai trop court ni pour l'autre sens ;
  - une panne confirmée prévient l'abonné et l'auteur (+10), mais pas les
    votants ;
  - la préférence « résultat de mes signalements » est respectée ;
  - un jeton refusé par FCM est supprimé ; les favoris sont idempotents ; les
    limites et les accès aux alertes des autres sont vérifiés ;
- `expo-doctor` : 20 vérifications sur 20 ; le bundle Android se construit
  (5,4 Mo) ;
- l'API compilée démarre avec `PUSH_PROVIDER=log`, et ses 11 nouvelles routes
  apparaissent dans Swagger ;
- écart schéma ↔ base : « empty migration ».

**Pas encore testé sur un vrai téléphone**, et aucun envoi réel par FCM : il
faut d'abord le projet Firebase.

### À configurer soi-même

1. **Appliquer la migration** : `pnpm --filter @buslive/api prisma:deploy`.
2. **Créer le projet Firebase**, puis une app Android `tn.buslive.app` ;
   télécharger `google-services.json` dans `apps/mobile/` (ignoré par git).
3. **Donner ce fichier à EAS** :
   `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment development --visibility secret`
   (dans `apps/mobile`, après `eas login` et `eas init` si ce n'est pas fait).
4. **Refaire le build de développement** (commiter d'abord) :
   `eas build --profile development --platform android`.
5. **Clé du compte de service** (Paramètres du projet → Comptes de service →
   Générer une nouvelle clé privée) dans
   `apps/api/secrets/firebase-service-account.json`. Ensuite, dans
   `apps/api/.env` : `PUSH_PROVIDER=fcm` et
   `GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-service-account.json`.
   **Cette clé donne le droit d'envoyer des notifications à tous les
   utilisateurs : elle ne doit jamais être partagée ni versionnée.**
6. **Faire relire les nouveaux textes arabes** : notifications, alertes, jours,
   favoris.
7. **Plus tard** : les icônes de l'app sont encore celles du modèle Expo ;
   c'est à prévoir avant la publication (phase 11).

### Message de commit proposé

```
feat(alerts): favoris, alertes « mon trajet » et notifications push FCM

- favoris (lignes, arrêts) liés au compte, disponibles hors ligne
- alertes : bus en direct qui approche (5/10/15 min) et perturbations confirmées, par plage horaire
- moteur d'alertes sur les événements internes, anti-doublon en base, textes fr/ar partagés
- envoi FCM (firebase-admin) derrière PushSender ; mode console sans Firebase
- mobile : onglet Alertes, formulaire d'alerte, étoiles, notifications dans le Profil
```

## Phase 9 — Alternatives (louage, covoiturage) et « Partager mon trajet » (19/10/2026)

Choix validés avant de commencer :

- covoiturage par **demande puis acceptation**, les numéros n'étant échangés
  qu'après l'acceptation ;
- page de suivi **web, sans carte**, sans aucun service extérieur.

### Ce qui a été fait et pourquoi

**Règles et formats (`@buslive/shared`, testés)**

- `money.ts` : montants en **millimes** (entiers, pour éviter les erreurs
  d'arrondi), et `formatMillimes` → « 3,500 DT » ou « 3,500 د.ت ».
- `louage.ts` : stations, destinations, prix, horaires, `isStationOpen`.
- `rides.ts` :
  - `RIDE_RULES` : 6 places au plus, 100 DT au plus, départ entre 10 min et
    7 jours, 3 trajets en cours par conducteur, 10 demandes par jour, score de
    confiance minimal −50 ;
  - schémas, `seatsLeft` et `isRideOpen`.
- `trips.ts` : formats des liens de suivi, et `tripShareExpiry` (3 h au plus, ou
  15 min après la fin du partage).
- `notifications.ts` : 4 notifications de covoiturage (demande, acceptée,
  refusée, trajet annulé) dans un nouveau canal Android « rides ». En arabe, le
  trajet s'écrit « من … إلى … » : une flèche se lirait à l'envers.
- `PATCH /me` accepte maintenant le **téléphone** (format tunisien vérifié).

**API**

- **Base** (migration `alternatives_trip_shares`) :
  - `louage_stations`, avec une position PostGIS calculée par un trigger,
    comme pour les arrêts ;
  - `louage_routes`, `ride_offers`, `ride_requests` (une seule demande par
    passager et par trajet) et `ride_flags` ;
  - `trip_shares`, qui ne stocke que l'**empreinte** du jeton ;
  - des contraintes CHECK écrites à la main.
- **Seed** : 7 localités de destination, plus 2 stations de louage de
  démonstration (Mahdia et Ksour Essef). Les prix et horaires sont **inventés**,
  et signalés comme tels.
- **Louages** :
  - `GET /localities` ;
  - `GET /louage/stations/nearby`, par PostGIS, avec un filtre sur la
    destination (la destination demandée est listée en premier).
- **Covoiturage** (`/rides`, réservé aux comptes connectés) :
  - publier, chercher, voir le détail, annuler ;
  - demander des places, accepter, refuser, annuler sa demande ;
  - signaler une annonce.

  Points clés :
  - **les numéros ne sont visibles qu'après acceptation, et seulement entre le
    conducteur et ce passager**. Cette règle est appliquée en un seul endroit,
    `rides.mapper.ts` ;
  - l'acceptation se fait dans une transaction qui **verrouille** l'annonce
    (`FOR UPDATE`) : deux acceptations simultanées ne dépassent jamais le
    nombre de places (testé) ;
  - un refus est définitif pour ce trajet, et une demande annulée peut être
    refaite ;
  - les notifications passent par le système de la phase 8.

- **Partager mon trajet** :
  - `POST /trips` crée un lien pour **mon** partage en cours. Le jeton fait 24
    octets aléatoires, il n'est donné qu'une fois, et la base n'en garde que
    l'empreinte SHA-256 ;
  - `GET /trips/:token` est public, limité par adresse IP, et ne contient
    **aucune donnée personnelle** (ni nom, ni téléphone, ni positions) ;
  - le statut vaut « en direct », « position ancienne », « arrivé » ou
    « terminé ». L'arrivée est détectée par l'événement interne `stopPassed`,
    qui porte maintenant l'identifiant du partage ; il n'est jamais stocké avec
    les passages observés ;
  - la page **`/t/<jeton>`** est servie hors du préfixe `/api/v1`, pour un lien
    court. Elle est légère, en français ou en arabe selon le navigateur, avec un
    mode sombre et une mise à jour toutes les 10 s. Son script est un fichier
    séparé (la CSP de helmet interdit les scripts intégrés), et les données y
    sont insérées en `textContent` (pas d'injection possible).

**Mobile**

- **Écran Alternatives** :
  - destination à choisir, ou proposée depuis le détail d'une ligne (localité
    du terminus) ;
  - louages proches (ouvert ou fermé, distance, prix, durée) ;
  - covoiturages au départ de la localité la plus proche (**déduite** de la
    station de louage la plus proche, et modifiable) ;
  - « Mes covoiturages » et un rappel de prudence.

  Il s'ouvre depuis l'onglet Alertes, où la place était réservée depuis la
  phase 8, et depuis le détail d'une ligne.

- **Détail d'un trajet** :
  - côté passager : demander des places, voir l'état de la demande, puis
    « Appeler le … » une fois la demande acceptée ;
  - côté conducteur : accepter ou refuser les demandes, et annuler le trajet ;
  - « Signaler » avec 3 motifs, sans texte libre.
- **Proposer un trajet** : départ et arrivée, jour (7 jours), heure par quart
  d'heure, places, participation par 500 millimes. La logique est en
  fonctions pures (`rideForm.ts`), et les heures sont saisies en heure de
  Tunis.
- **Partager mon trajet** : une carte dans l'écran de partage. L'arrêt de
  descente est le terminus par défaut. La carte crée le lien, ouvre la feuille
  de partage du téléphone avec un message prêt à envoyer, liste les liens
  actifs et permet de les désactiver.
- **Profil → Téléphone** : même validation que l'API, et un message clair si le
  numéro est déjà pris.
- Les louages et les localités sont gardés hors ligne. Les données de
  covoiturage et les liens sont effacés à la déconnexion.

### Écarts et problèmes rencontrés

- **Le passage d'un arrêt ne disait pas quel partage était concerné.**
  `stopPassed` porte maintenant `sessionId`, pour détecter l'arrivée à l'arrêt
  de descente. J'ai vérifié que les passages observés ne copient que des
  champs choisis : ils restent anonymes.
- **La CSP de helmet bloque les scripts intégrés à une page** : le script de
  la page de suivi est servi à part, au lieu d'assouplir la sécurité.
- **Les arrêts ne connaissent que le code de leur localité**, pas son
  identifiant : l'écran Alternatives reçoit donc un code (`toCode`).
- **Erreurs de l'API en français** : en arabe, l'app affiche un message traduit
  (`rideErrorMessage`), avec un cas particulier pour le téléphone manquant.
- Une valeur attendue dans un test était fausse (23:30 + 1 h donne 00:30) ; le
  code était juste.

### Fichiers créés ou modifiés

```
packages/shared/src/money.ts, louage.ts, rides.ts, trips.ts, alternatives.test.ts (créés)
packages/shared/src/notifications.ts (covoiturage), user.ts (téléphone), index.ts
apps/api/prisma/schema.prisma, migrations/20261018200203_alternatives_trip_shares/
apps/api/prisma/seed/data/louage-demo.ts (créé), seed.ts, types.ts
apps/api/src/louage/ (créé) : louage.module.ts, louage.controller.ts, louage.service.ts
apps/api/src/rides/ (créé) : rides.module.ts, rides.controller.ts, rides.service.ts, rides.mapper.ts
apps/api/src/trips/ (créé) : trips.module.ts, trips.controller.ts, trips.service.ts,
     trip-page.controller.ts, trip-page.ts
apps/api/src/network/ (GET /localities, toLocalityOption), live/live.events.ts, live.service.ts,
     live.module.ts, notifications/notifications.module.ts, users/users.service.ts,
     users/enums-sync.test.ts, setup-app.ts (exclusion de /t), app.module.ts
apps/api/test/alternatives.e2e-test.ts (créé), utils.ts
apps/mobile/app/alternatives.tsx, rides/[id].tsx, rides/new.tsx (créés), _layout.tsx, share.tsx,
     (tabs)/alerts.tsx, (tabs)/profile.tsx, lines/[id].tsx
apps/mobile/src/api/alternatives.ts (créé), network.ts, queryClient.ts (+ test)
apps/mobile/src/rides/rideForm.ts (+ test), rideErrors.ts, src/trips/tripShare.ts (+ test) (créés)
apps/mobile/src/components/LouageStationCard.tsx, RideRow.tsx, LocalityChips.tsx, ValueStepper.tsx,
     TripShareCard.tsx, PhoneCard.tsx, AlternativesComponents.test.tsx (créés)
apps/mobile/src/notifications/PushProvider.tsx (canal), src/time/format.ts (+ test),
     src/i18n/locales/fr.json, ar.json
CLAUDE.md, docs/ARCHITECTURE.md, apps/api/README.md, apps/mobile/README.md, JOURNAL.md
```

### Commandes pour lancer et tester

```bash
pnpm --filter @buslive/api prisma:deploy    # nouvelles tables
pnpm --filter @buslive/api db:seed          # louages de démonstration
pnpm dev:api && pnpm dev:mobile
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Pour voir la page de suivi : lancer un partage « Je suis dans le bus », toucher
« Envoyer le lien », puis ouvrir ce lien dans un navigateur connecté au même
Wi-Fi.

Résultats obtenus :

- lint, format et typecheck sans erreur ;
- tests unitaires : 115 dans shared, 56 dans l'API et 116 dans le mobile ;
- tests e2e : **131**, dont 22 nouveaux. Ils vérifient notamment :
  - qu'**aucun numéro n'apparaît** dans la recherche ni chez un tiers, et
    qu'ils apparaissent après acceptation, de chaque côté ;
  - que deux acceptations simultanées ne dépassent pas les places ;
  - les annulations et leurs notifications, et la page web avec sa CSP ;
  - un lien de suivi **sans donnée personnelle**, l'arrivée détectée par un
    vrai partage, puis l'expiration et la désactivation ;
- `expo-doctor` : 20 sur 20 ; le bundle Android se construit (5,5 Mo) ;
- écart schéma ↔ base : « empty migration ».

**Pas encore testé sur un vrai téléphone.**

### À configurer soi-même

1. Appliquer la migration (`prisma:deploy`), puis relancer le seed (`db:seed`)
   pour les louages de démonstration.
2. **Remplacer les données de louage par des vraies** : emplacements, tarifs
   officiels, horaires (`louage-demo.ts`). La modération de la phase 10
   permettra de les gérer.
3. **Faire relire les nouveaux textes arabes** : alternatives, covoiturage,
   partage de trajet, téléphone, notifications.
4. **Plus tard (phase 11)** : l'adresse publique de l'API, pour que les liens de
   suivi s'ouvrent en dehors du Wi-Fi ; la vérification du téléphone par SMS ;
   une recherche de localités quand toute la Tunisie sera couverte.

### Message de commit proposé

```
feat(alternatives): louages, covoiturage et « Partager mon trajet »

- louages : stations proches (PostGIS), destinations, prix en millimes, données de démonstration
- covoiturage : demande puis acceptation, numéros échangés seulement après acceptation, places verrouillées
- notifications de covoiturage (canal « rides »), signalement des annonces, téléphone dans le profil
- lien de suivi secret (empreinte en base) et page web /t/<jeton> sans donnée personnelle
- mobile : écran Alternatives, trajets de covoiturage, partage du trajet en cours
```
