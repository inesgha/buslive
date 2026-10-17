# BusLive — instructions pour l'assistant de code

Ce fichier est lu au début de chaque session. Il fixe les règles de travail et
résume le projet. Lis aussi `JOURNAL.md` (historique des phases) et
`docs/ARCHITECTURE.md` (vue d'ensemble) avant de commencer.

## Règles de travail (OBLIGATOIRES)

1. Avant chaque phase, présenter le **plan détaillé** de la phase, puis **attendre l'accord**.
2. Ne **jamais** passer à la phase suivante sans que l'utilisatrice dise « continue ».
3. À la fin de chaque phase, donner un résumé avec :
   - ce qui a été fait et pourquoi ;
   - la liste des fichiers créés ou modifiés ;
   - les commandes pour lancer et tester ;
   - ce qu'elle doit configurer elle-même (clés API, comptes…) ;
   - un message de commit proposé.
4. Ajouter ce résumé dans `JOURNAL.md` (une section par phase, avec la date).
5. Git : ne **jamais** faire `git commit` ni `git push`. C'est elle qui commit et qui push.
6. Signature : ne **jamais** mentionner Claude, Anthropic ou une IA dans le code, les
   commentaires, le README, les messages de commit ou les descriptions de PR
   (pas de « Co-Authored-By », pas de « Generated with … »).
7. Ces règles restent valables à chaque nouvelle session.
8. Code propre, commenté en français quand c'est utile, **aucun secret dans le code**
   (fichiers `.env`, seuls les `.env.example` sont versionnés).

Elle est développeuse : expliquer les choix techniques pour qu'elle puisse maintenir
le code seule. Échanges en français.

## Le projet

Application mobile de transport en commun pour la Tunisie. La position des bus est
partagée en temps réel par les passagers (crowdsourcing), sans accord avec les
sociétés de transport. Lancement : Mahdia et Ksour Essef ; architecture prévue pour
toute la Tunisie (gouvernorats activables un par un).

## Stack (tout en TypeScript)

| Dossier           | Rôle                       | Technologies                                                  |
| ----------------- | -------------------------- | ------------------------------------------------------------- |
| `apps/mobile`     | App passagers              | React Native + Expo (expo-router), react-native-maps, i18next |
| `apps/admin`      | Modération et statistiques | React + Vite                                                  |
| `apps/api`        | API et temps réel          | NestJS, Prisma, PostgreSQL + PostGIS, Socket.io               |
| `packages/shared` | Types et schémas partagés  | zod, compilé avec tsup (ESM + CJS)                            |

Notifications : Firebase Cloud Messaging. Base locale : Docker Compose (PostGIS).

## Conventions

- Identifiants (variables, fonctions, fichiers) en **anglais** ; commentaires et docs en **français**.
- TypeScript strict (`tsconfig.base.json`), chaque package l'étend.
- Prettier : guillemets simples, point-virgule, 100 colonnes, fins de ligne LF.
- ESLint flat config à la racine (`eslint.config.mjs`).
- Hook pre-commit (Husky + lint-staged) : ESLint + Prettier sur les fichiers indexés.
- Tests avec Jest, fichiers `*.test.ts` à côté du code testé.
- Les types et schémas utilisés par plusieurs apps vont dans `packages/shared`.
- Les codes métier stables (ex. types de signalement) sont en MAJUSCULES ; les
  libellés affichés passent par l'i18n.

## Versions figées et pourquoi

- **Node ≥ 22.18** (poste actuel : 22.19). lint-staged 17 exige 22.22+, d'où lint-staged 16.
- **pnpm 10.34.7** via Corepack (champ `packageManager`). pnpm 12 ne démarre pas avec
  Corepack 0.34.
- **TypeScript 6.0.x** : TypeScript 7 n'est pas encore supporté par typescript-eslint
  (< 6.1) ni par ts-jest (< 7).
- **Prisma 7.10.1** (CLI et client à la même version exacte, sans `^`). L'étiquette
  npm `latest` de `prisma` pointe vers une 8.0.0-rc : ne pas suivre la notification
  « Update available ».
- **NestJS 12, sans `@nestjs/cli`** : toutes les versions de `@nestjs/cli` 12 exigent
  Node ≥ 22.22.3 (via `@angular-devkit`). Le build utilise `tsc`, le mode dev
  `tsc-watch`, et les fichiers se créent à la main (pas de `nest generate`).

## Particularités de l'API (apps/api)

- NestJS 12 est publié **uniquement en ESM**. L'API reste compilée en **CommonJS**
  (`module: NodeNext` sans `"type": "module"`) : Node 22 charge l'ESM depuis du
  CommonJS (`require(esm)`).
- Les **tests Jest tournent en mode ESM** (`node --experimental-vm-modules`, config
  `jest.base.cjs`, `tsconfig.jest.json`), car Jest ne supporte `require(esm)`
  qu'à partir de Node 24.9. Dans un test, importer `jest` :
  `import { jest } from '@jest/globals'`.
- Injection de dépendances : ne **jamais** importer une classe injectée avec
  `import type` (les décorateurs ont besoin de la classe à l'exécution). La config
  ESLint de `apps/api` est réglée pour ne pas proposer cette conversion.
- Prisma 7 : client généré dans `src/generated/prisma` (ignoré par git, recréé
  par `pnpm install`), connexion via `@prisma/adapter-pg`, config dans
  `prisma.config.ts`. Les extensions PostgreSQL sont créées par la migration `0_init`.
- Variables d'environnement validées par zod au démarrage (`src/config/env.schema.ts`).
  Toute nouvelle variable doit y être ajoutée, ainsi que dans `apps/api/.env.example`.
- Routes préfixées `/api/v1`. Santé : `/api/v1/health` (liveness) et
  `/api/v1/health/ready` (base + PostGIS). Swagger : `/api/docs` (hors production).
- Si Node passe à ≥ 24.9 : on pourra repasser Jest en mode CommonJS classique et
  réinstaller `@nestjs/cli`.

## Commandes

```bash
pnpm install          # installer les dépendances
pnpm build            # compiler les packages
pnpm typecheck        # vérifier les types
pnpm test             # lancer les tests unitaires
pnpm test:e2e         # tests de bout en bout (base Docker requise)
pnpm dev:api          # API en mode développement (http://localhost:3000/api/v1)
pnpm --filter @buslive/api prisma:migrate   # créer / appliquer une migration
pnpm lint             # ESLint
pnpm format           # Prettier (écriture)
pnpm db:up            # démarrer PostgreSQL + PostGIS
pnpm db:psql          # console SQL
pnpm db:down          # arrêter les conteneurs
```

## Phases

0. Monorepo, outils, Docker, CLAUDE.md
1. API de base : NestJS, Prisma, connexion PostGIS, santé de l'API
2. Authentification : inscription, connexion, JWT
3. Modèle de données : gouvernorats, lignes, arrêts, horaires (+ données de test Mahdia / Ksour Essef)
4. Squelette mobile : navigation, thème, i18n fr/ar avec RTL
5. Écran Carte : arrêts proches, prochains bus
6. Partage en direct « Je suis dans le bus » (Socket.io, localisation en arrière-plan)
7. Signalements et score de confiance
8. Favoris et notifications push
9. Alternatives (louage, covoiturage) et « Partager mon trajet »
10. Tableau de bord admin
11. Tests, sécurité, préparation au déploiement

Plus tard (ne pas coder, mais garder la place) : tickets et abonnements avec
paiement Konnect, Flouci ou Paymee — voir `docs/ARCHITECTURE.md`.

## Design

- Accent jaune bus `#FFC52E`, bleu nuit `#0E1B2C` (texte, éléments forts),
  fond `#F3F5F4`, cartes blanches.
- Statuts : en direct `#0B7A5E`, pas venu `#B42335`, retard `#B45309`.
- Police : Readex Pro (latin + arabe).
- Écrans : Carte en direct, Détail d'une ligne, Je suis dans le bus, Signaler,
  Alertes et alternatives.
- Barre de navigation : Carte, Lignes, Signaler (bouton central), Alertes, Profil.
- Français et arabe (RTL), mode sombre, horaires disponibles hors ligne.
