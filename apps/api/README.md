# @buslive/api

API BusLive : NestJS 12, Prisma 7, PostgreSQL + PostGIS (Socket.io en phase 6).

## Démarrer

```bash
# depuis la racine du monorepo
cp apps/api/.env.example apps/api/.env      # puis adapter DATABASE_URL et JWT_ACCESS_SECRET
pnpm db:up                                  # base Docker
pnpm --filter @buslive/api prisma:deploy    # appliquer les migrations
pnpm --filter @buslive/api db:seed          # gouvernorats + réseau de démonstration
pnpm dev:api                                # API + rechargement automatique
```

| URL                                             | Rôle                                    |
| ----------------------------------------------- | --------------------------------------- |
| `GET http://localhost:3000/api/v1/health`       | Liveness : le processus répond          |
| `GET http://localhost:3000/api/v1/health/ready` | Readiness : base + PostGIS (503 sinon)  |
| `http://localhost:3000/api/docs`                | Documentation Swagger (hors production) |

## Réseau (lecture publique)

| Route                                               | Rôle                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/v1/governorates`                          | Gouvernorats ouverts dans l'app                             |
| `GET /api/v1/lines?governorate=TN-53`               | Lignes actives (filtre facultatif par gouvernorat)          |
| `GET /api/v1/lines/:id`                             | Détail : sens, arrêts ordonnés, tracé, départs, calendriers |
| `GET /api/v1/stops/nearby?lat=&lng=&radius=&limit=` | Arrêts proches, du plus proche au plus loin (rayon ≤ 3 km)  |
| `GET /api/v1/stops/:id/departures?at=&limit=`       | Prochains passages (24 h, heure de Tunis)                   |
| `GET /api/v1/stops/:id`                             | Arrêt et lignes qui le desservent                           |

Seuls les éléments **validés** (`ACTIVE`) d'un gouvernorat **activé** sont
renvoyés. Le détail d'une ligne contient tout ce qu'il faut pour calculer les
horaires sans réseau, avec les fonctions de `@buslive/shared` :

```ts
departuresForDate(direction.departures, line.calendars, '2026-10-19'); // départs du jour
passingMinutes(departure, stop.minutesFromStart); // heure à un arrêt
upcomingPassages(sources, calendars, tunisClock()); // prochains passages (minuit compris)
```

Les prochains passages sont renvoyés en **heures absolues** (`serviceDate` +
`passingMinutes`) : l'app calcule « dans 5 min » elle-même, ce qui reste juste
depuis le cache hors ligne. Le paramètre `at` (instant ISO 8601) sert aux tests.

### Données (seed)

- `prisma/seed/data/governorates.ts` : les 24 gouvernorats (données réelles).
- `prisma/seed/data/mahdia-demo.ts` : **données de test inventées** (lignes,
  horaires ; coordonnées approximatives). À remplacer par des données vérifiées,
  puis relancer `db:seed`. Le seed est idempotent (relançable sans doublons).

### Modèle

```
Governorate ──< Locality
     └──< Line ──< LineDirection ──< LineStop >── Stop (point PostGIS)
                        └──< Departure >── ServiceCalendar
