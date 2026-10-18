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
