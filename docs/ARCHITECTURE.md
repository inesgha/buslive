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

## Le flux « Je suis dans le bus » (phase 6)

1. Le passager confirme la ligne et le sens. L'app envoie sa position GPS à
   intervalle régulier (aussi en arrière-plan).
2. L'API valide la position : schéma zod, point situé en Tunisie, vitesse
   plausible, proximité du tracé de la ligne.
3. Si plusieurs passagers sont dans le même bus, leurs positions sont fusionnées
   en une seule « position du bus », pondérée par leur niveau de confiance.
4. La position est diffusée dans la room de la ligne. Les alertes « bus qui
   approche » sont calculées par rapport aux arrêts favoris.

## Confiance et modération (phases 7 et 10)

- Chaque signalement (`NOT_CAME`, `PASSED`, `FULL`, `DELAYED`, `BREAKDOWN`,
  `STOP_MOVED`) peut être confirmé ou contredit par d'autres passagers.
- Un signalement confirmé rapporte des points à son auteur. Un signalement
  contredit en fait perdre. Le score pèse sur la visibilité des futurs
  signalements.
- Les lignes et arrêts proposés par les utilisateurs restent « en attente »
  jusqu'à leur validation par la communauté ou par un modérateur.

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

## Hors ligne (phases 4–5)

- `GET /lines/:id` renvoie tout ce qu'il faut pour calculer les horaires d'une
  ligne : départs, calendriers et temps de trajet entre arrêts.
- L'app met ce détail en cache pour les lignes favorites, et calcule les
  horaires avec les mêmes fonctions que l'API (`@buslive/shared/schedule.ts`).
- Sans réseau, l'app affiche les horaires théoriques et masque les données en
  direct.

## Paiements (plus tard, rien n'est codé)

Place réservée pour les tickets et abonnements en ligne :

- un module `payments` dans `apps/api`, avec une interface commune
  `PaymentProvider` et une implémentation par prestataire (Konnect, Flouci,
  Paymee). Le reste de l'API ne dépend que de l'interface ;
- des tables séparées (`Ticket`, `Subscription`, `Payment`) qui n'affecteront
  pas le modèle des lignes et des arrêts ;
- les clés des prestataires, uniquement dans les variables d'environnement.

## Environnements

| Environnement | Base de données       | Secrets                          |
| ------------- | --------------------- | -------------------------------- |
| Local         | Docker Compose (`db`) | `.env` (copie de `.env.example`) |
| Production    | à définir en phase 11 | variables de l'hébergeur         |
