# @buslive/admin

Tableau de bord BusLive, réservé aux **modérateurs** et aux **administrateurs**
(React 19, Vite, React Router, TanStack Query, Leaflet). Interface en français.

## Lancer

```bash
# depuis la racine du monorepo (l'API doit tourner : pnpm dev:api)
pnpm dev:admin        # http://localhost:5173
```

En développement, Vite transmet `/api/...` à `http://localhost:3000` (voir
`vite.config.ts`). L'admin et l'API ont donc la même origine, et le cookie de
session circule sans configuration supplémentaire.

### Premier administrateur

Personne n'a encore le rôle ADMIN : il faut le donner une fois, en ligne de
commande, à un compte créé dans l'app mobile.

```bash
pnpm --filter @buslive/api user:role ton-email@exemple.tn ADMIN
```

Ensuite, les rôles se changent depuis la page **Comptes** (et les changements
sont écrits au journal).

## Ce qu'on y fait

| Page            | Rôle      | Contenu                                                                  |
| --------------- | --------- | ------------------------------------------------------------------------ |
| Tableau de bord | MODERATOR | Chiffres clés, files à traiter, lignes les plus signalées                |
| Signalements    | MODERATOR | Signalements contestés : confirmer, démentir (points versés), masquer    |
| Arrêts          | MODERATOR | Déplacements confirmés (carte : actuel / proposé), arrêts proposés       |
| Covoiturage     | MODERATOR | Trajets signalés : annuler (passagers prévenus) ou classer               |
| Comptes         | MODERATOR | Recherche, suspension (rôles inférieurs) ; rôles (ADMIN seulement)       |
| Réseau          | ADMIN     | Ouvrir un gouvernorat, corriger un arrêt, stations et tarifs des louages |
| Journal         | MODERATOR | Toutes les actions de modération (non modifiable, même en SQL)           |

## Sécurité

- **Session** : le refresh token est dans un cookie `HttpOnly`, `SameSite=Strict`,
  limité à `/api/v1/auth/web` (illisible par le JavaScript de la page).
  L'access token reste en mémoire ; après un rechargement, la page le redemande
  avec le cookie (`src/api/http.ts`). Une seule requête `/refresh` à la fois.
- L'API refuse la session web à un compte simple, vérifie l'origine des
  requêtes de session (CSRF) et contrôle le rôle sur **chaque** route.
- **CSP** ajoutée à `index.html` au build (`vite.config.ts`) : pas de script
  intégré, images limitées au site et aux tuiles OpenStreetMap.
- Aucune donnée n'est insérée en HTML brut (pas de `dangerouslySetInnerHTML`).
- **En production** (`deploy/`), l'admin est construit avec
  `VITE_BASE_PATH=/admin/` et servi par Caddy sous `https://<domaine>/admin/`,
  sur le même domaine que l'API : le cookie `SameSite=Strict` est bien envoyé.
  L'origine `https://<domaine>` doit être dans `CORS_ORIGINS` de l'API.

## Organisation

```
src/
  main.tsx, App.tsx     démarrage, routes (pages avec carte chargées à la demande)
  api/http.ts           session web (cookie), appels protégés, rafraîchissement unique
  api/admin.ts          routes /admin/… (réponses validées par les schémas de @buslive/shared)
  auth/                 état de la session, contrôle du rôle
  components/           mise en page, carte (Leaflet)
  pages/                un fichier par page
  lib/format.ts         dates (heure de Tunis), prix, libellés
```

## Scripts

| Script      | Effet                                      |
| ----------- | ------------------------------------------ |
| `dev`       | Serveur de développement (Vite)            |
| `build`     | Vérifie les types, puis construit `dist/`  |
| `typecheck` | Vérifie les types                          |
| `test`      | Tests Vitest (client HTTP, formats, pages) |
