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
- **Expo SDK 58** (React Native 0.88, React 19.3). Toujours installer un module
  natif avec `npx expo install <paquet>` (dans `apps/mobile`), qui choisit la
  version compatible avec le SDK. Vérifier avec `npx expo-doctor`.

## Particularités de l'app mobile (apps/mobile)

- expo-router : un fichier de `app/` = un écran. Barre d'onglets dans
  `app/(tabs)/_layout.tsx`, écrans modaux de connexion dans `app/auth/`.
- Thème : couleurs uniquement via `useTheme().colors` / `AppText color=…` (jamais
  en dur). Police Readex Pro importée graisse par graisse (4 graisses).
  `contrast.test.ts` vérifie le contraste AA de chaque couleur de texte.
- Textes : clés i18next typées ; toute clé ajoutée dans `fr.json` doit l'être dans
  `ar.json` (test `locales.test.ts`). Textes arabes à faire relire par une
  personne arabophone.
- RTL : `I18nManager` (natif). Changer fr ↔ ar demande un redémarrage
  (`reloadAppAsync` d'`expo`), géré dans `src/i18n/direction.ts` avec un garde-fou
  anti-boucle. `<TextInput>` ne s'aligne pas seul : passer par `TextField`.
- Session : refresh token dans `expo-secure-store`, access token en mémoire,
  profil en cache (AsyncStorage) pour l'affichage hors ligne. `apiRequest(…, { auth: true })`
  regroupe les rafraîchissements simultanés en UNE requête `/auth/refresh`.
- Réponses de l'API validées par les schémas zod de `@buslive/shared` (`src/api/http.ts`).
- Configuration locale dans `apps/mobile/.env.local` (pas `.env` : Expo refuse
  `REACT_NATIVE_PACKAGER_HOSTNAME` hors d'un fichier `.local`). Le PC a des
  cartes réseau VMware/WSL : `REACT_NATIVE_PACKAGER_HOSTNAME` force l'IP Wi-Fi.
- Carte : `react-native-maps` (Google Maps, sans clé dans Expo Go ; clé Android
  à configurer pour les builds de production). Marqueurs personnalisés avec
  `tracksViewChanges={false}` (et la sélection dans la `key` pour les redessiner).
  Localisation : `expo-location`, permission « pendant l'utilisation » seulement.
- Partage « Je suis dans le bus » (`src/live/`) : la tâche d'arrière-plan
  (`backgroundTask.ts`, importée dans `app/_layout.tsx`) n'existe pas dans Expo Go
  sur Android → mode « app ouverte » (`ShareProvider`, `isExpoGo()`). Build de
  développement : `eas build --profile development --platform android` (fait par
  l'utilisatrice, avec son compte Expo). Ne jamais retirer `share.disclosure`
  (information exigée par Google Play avant la permission « Toujours »).
  Bus en direct : `useLineVehicles(lineIds)` (Socket.io), masqués hors ligne et
  après 2 min sans position (`isFresh`).
- Hors ligne : cache TanStack Query persisté dans AsyncStorage (24 h), seulement
  les clés listées dans `shouldPersistQuery` (`src/api/queryClient.ts`). Clés de
  cache centralisées dans `queryKeys` (`src/api/network.ts`). Bandeau
  `OfflineBanner` (NetInfo). Changer `buster` si le format en cache change.
- Tests : `jest-expo` + Testing Library 14 (**`render` est asynchrone : `await render(…)`**).
  Simulations d'AsyncStorage, expo-secure-store, NetInfo et des icônes Ionicons
  dans `jest.setup.cjs`.
- Rendu pur (règle `react-hooks/purity`) : jamais `Date.now()` pendant l'affichage,
  utiliser `useNow()` (ou `useServiceClock()` pour l'heure de Tunis).
- Signalements : formulaire en fonctions pures (`src/reports/reportForm.ts`),
  valeurs par défaut DÉDUITES (bus partagé, arrêt le plus proche) plutôt que
  recopiées dans l'état ; mises à jour en direct via `useReportUpdates` (Socket.io
  « reports »). Les signalements ne sont pas gardés dans le cache hors ligne.
- Vérifier que l'app s'assemble sans téléphone :
  `npx expo export --platform android --output-dir <dossier temporaire>`.
- Expo réécrit `tsconfig.json#include` au démarrage : garder `["**/*.ts", "**/*.tsx"]`.

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
  `prisma migrate dev` ne régénère plus le client : utiliser le script
  `prisma:migrate` (qui enchaîne `generate`).
- **Migrations, règles pour l'assistant** :
  - ne JAMAIS lancer `prisma migrate dev` sans `--create-only` hors d'un terminal
    interactif : s'il détecte un écart, il attend un nom de migration et bloque
    (en gardant un verrou sur la base). Créer avec `--create-only`, relire et
    éditer le SQL, puis appliquer avec `prisma migrate deploy` ;
  - vérifier l'absence d'écart schéma ↔ base avec
    `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
    (doit afficher « empty migration ») ;
  - ne jamais modifier une migration déjà appliquée (son empreinte est vérifiée) :
    en ajouter une nouvelle ;
  - `prisma migrate reset` est refusé par Prisma sans l'accord explicite de
    l'utilisatrice : le lui demander, ne jamais contourner.
- **PostGIS et Prisma** : les colonnes géographiques sont déclarées
  `Unsupported("geography(…)")` et lues ou écrites en SQL brut (`$queryRaw`).
  `stops.location` est calculée par le trigger `stops_set_location` à partir de
  `latitude`/`longitude` (pas de colonne générée : Prisma la prend pour une valeur
  par défaut et voudrait la supprimer). Le tracé `line_directions.shape` est
  écrit par le seed (lignes droites entre arrêts, à remplacer par un vrai tracé).
- **Réseau** (`src/network/`) : routes publiques `GET /governorates`, `/lines`,
  `/lines/:id`, `/stops/nearby`, `/stops/:id/departures`, `/stops/:id`. Seuls les
  éléments `ACTIVE` d'un gouvernorat actif sont visibles (filtres `VISIBLE_*` dans
  `network.filters.ts`). `stops/nearby` doit rester déclarée AVANT `stops/:id`.
  Arrêts proches : `ST_DWithin` + tri `<->` (index GIST), paramètres SQL castés
  explicitement (`::double precision`). La position reçue n'est jamais stockée.
- **Horaires** : minutes depuis minuit (heure de Tunis), dates « AAAA-MM-JJ ».
  Les calculs sont dans `@buslive/shared` (`schedule.ts`, `passages.ts`,
  `clock.ts`), pour que l'API et le mobile (hors ligne) calculent la même chose.
  Calendrier de plus haute priorité = celui qui l'emporte (ex. Ramadan). Un bus
  après minuit (≥ 1440) appartient à la journée de service de la veille.
  `tunisClock()` donne l'heure de Tunis (Intl, repli UTC+1) : ne jamais utiliser
  l'heure locale du serveur ou du téléphone pour les horaires.
- **Prochains passages** : renvoyés en heures ABSOLUES (`serviceDate` +
  `passingMinutes`) ; le compte à rebours est calculé côté app (reste juste depuis
  le cache hors ligne). Les bus en direct sont dans une liste séparée,
  `liveArrivals` (on ne devine pas quel horaire correspond à quel bus réel).
- **Temps réel** (`src/live/`) :
  - partage par REST (`POST /live/sessions`, `/live/sessions/:id/positions`,
    `DELETE /live/sessions/:id`), diffusion par Socket.io (espace `/live`, rooms
    `line:<id>`, événements `watch:line` / `vehicles`, au plus toutes les
    `LIVE_BROADCAST_INTERVAL_MS`) ;
  - règles dans `LIVE_RULES` (`@buslive/shared/live.ts`) : précision ≤ 100 m,
    vitesse ≤ 120 km/h, ≤ 300 m du tracé, ≥ 5 s entre positions, fin auto
    (terminus, 10 min d'inactivité, 3 h) ;
  - géométrie pure dans `@buslive/shared/route.ts` (projection sur le tracé,
    progression en minutes, ETA) et regroupement des passagers en bus (`groupIntoVehicles`) ;
  - registre EN MÉMOIRE (`LiveRegistry`) : pas d'historique de trajet en base,
    seulement la session et sa dernière position (vie privée). Au démarrage,
    les sessions restées ACTIVE sont closes. Plusieurs instances → Redis (phase 11) ;
  - la passerelle Socket.io est `@Public()` (sinon le guard JWT global s'appliquerait) ;
  - `ConfiguredIoAdapter` applique CORS_ORIGINS à Socket.io ;
  - aucune information sur les passagers n'est diffusée (testé) ;
  - `LiveEvents` (événements internes `stopPassed`, `sharingCompleted`) : le module
    des signalements s'y abonne. Le module temps réel ne dépend JAMAIS du module
    des signalements (sinon dépendance circulaire).
- **Signalements et confiance** (`src/reports/`) :
  - règles chiffrées dans `TRUST_RULES` (`@buslive/shared/trust.ts`), fonctions
    pures `voteWeight`, `resolveReport`, `reportLifetimeMinutes`, `trustLevel` ;
  - points versés UNIQUEMENT via `TrustService.award` (dans une transaction, ligne
    utilisateur verrouillée `FOR UPDATE`, historique `trust_events`) ;
  - décision par mise à jour conditionnelle (statut encore ACTIVE) : points versés
    une seule fois ;
  - doublon (même type, ligne, sens, arrêt, horaire) = confirmation de l'existant ;
  - preuves automatiques : un passage observé (`stop_passage_observations`, anonyme)
    dément un « pas venu » et confirme un « bus passé » (poids 3) ;
  - pas de texte libre ; la position de l'auteur n'est pas gardée (seulement sa
    distance à l'arrêt), sauf pour « arrêt déplacé » (position proposée) ;
  - statistiques : `computeLineStats` (`@buslive/shared/stats.ts`), pas de
    pourcentage sous 10 passages observés.
- `@buslive/shared` : `departures.ts` est séparé de `network.ts` pour éviter une
  dépendance circulaire avec `reports.ts` (avec zod, un cycle donne des schémas
  `undefined` au chargement).
- Tests e2e : lancer avec une limite de temps (`timeout`) ; fermer les sockets
  dans un `finally` (un socket ouvert empêche Jest de s'arrêter).
- **Seed** (`pnpm --filter @buslive/api db:seed`) : idempotent (upsert par code).
  Les 24 gouvernorats sont des données réelles ; `prisma/seed/data/mahdia-demo.ts`
  contient des **données de test inventées** (lignes, horaires) à remplacer. En
  production, seuls les gouvernorats sont insérés.
- Base de données : modèles en camelCase, tables et colonnes en snake_case
  (`@map` / `@@map`). Les enums `Role` et `Locale` existent dans Prisma ET dans
  `@buslive/shared` : un test (`enums-sync.test.ts`) vérifie qu'ils restent identiques.
- **Les dépendances CommonJS qui importent NestJS ne sont pas testables avec Jest
  sous Node 22** (elles font `require()` d'un paquet ESM). C'est le cas de
  `@nestjs/throttler` et `nestjs-pino`. Vérifier le champ `type` d'un paquet Nest
  avant de l'adopter (`npm view <paquet> type` doit donner `module`).
- **Authentification** (`src/auth/`) :
  - guard global `JwtAuthGuard` : toutes les routes exigent un access token, sauf
    celles marquées `@Public()` ;
  - `@MinRole('MODERATOR')` exige un rôle minimal (USER < MODERATOR < ADMIN) ;
  - `@CurrentUser()` injecte `{ id, role }` ;
  - access token JWT HS256 (15 min), refresh token opaque (30 j) dont seule
    l'empreinte SHA-256 est stockée, rotation à chaque `/auth/refresh` ;
  - réutilisation d'un ancien refresh token = révocation de toute la session.
    Le client mobile doit donc **sérialiser** ses rafraîchissements (une seule
    requête `/auth/refresh` à la fois).
- **Limitation des requêtes** : guard maison `@RateLimit()` (`src/common/rate-limit/`),
  fenêtre fixe en mémoire, 429 + `Retry-After`. Compte **par utilisateur** s'il est
  connecté (les opérateurs mobiles partagent des IP entre abonnés : CGNAT), sinon
  par IP. Il s'exécute APRÈS `JwtAuthGuard` : garder `AuthModule` avant
  `RateLimitModule` dans `AppModule`. À passer sur Redis s'il y a plusieurs instances.
- Routes `@Public()` : un jeton valide est quand même lu (sans jamais refuser) →
  `@CurrentUser() user?: AuthenticatedUser` peut être défini (ex. « mon vote »).
- Corps de requête validés par `ZodValidationPipe` avec les schémas de
  `@buslive/shared` ; documentés dans Swagger via `zodToOpenApi()`.
- **Tests e2e** : base séparée `<nom>_test` (dérivée de `DATABASE_URL`), créée et
  migrée automatiquement par `test/global-setup.cjs`. `resetDatabase()` refuse de
  vider une base qui ne finit pas par `_test`. Nouvelle table → l'ajouter au
  `TRUNCATE` de `test/utils.ts`.
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
pnpm dev:mobile       # app mobile (Expo, QR code pour Expo Go)
pnpm --filter @buslive/api prisma:migrate   # créer / appliquer une migration
pnpm --filter @buslive/api db:seed          # gouvernorats + réseau de démonstration
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
