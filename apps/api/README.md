# @buslive/api

API BusLive : NestJS 12, Prisma 7, PostgreSQL + PostGIS (Socket.io en phase 6).

## Démarrer

```bash
# depuis la racine du monorepo
cp apps/api/.env.example apps/api/.env      # puis adapter DATABASE_URL et JWT_ACCESS_SECRET
pnpm db:up                                  # base Docker
pnpm --filter @buslive/api prisma:deploy    # appliquer les migrations
pnpm dev:api                                # API + rechargement automatique
```

| URL                                             | Rôle                                    |
| ----------------------------------------------- | --------------------------------------- |
| `GET http://localhost:3000/api/v1/health`       | Liveness : le processus répond          |
| `GET http://localhost:3000/api/v1/health/ready` | Readiness : base + PostGIS (503 sinon)  |
| `http://localhost:3000/api/docs`                | Documentation Swagger (hors production) |

## Authentification

| Route                        | Accès          | Rôle                                |
| ---------------------------- | -------------- | ----------------------------------- |
| `POST /api/v1/auth/register` | public, limité | Inscription → profil + jetons       |
| `POST /api/v1/auth/login`    | public, limité | Connexion → profil + jetons         |
| `POST /api/v1/auth/refresh`  | public         | Nouveau couple de jetons (rotation) |
| `POST /api/v1/auth/logout`   | public         | Révoque la session (204)            |
| `GET /api/v1/auth/me`        | connecté       | Profil de l'utilisateur             |

- **Access token** : JWT de 15 min, à envoyer dans `Authorization: Bearer <jeton>`.
- **Refresh token** : jeton opaque de 30 jours. À chaque `/refresh`, il est
  remplacé par un nouveau ; présenter un ancien jeton révoque toute la session
  (protection contre le vol). Le client ne doit donc lancer qu'un seul
  `/refresh` à la fois.
- **Tester dans Swagger** : appeler `/auth/login`, copier `tokens.accessToken`,
  cliquer sur « Authorize » et le coller.

Dans le code :

```ts
@Public()                 // route accessible sans connexion
@MinRole('MODERATOR')     // rôle minimal (USER < MODERATOR < ADMIN)
@RateLimit()              // limitation par IP (RATE_LIMIT_* du .env)
me(@CurrentUser() user: AuthenticatedUser) { … }   // { id, role }
```

## Scripts

| Script            | Effet                                                         |
| ----------------- | ------------------------------------------------------------- |
| `dev`             | Compile avec `tsc-watch` et relance l'API à chaque changement |
| `build` / `start` | Compile dans `dist/` / lance la version compilée              |
| `test`            | Tests unitaires (`src/**/*.test.ts`, sans base)               |
| `test:e2e`        | Tests de bout en bout (`test/*.e2e-test.ts`, base `_test`)    |
| `prisma:migrate`  | Crée et applique une migration, puis régénère le client       |
| `prisma:deploy`   | Applique les migrations existantes (production, CI)           |
| `prisma:generate` | Régénère le client Prisma (fait aussi par `pnpm install`)     |
| `prisma:studio`   | Interface web pour explorer les données                       |

## Organisation

```
src/
  main.ts            démarrage
  setup-app.ts       préfixe /api/v1, helmet, CORS, Swagger (partagé avec les tests e2e)
  app.module.ts      module racine
  config/            validation des variables d'environnement (zod)
  common/            ZodValidationPipe, zodToOpenApi, limitation des requêtes
  prisma/            PrismaService (connexion via @prisma/adapter-pg)
  auth/              inscription, connexion, jetons, guards et décorateurs
  users/             accès aux utilisateurs
  health/            routes de santé (Terminus) + indicateur PostGIS
  generated/prisma/  client Prisma généré (ignoré par git)
prisma/
  schema.prisma      schéma de la base
  migrations/        migrations SQL versionnées
test/                tests e2e (base séparée « _test », créée automatiquement)
```

## À savoir

- **Pas de `@nestjs/cli`** : il exige Node ≥ 22.22.3. Le build passe par `tsc`, et
  les nouveaux modules, contrôleurs et services se créent à la main, sur le modèle
  de `src/auth/` ou `src/health/`.
- **Tests en mode ESM** : NestJS 12 n'existe qu'en ESM. Dans un test, importer
  `jest` explicitement : `import { jest } from '@jest/globals'`.
- **Nouvelle dépendance Nest** : vérifier qu'elle est en ESM
  (`npm view <paquet> type` → `module`), sinon elle ne sera pas testable avec Jest
  sous Node 22.
- **Nouvelle variable d'environnement** : l'ajouter à `src/config/env.schema.ts` et
  à `.env.example`.
- **Nouvelle table** : l'ajouter au `TRUNCATE` de `test/utils.ts`.
