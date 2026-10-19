# Architecture de BusLive

Vue d'ensemble du système. Ce document évolue avec les phases : il décrit la
cible, et précise ce qui existe déjà.

## Les briques

```
 ┌──────────────┐      HTTP (REST)       ┌──────────────────────┐
 │  apps/mobile │ ─────────────────────▶ │       apps/api       │
 │ (Expo / RN)  │ ◀──── Socket.io ─────▶ │  NestJS + Socket.io  │
 └──────────────┘                        │                      │
                                         │   Prisma (ORM)       │
 ┌──────────────┐      HTTP (REST)       │        │             │
 │  apps/admin  │ ─────────────────────▶ │        ▼             │
 │ (React/Vite) │                        │ PostgreSQL + PostGIS │
 └──────────────┘                        └──────────┬───────────┘
                                                    │
        packages/shared : types + schémas zod       ▼
        utilisés par les trois apps        Firebase Cloud Messaging
                                           (notifications push)
```

- **Une seule source de vérité pour les formats** : les schémas zod de
  `packages/shared` valident les données côté API et typent les appels côté
  mobile et admin. Un changement de format casse la compilation partout où il
  faut l'adapter, au lieu de casser en production.
- **PostGIS** stocke les positions en `geography(Point, 4326)`. Il fait les
  calculs de distance (« arrêts à moins de 500 m ») et de proximité (« le bus
  approche de l'arrêt »).
- **Socket.io** diffuse les positions en direct. Chaque ligne a sa « room », et
  un client ne reçoit que les lignes qu'il regarde.

## Comptes et authentification (phase 2, en place)

- **Sans compte**, on consulte la carte, les lignes et les horaires. **Avec un
  compte**, on partage sa position, on signale, on gère ses favoris et ses
  alertes.
- Identifiant : email + mot de passe, haché avec argon2id. Un champ `phone`
  (+216) est réservé à une future connexion par SMS.
- **Deux jetons** :
  - un access token JWT court (15 min), vérifié sans accès à la base ;
  - un refresh token opaque (30 j), révocable, dont seule l'empreinte est
    stockée.
- **Rotation** à chaque rafraîchissement. Si un ancien jeton est présenté à
  nouveau, toute la session est révoquée.
- **Sécurisé par défaut** : toutes les routes exigent un jeton, sauf celles
  marquées `@Public()`. Les rôles USER < MODERATOR < ADMIN préparent la
  modération.
- `/auth/login` et `/auth/register` sont limités en nombre de tentatives par
  adresse IP. Les compteurs sont en mémoire pour l'instant, et passeront sur
  Redis s'il y a plusieurs instances.

## Le flux « Je suis dans le bus » (phase 6, en place)

```
 téléphone du passager                 API                         autres passagers
 ─────────────────────                 ───                         ────────────────
 tâche GPS (arrière-plan) ──REST──▶ vérifie chaque position ──Socket.io──▶ carte : bus en direct
   lots de positions             (précision, vitesse, tracé)     « vehicles » par ligne
                                 projette sur le tracé
                                 regroupe les passagers en bus
                                 → progression en minutes ──────▶ « En direct · 4 min »
```

1. Le passager connecté choisit sa ligne et son sens. Selon le cas, l'app
   envoie ses positions par lots depuis une tâche d'arrière-plan (build EAS),
   ou seulement quand elle est ouverte (Expo Go).
2. L'API vérifie chaque position : précision, Tunisie, vitesse plausible,
   distance au tracé et intervalle minimal.
3. La position est projetée sur le tracé, puis convertie en « minutes depuis le
   terminus » grâce aux temps de trajet entre arrêts. Le temps d'arrivée à un
   arrêt vaut alors : temps de l'arrêt − progression du bus.
4. Les passagers proches sur le même sens forment un seul bus. Le score de
   confiance (phase 7) pondérera leurs positions.
5. Les bus sont diffusés par Socket.io dans la room de la ligne, au plus toutes
   les 3 s, et de façon anonyme.
6. **Vie privée** : le registre est en mémoire. La base ne garde que la session
   et sa dernière position.
7. Les mêmes calculs servent aux passages observés (phase 7) et aux alertes
   « bus qui approche » (phase 8, événement interne `vehiclesUpdated`).

## Signalements et confiance (phase 7, en place ; modération en phase 10)

```
 signalement (poids de l'auteur) ──┐
 votes des passagers (leur poids) ─┼─▶ poids « pour » ≥ 3        → CONFIRMÉ (+10 auteur)
 preuve automatique (poids 3) ─────┘   « contre » ≥ « pour » + 2 → DÉMENTI  (−15 auteur)
   (bus en direct passé à l'arrêt)     sinon, à l'échéance       → EXPIRÉ   (0)
```

- **Types** : pas venu, bus passé, plein, retard, panne, arrêt déplacé. Il n'y a
  pas de texte libre.
- **Poids d'un avis** : 1 + score/50, entre 0,25 et 3. Un expert peut confirmer
  seul ; un nouvel utilisateur non.
- **Points** : +10 pour un signalement confirmé, −15 pour un démenti, +2 pour
  un vote juste, −3 pour un vote contredit, +2 pour un partage mené à bien
  (3 fois par jour au plus). L'historique est dans `trust_events`.
- **Contre les abus** :
  - 10 signalements par heure au plus ;
  - les doublons sont fusionnés en confirmations ;
  - les signalements d'un auteur au score < −50 restent cachés tant qu'ils ne
    sont pas confirmés ;
  - les limites de débit comptent par utilisateur connecté (à cause du CGNAT
    des opérateurs mobiles).
- **Preuves automatiques** : chaque passage d'un bus en direct à un arrêt est
  enregistré, de façon anonyme (`stop_passage_observations`), avec l'horaire
  prévu le plus proche et le retard. Il dément les « pas venu » et confirme les
  « bus passé » du même arrêt.
- **Statistiques par ligne** (30 jours) : ponctualité (± 3 min), retard moyen,
  « pas venu » confirmés. Aucun pourcentage n'est affiché sous 10 passages
  observés.
- **Diffusion** : les signalements passent par Socket.io (`reports`), dans la
  room de la ligne.
- **Modération (phase 10)** : les « arrêts déplacés » confirmés, ainsi que les
  lignes et arrêts proposés par les utilisateurs, seront validés par un
  modérateur.

## Favoris, alertes et notifications push (phase 8, en place)

```
 bus en direct (vehiclesUpdated) ──┐                        ┌─▶ historique (notifications)
                                   ├─▶ moteur d'alertes ────┤
 signalement tranché ──────────────┘   (règles partagées)   └─▶ PushSender ─▶ FCM ─▶ téléphone
 (reportResolved)                      anti-doublon en base       (log en dev, memory en test)
```

- **Favoris** : lignes et arrêts, liés au compte (retrouvés sur un autre
  téléphone), gardés dans le cache hors ligne et effacés à la déconnexion.
- **Alerte « mon trajet »** : une ligne, un sens, un arrêt, des jours et une
  plage horaire (heure de Tunis). Elle déclenche :
  - **« Bus qui approche »** : un bus **en direct** arrivera à l'arrêt dans le
    délai choisi (5, 10 ou 15 min). Jamais à partir des horaires théoriques,
    trop peu fiables. Au plus une notification par alerte toutes les 30 min ;
  - **« Perturbation »** : un signalement **confirmé** touche le trajet (pas
    venu, retard, panne sur le sens ; bus passé ou arrêt déplacé à l'arrêt).
    Elle compte dès 60 min avant le début de la plage. L'auteur et les votants,
    déjà au courant, ne la reçoivent pas.
- **Résultat de mes signalements** : confirmé (+10) ou démenti (−15), si
  l'utilisateur le souhaite (`users.notify_report_outcome`).
- **Une seule notification par événement et par personne** : contrainte unique
  `(user_id, dedupe_key)` en base, sûre même si deux déclenchements arrivent en
  même temps.
- **Textes** : écrits une seule fois dans `@buslive/shared`
  (`renderNotification`), en français et en arabe. L'API les envoie dans la
  langue du compte ; l'app les réutilise pour l'historique.
- **Envoi** : FCM directement (firebase-admin), derrière l'interface
  `PushSender`. Un jeton refusé par FCM est supprimé. Un iPhone demandera une
  version APNs (non faite : le lancement vise Android).
- **Limites connues** : envoi direct depuis l'API, sans file d'attente, et cache
  des alertes en mémoire (une instance). Avec beaucoup d'utilisateurs ou
  plusieurs instances : file d'attente et Redis (phase 11).
- **Nettoyage** : historique gardé 30 jours ; un téléphone muet depuis 60 jours
  est oublié ; 5 téléphones au plus par compte.

## Alternatives et « Partager mon trajet » (phase 9, en place)

**Louages** : données de référence (stations, destinations, prix en millimes,
horaires), en lecture publique et gardées hors ligne. Les stations proches sont
trouvées par PostGIS, comme les arrêts. Elles seront modérées en phase 10.

**Covoiturage** :

```
 conducteur : publie (sans texte libre) ──▶ passager : demande N places
                                            │
 conducteur : accepte / refuse ◀────────────┘   (notification « rides »)
     │ accepte (transaction + FOR UPDATE : jamais plus de places que prévu)
     ▼
 les DEUX numéros sont échangés, et seulement entre eux deux
```

- Un téléphone tunisien est exigé, et un score de confiance au moins égal à −50.
- Garde-fous : 3 trajets en cours par conducteur, 10 demandes par jour et par
  passager, départ entre 10 min et 7 jours, un refus définitif pour ce trajet,
  signalement des annonces (traité en phase 10).
- Aucun paiement : la participation se règle de la main à la main. Le futur
  module de paiement reste séparé.

**Partager mon trajet** :

```
 passager (partage en cours) ── POST /trips ──▶ jeton secret (empreinte SHA-256 en base)
         │ feuille de partage (WhatsApp, SMS…)
         ▼
 proche : /t/<jeton> (page web, sans app) ── toutes les 10 s ──▶ GET /api/v1/trips/<jeton>
                                                               avancée du bus, arrivée estimée
```

- La page n'affiche **ni nom, ni téléphone, ni positions** : seulement la ligne,
  les arrêts et l'avancée du bus, qui est de toute façon publique et anonyme.
- L'arrivée est détectée grâce à l'événement interne `stopPassed`, qui porte
  maintenant l'identifiant du partage. Cet identifiant n'est jamais stocké avec
  les passages observés.
- Le lien expire 3 h après sa création, ou 15 min après la fin du partage, et
  peut être désactivé. Un lien inconnu, désactivé ou expiré donne toujours la
  même erreur 404.
- La page ne charge aucune ressource extérieure (ni carte ni police) : l'adresse
  IP du destinataire n'est envoyée à personne d'autre que BusLive.

## Tableau de bord et modération (phase 10, en place)

```
 passagers ──▶ signalements contestés, « arrêts déplacés », arrêts proposés, covoiturages signalés
                                 │
                                 ▼  files de modération (tableau de bord)
 modérateur (apps/admin) ── décision ──▶ API /admin/… ──▶ action + journal (même transaction)
                                                          points, notifications, suspension
```

- **Rôles** : USER < MODERATOR < ADMIN. Les modérateurs traitent les files ;
  les administrateurs gèrent aussi les rôles et le réseau (gouvernorats,
  arrêts, louages). L'API vérifie le rôle sur chaque route ; l'interface ne
  fait que masquer ce qui n'est pas permis.
- **Session web** : le refresh token est dans un cookie `HttpOnly`,
  `SameSite=Strict`, limité à `/api/v1/auth/web`. L'origine des requêtes de
  session est vérifiée (CSRF), et seul un modérateur obtient une session. Les
  routes de l'app mobile n'ont pas changé.
- **Journal de modération** : en ajout seul (un trigger PostgreSQL refuse toute
  modification ou suppression). Il garde les valeurs avant et après.
- **Suspension** : connexion refusée et sessions révoquées. Un modérateur ne
  peut agir que sur un compte de rôle inférieur au sien.
- **Arrêts proposés** : créés avec le statut `PENDING`, donc invisibles (filtres
  `VISIBLE_*`). Il faut être sur place pour en proposer un (contrôle fait par
  l'app), à 30 m au moins d'un arrêt existant, dans une zone couverte. Un arrêt
  approuvé rapporte +5 points au proposant. Les lignes indiquées par le
  passager restent une **indication** : rattacher un arrêt au parcours d'une
  ligne viendra avec l'import GTFS (phase 11).
- **Limites connues** :
  - le changement de rôle et la suspension prennent pleinement effet à
    l'expiration de l'access token en cours (15 min au plus) ;
  - le cache des parcours (10 min) peut garder l'ancienne position d'un arrêt
    déplacé quelques minutes.

## Modèle du réseau (phase 3, en place)

Le modèle est inspiré de GTFS, le format standard des réseaux de transport, en
plus simple :

```
Governorate ──< Locality
     └──< Line ──< LineDirection ──< LineStop >── Stop (point PostGIS)
           │            │ (tracé PostGIS)
        Operator        └──< Departure >── ServiceCalendar
```

- **Horaires** : on stocke seulement les départs du terminus, en minutes depuis
  minuit. L'heure à un arrêt vaut l'heure de départ plus le temps de trajet
  (`LineStop.minutesFromStart`). C'est beaucoup moins de données à saisir et à
  vérifier, et le temps réel corrigera les écarts.
- **Calendriers** : chacun définit des jours de la semaine, une période de
  validité facultative et une priorité. Un calendrier spécial, par exemple le
  Ramadan (priorité 10), remplace les horaires normaux pour les lignes qui en
  ont.
- **Positions** : latitude et longitude dans des colonnes normales, et un point
  PostGIS `stops.location` calculé par un trigger, avec un index spatial GIST.
- **Statuts** : les lignes et les arrêts ont un statut (`PENDING`, `ACTIVE`,
  `REJECTED` ou `ARCHIVED`) et un champ `proposedById`, déjà prêts pour les
  propositions des utilisateurs. L'API publique ne montre que les éléments
  `ACTIVE`.
- **Langues** : tous les noms existent en français et en arabe (`nameFr`,
  `nameAr`).

## Couverture géographique

- Les 24 gouvernorats existent en base, avec leurs codes ISO 3166-2 (`TN-53`
  pour Mahdia). Seuls ceux qui ont `isActive = true` apparaissent dans l'app,
  avec leurs lignes et leurs arrêts.
- Lancement : gouvernorat de Mahdia (Mahdia, Ksour Essef). Ouvrir une nouvelle
  région revient à importer ses lignes et arrêts, puis à l'activer. Aucun code à
  modifier.

## Application mobile (phase 4, en place)

- **Socle** : Expo SDK 58 et expo-router. La barre d'onglets comprend Carte,
  Lignes, Signaler (bouton central), Alertes et Profil.
- **Thème** clair et sombre, tiré de la maquette. Les couleurs passent toutes
  par des jetons dont le contraste est testé, et la police est Readex Pro.
- **Langues** : français et arabe, avec le RTL natif (`I18nManager`). Changer
  de sens d'écriture redémarre l'app.
- **Session** :
  - le refresh token est stocké dans le coffre-fort du téléphone
    (`expo-secure-store`), l'access token seulement en mémoire ;
  - une seule requête `/auth/refresh` à la fois, à cause de la rotation des
    jetons côté API ;
  - le profil est mis en cache pour l'affichage hors ligne.
- **Données** : TanStack Query gère le chargement et le cache. Chaque réponse
  est validée avec les schémas zod de `@buslive/shared`.

## Carte et prochains passages (phase 5, en place)

- `GET /stops/nearby` : PostGIS cherche les arrêts dans un rayon (`ST_DWithin`)
  et les trie par distance (`<->`), avec l'index GIST. La position envoyée n'est
  pas stockée.
- `GET /stops/:id/departures` : prochains passages sur 24 h, calculés par
  `upcomingPassages` (`@buslive/shared`) en heure de Tunis (`tunisClock`). Le
  calcul gère le calendrier du jour, le Ramadan et les bus après minuit.
- Les passages sont renvoyés en **heures absolues** (journée de service + minutes).
  L'app calcule le compte à rebours, qui reste donc juste depuis le cache.
- Le champ `live` de chaque passage est réservé au temps réel (phase 6).

## Hors ligne (phases 4–5, en place)

- `GET /lines/:id` renvoie tout ce qu'il faut pour calculer les horaires d'une
  ligne : départs, calendriers et temps de trajet entre arrêts.
- L'app sauvegarde son cache 24 h sur le téléphone (TanStack Query + AsyncStorage) :
  lignes, détails des lignes, arrêts proches et prochains passages. Les seules
  données personnelles sauvegardées sont les favoris et les alertes (phase 8),
  effacées à la déconnexion.
- Le détail d'une ligne calcule ses horaires sur le téléphone, avec les mêmes
  fonctions que l'API.
- Sans réseau, un bandeau « Hors ligne — horaires théoriques » s'affiche. Les
  données en direct (phase 6) seront alors masquées.

## Paiements (plus tard, rien n'est codé)

Place réservée pour les tickets et abonnements en ligne :

- un module `payments` dans `apps/api`, avec une interface commune
  `PaymentProvider` et une implémentation par prestataire (Konnect, Flouci,
  Paymee). Le reste de l'API ne dépend que de l'interface ;
- des tables séparées (`Ticket`, `Subscription`, `Payment`) qui n'affecteront
  pas le modèle des lignes et des arrêts ;
- les clés des prestataires, uniquement dans les variables d'environnement.

## Environnements

| Environnement | Base de données                          | Secrets                                                      |
| ------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Local         | Docker Compose (`db`)                    | `.env` (copie de `.env.example`)                             |
| CI            | service PostGIS jetable (GitHub Actions) | aucun (valeurs de test)                                      |
| Production    | VPS, Docker Compose (`deploy/`)          | `deploy/.env.production` et `deploy/secrets/` sur le serveur |

## Production (phase 11, en place)

```
Internet ──443──▶ Caddy ──┬─ /api/*, /socket.io/*, /t/*, /legal/* ──▶ api ──▶ db (PostGIS)
                          └─ /admin/* (fichiers statiques)            backup (pg_dump quotidien)
```

- **Un seul domaine** : l'admin (cookie `SameSite=Strict`), les liens de suivi
  `/t/…` et les pages légales `/legal/…` partagent le domaine de l'API.
- **Une seule instance de l'API** : le registre des bus en direct, la limitation
  des requêtes et le cache des alertes sont en mémoire. Plusieurs instances
  demanderont Redis (voir `docs/SECURITE.md`).
- Les migrations sont appliquées par un service `migrate` avant chaque
  démarrage de l'API. Journaux en JSON (`LOG_FORMAT=json`), sans IP ni corps.
- **Vie privée** : durées de conservation `RETENTION_RULES`
  (`@buslive/shared/privacy.ts`), purge quotidienne ; suppression de compte
  `DELETE /me` (signalements et votes gardés anonymes) ; politique de
  confidentialité servie par l'API (`/legal/privacy`).
- **Données réelles** : import GTFS (`pnpm --filter @buslive/api gtfs:import`,
  voir `docs/gtfs/README.md`), idempotent, avec essai à blanc par défaut.

Détails : [DEPLOIEMENT.md](DEPLOIEMENT.md) et [SECURITE.md](SECURITE.md).
