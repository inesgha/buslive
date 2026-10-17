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

## Couverture géographique

- La table `Governorate` (phase 3) aura un champ `isActive`. Les 24
  gouvernorats existent en base, et seuls ceux qui sont activés apparaissent dans
  l'app.
- Lancement : gouvernorat de Mahdia (Mahdia, Ksour Essef). Ouvrir une nouvelle
  région revient à importer ses lignes et arrêts, puis à l'activer. Aucun code à
  modifier.

## Hors ligne (phases 4–5)

Les horaires théoriques des lignes favorites sont mis en cache sur le téléphone.
Sans réseau, l'app affiche les horaires et masque les données en direct.

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