```

Un horaire = un départ du terminus (minutes depuis minuit) + un calendrier
(jours, période, priorité). L'heure à chaque arrêt = départ + `minutesFromStart`.

## Temps réel (« Je suis dans le bus »)

| Route / événement                             | Accès    | Rôle                                           |
| --------------------------------------------- | -------- | ---------------------------------------------- |
| `POST /api/v1/live/sessions`                  | connecté | Commencer à partager `{ lineId, directionId }` |
| `POST /api/v1/live/sessions/:id/positions`    | connecté | Lot de positions (20 au plus)                  |
| `DELETE /api/v1/live/sessions/:id`            | connecté | Arrêter le partage                             |
| `GET /api/v1/live/lines/:id/vehicles`         | public   | Bus en direct d'une ligne                      |
| Socket.io `/live` : `watch:line` → `vehicles` | public   | Suivre les bus d'une ligne en temps réel       |

- Chaque position est vérifiée (`LIVE_RULES` dans `@buslive/shared`) : précision,
  Tunisie, vitesse plausible, distance au tracé, intervalle minimal.
- Les passagers proches sur le même sens forment **un seul bus** (position
  moyenne). Les bus sont anonymes.
- **Vie privée** : les positions restent en mémoire ; la base ne garde que la
  session et sa dernière position (pas de trajet).
- Le partage s'arrête seul : terminus, 10 min sans position, 3 h au maximum.
- Les arrivées en direct à un arrêt sont dans `liveArrivals` de
  `GET /stops/:id/departures`.

## Signalements, confiance et statistiques

| Route                            | Accès    | Rôle                                                   |
| -------------------------------- | -------- | ------------------------------------------------------ |
| `POST /api/v1/reports`           | connecté | Signaler (contrôles selon le type, doublons fusionnés) |
| `POST /api/v1/reports/:id/votes` | connecté | Confirmer / contredire (`CONFIRM` / `DENY`)            |
| `GET /api/v1/lines/:id/reports`  | public*  | Signalements en cours d'une ligne                      |
| `GET /api/v1/lines/:id/stats`    | public   | Statistiques sur 30 jours                              |
| `GET /api/v1/me/trust`           | connecté | Score, niveau, historique des points                   |
| Socket.io `/live` : `reports`    | public   | Nouveau signalement / changement de statut             |

\* Avec un jeton, la réponse indique « mon signalement » et « mon vote ».

- Règles chiffrées : `TRUST_RULES` dans `@buslive/shared` (poids, seuils, points).
- Les points ne sont versés que par `TrustService.award` (transaction + historique).
- Un passage de bus en direct à un arrêt est enregistré (anonyme) et sert de
  preuve automatique : il dément les « pas venu », confirme les « bus passé ».

## Favoris, alertes et notifications (phase 8)

| Route                                           | Accès    | Rôle                                                          |
| ----------------------------------------------- | -------- | ------------------------------------------------------------- |
| `GET /api/v1/me/favorites`                      | connecté | Mes lignes et arrêts favoris                                  |
| `PUT` / `DELETE /api/v1/me/favorites/lines/:id` | connecté | Ajouter / retirer une ligne (idempotent, 204)                 |
| `PUT` / `DELETE /api/v1/me/favorites/stops/:id` | connecté | Ajouter / retirer un arrêt (idempotent, 204)                  |
| `GET` / `POST /api/v1/me/alerts`                | connecté | Mes alertes / en créer une (10 au plus)                       |
| `PUT` / `DELETE /api/v1/me/alerts/:id`          | connecté | Modifier (y compris activer ou couper) / supprimer            |
| `POST /api/v1/me/push-devices`                  | connecté | Enregistrer le jeton FCM du téléphone (à chaque démarrage)    |
| `POST /api/v1/me/push-devices/unregister`       | connecté | Retirer ce téléphone (déconnexion)                            |
| `GET /api/v1/me/notifications`                  | connecté | Historique (30 jours) et nombre de non lues                   |
| `POST /api/v1/me/notifications/read`            | connecté | Marquer comme lues (toutes, sans `ids`)                       |
| `POST /api/v1/me/notifications/test`            | connecté | Notification d'essai (3 par minute au plus)                   |
| `PATCH /api/v1/me`                              | connecté | Langue du compte, préférence « résultat de mes signalements » |

- **Moteur d'alertes** (`src/notifications/alert-engine.service.ts`) :
  - il écoute `vehiclesUpdated` (bus en direct, au rythme de la diffusion
    Socket.io) et `reportResolved` (signalement confirmé ou démenti) ;
  - les règles sont des fonctions pures de `@buslive/shared` (`alerts.ts`) ;
  - **anti-spam** : au plus une notification « bus qui approche » par alerte
    toutes les 30 min (mise à jour conditionnelle de `alerts.last_approach_at`),
    et une seule notification par signalement et par personne (clé unique
    `notifications.dedupe_key`).
- **Envoi** : interface `PushSender`, choisie par `PUSH_PROVIDER` :
  - `log` (par défaut) : la notification est écrite dans la console, **sans
    Firebase** ;
  - `fcm` : envoi réel par Firebase Cloud Messaging, avec la clé du compte de
    service indiquée par `GOOGLE_APPLICATION_CREDENTIALS` (firebase-admin n'est
    chargé qu'à ce moment-là) ;
  - `memory` : tests automatiques.

  Un jeton refusé définitivement par FCM est supprimé.

- Les textes des notifications (fr / ar) viennent de `renderNotification`
  (`@buslive/shared`), dans la langue du compte.

## Admin et modération (phase 10)

| Route                                                     | Rôle      | Effet                                                        |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| `POST /api/v1/auth/web/login` · `refresh` · `logout`      | public    | Session web : refresh token en cookie httpOnly               |
| `GET /api/v1/admin/dashboard`                             | MODERATOR | Chiffres clés et files de modération                         |
| `GET /admin/reports` · `POST /admin/reports/:id/decision` | MODERATOR | Lister ; confirmer, démentir ou masquer                      |
| `GET /admin/stop-moves` · `POST …/:reportId/decision`     | MODERATOR | « Arrêts déplacés » : appliquer ou classer                   |
| `GET /admin/stop-proposals` · `POST …/:id/decision`       | MODERATOR | Arrêts proposés : approuver (corrections) ou refuser         |
| `GET /admin/ride-flags` · `POST …/:offerId/decision`      | MODERATOR | Covoiturage signalé : annuler ou classer                     |
| `GET /admin/users` · `POST /admin/users/:id/suspension`   | MODERATOR | Rechercher ; suspendre ou réactiver                          |
| `PUT /admin/users/:id/role`                               | ADMIN     | Changer un rôle (jamais le sien)                             |
| `GET`/`PATCH /admin/governorates/:code`                   | ADMIN     | Ouvrir ou fermer un gouvernorat                              |
| `GET /admin/stops` · `PATCH /admin/stops/:id`             | ADMIN     | Rechercher, corriger un arrêt                                |
| `GET`/`POST`/`PUT`/`DELETE /admin/louage-stations`        | ADMIN     | Stations de louage et tarifs (archivage, pas de suppression) |
| `GET /admin/moderation-log`                               | MODERATOR | Journal des actions                                          |
| `POST /api/v1/stops/proposals` · `GET /me/stop-proposals` | connecté  | Proposer un arrêt (app mobile) ; mes propositions            |

- **Rôles** : `@MinRole('MODERATOR')` sur le contrôleur, `@MinRole('ADMIN')` sur
  les routes sensibles. Un modérateur ne peut suspendre qu'un compte de rôle
  **inférieur** au sien.
- **Journal** (`moderation_actions`) : chaque action y est écrite, dans la même
  transaction quand c'est possible. Un trigger PostgreSQL refuse toute
  modification ou suppression.
- **Suspension** : connexion refusée (403), toutes les sessions révoquées ; les
  access tokens en cours expirent d'eux-mêmes (15 min au plus).
- **Décision sur un signalement** : même chemin que les votes (`finalize`) :
  points versés une seule fois.
- **Premier administrateur** : `pnpm --filter @buslive/api user:role <email> ADMIN`.

## Alternatives et « Partager mon trajet » (phase 9)

| Route                                          | Accès          | Rôle                                                        |
| ---------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `GET /api/v1/localities`                       | public         | Localités (départs et destinations)                         |
| `GET /api/v1/louage/stations/nearby`           | public         | Stations de louage proches (`lat`, `lng`, `radius`, `to`)   |
| `GET /api/v1/rides`                            | connecté       | Trajets de covoiturage des 7 prochains jours (`from`, `to`) |
| `POST /api/v1/rides`                           | connecté       | Proposer un trajet (téléphone requis, 3 en cours au plus)   |
| `GET /api/v1/rides/:id`                        | connecté       | Détail (demandes visibles du seul conducteur)               |
| `POST /api/v1/rides/:id/cancel`                | conducteur     | Annuler (les passagers sont prévenus)                       |
| `POST /api/v1/rides/:id/requests`              | connecté       | Demander des places (10 demandes par jour au plus)          |
| `DELETE /api/v1/rides/:id/requests/mine`       | passager       | Annuler ma demande                                          |
| `POST /api/v1/rides/:id/requests/:rid/accept`  | conducteur     | Accepter (verrou `FOR UPDATE` : jamais trop de places)      |
| `POST /api/v1/rides/:id/requests/:rid/decline` | conducteur     | Refuser                                                     |
| `POST /api/v1/rides/:id/flags`                 | connecté       | Signaler un trajet (modération en phase 10)                 |
| `GET /api/v1/me/rides`                         | connecté       | Mes trajets proposés et mes demandes                        |
| `POST /api/v1/trips`                           | connecté       | Lien de suivi pour mon partage en cours                     |
| `GET /api/v1/me/trips` / `DELETE /trips/:id`   | connecté       | Mes liens actifs / désactiver un lien                       |
| `GET /api/v1/trips/:token`                     | public, limité | État public du trajet (aucune donnée personnelle)           |
| `GET /t/:token`                                | public         | Page web de suivi (hors du préfixe `/api/v1`)               |

- **Confidentialité du covoiturage** : les numéros ne sont échangés qu'après
  acceptation, et seulement entre le conducteur et ce passager. La règle est
  appliquée à UN seul endroit, `src/rides/rides.mapper.ts`, et vérifiée par
  les tests e2e.
- **Liens de suivi** : jeton aléatoire de 24 octets, dont seule l'empreinte
  SHA-256 est stockée. Le lien expire 3 h après sa création, ou 15 min après la
  fin du partage. La page (`src/trips/trip-page.ts`) n'utilise aucun service
  extérieur, et son script est un fichier séparé, à cause de la CSP.
- Les **prix** sont en millimes (`formatMillimes` dans `@buslive/shared`).

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

| Script              | Effet                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `dev`               | Compile avec `tsc-watch` et relance l'API à chaque changement    |
| `build` / `start`   | Compile dans `dist/` / lance la version compilée                 |
| `test`              | Tests unitaires (`src/**/*.test.ts`, sans base)                  |
| `test:e2e`          | Tests de bout en bout (`test/*.e2e-test.ts`, base `_test`)       |
| `test:e2e:coverage` | Tests e2e avec couverture (échoue sous les seuils)               |
| `prisma:migrate`    | Crée et applique une migration, puis régénère le client          |
| `prisma:deploy`     | Applique les migrations existantes (production, CI)              |
| `prisma:generate`   | Régénère le client Prisma (fait aussi par `pnpm install`)        |
| `prisma:studio`     | Interface web pour explorer les données                          |
| `db:seed`           | Insère les gouvernorats et le réseau de démonstration            |
| `user:role`         | Donne un rôle à un compte : `<email> ADMIN` (ou USER, MODERATOR) |
| `gtfs:import`       | Importe un réseau GTFS (essai à blanc, `--apply` pour écrire)    |
| `load:test`         | Test de charge léger (API démarrée, voir `docs/SECURITE.md`)     |

## Organisation

```
src/
  main.ts            démarrage
  setup-app.ts       préfixe /api/v1, helmet, CORS, Swagger (partagé avec les tests e2e)
  app.module.ts      module racine
  config/            validation des variables d'environnement (zod)
  common/            ZodValidationPipe, zodToOpenApi, limitation des requêtes, journaux (JSON)
  prisma/            PrismaService (connexion via @prisma/adapter-pg)
  auth/              inscription, connexion, jetons, guards et décorateurs
  live/              partage de position, registre des bus en direct, Socket.io
  reports/           signalements, votes, confiance, passages observés, statistiques
  favorites/         lignes et arrêts favoris
  alerts/            alertes « mon trajet » (CRUD, cache par ligne pour le moteur)
  notifications/     moteur d'alertes, historique, appareils, envoi push (FCM / console)
  louage/            stations de louage proches et destinations
  rides/             covoiturage (annonces, demandes, acceptation, signalement)
  trips/             « Partager mon trajet » : liens de suivi et page web /t/<jeton>
  proposals/         arrêts proposés par les passagers
  admin/             tableau de bord, modération, comptes, réseau, journal
  account/           suppression du compte (DELETE /me, anonymisation)
  privacy/           durées de conservation (purge quotidienne), pages /legal/…
  gtfs/              lecture et import des fichiers GTFS (fonctions pures + écriture)
  network/           gouvernorats, lignes, arrêts, horaires (lecture)
  users/             accès aux utilisateurs, PATCH /me (langue, préférences)
  health/            routes de santé (Terminus) + indicateur PostGIS
  generated/prisma/  client Prisma généré (ignoré par git)
prisma/
  schema.prisma      schéma de la base
  migrations/        migrations SQL versionnées
  seed/              données initiales (gouvernorats, réseau de démonstration)
test/                tests e2e (base séparée « _test », créée automatiquement)
  load/              test de charge léger
  fixtures/          petit réseau GTFS de test
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
- **Nouvelle table** : l'ajouter au `TRUNCATE` de `test/utils.ts`, et décider de
  sa durée de conservation (`RETENTION_RULES`) et de ce qu'elle devient à la
  suppression d'un compte (`onDelete`).
- **Nouvelle route publique** : l'ajouter à `PUBLIC_ROUTES` dans
  `test/security.e2e-test.ts` (le test vérifie que toute autre route répond 401).
- **Journaux** : `LOG_FORMAT=json` en production (une ligne JSON par événement).
  Ne jamais journaliser de position, de corps de requête ni d'adresse IP.
- **Production** : voir `docs/DEPLOIEMENT.md` (image Docker, migrations au
  démarrage, Caddy) et `docs/SECURITE.md`.
