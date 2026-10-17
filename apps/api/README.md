# @buslive/api

API BusLive : NestJS 12, Prisma 7, PostgreSQL + PostGIS (Socket.io en phase 6).

## Démarrer

```bash
# depuis la racine du monorepo
cp apps/api/.env.example apps/api/.env      # puis adapter DATABASE_URL
pnpm db:up                                  # base Docker
pnpm --filter @buslive/api prisma:deploy    # appliquer les migrations
pnpm dev:api                                # API + rechargement automatique
```

| URL                                             | Rôle                                    |
| ----------------------------------------------- | --------------------------------------- |
| `GET http://localhost:3000/api/v1/health`       | Liveness : le processus répond          |
| `GET http://localhost:3000/api/v1/health/ready` | Readiness : base + PostGIS (503 sinon)  |
| `http://localhost:3000/api/docs`                | Documentation Swagger (hors production) |

## Scripts

| Script            | Effet                                                         |
| ----------------- | ------------------------------------------------------------- |
| `dev`             | Compile avec `tsc-watch` et relance l'API à chaque changement |
| `build` / `start` | Compile dans `dist/` / lance la version compilée              |
| `test`            | Tests unitaires (`src/**/*.test.ts`, sans base)               |
| `test:e2e`        | Tests de bout en bout (`test/*.e2e-test.ts`, base requise)    |
| `prisma:migrate`  | Crée et applique une migration (développement)                |
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
  prisma/            PrismaService (connexion via @prisma/adapter-pg)
  health/            routes de santé (Terminus) + indicateur PostGIS
  generated/prisma/  client Prisma généré (ignoré par git)
prisma/
  schema.prisma      schéma de la base
  migrations/        migrations SQL versionnées
test/                tests e2e
```

## À savoir

- **Pas de `@nestjs/cli`** : il exige Node ≥ 22.22.3. Le build passe par `tsc`, et
  les nouveaux modules, contrôleurs et services se créent à la main, sur le modèle
  de `src/health/`.
- **Tests en mode ESM** : NestJS 12 n'existe qu'en ESM. Dans un test, importer
  `jest` explicitement : `import { jest } from '@jest/globals'`.
- **Nouvelle variable d'environnement** : l'ajouter à `src/config/env.schema.ts` et
  à `.env.example`.
