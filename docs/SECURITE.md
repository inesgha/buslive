# Sécurité, vie privée et capacité

Audit fait en phase 11 (octobre 2026). À relire avant chaque mise en production
importante. Le déploiement lui-même est décrit dans [DEPLOIEMENT.md](DEPLOIEMENT.md).

## 1. Contrôle d'accès

- **Tout est protégé par défaut** : le guard global `JwtAuthGuard` exige un
  access token, sauf sur les routes marquées `@Public()`.
- Le test `test/security.e2e-test.ts` appelle **chaque route** de la
  documentation Swagger sans jeton. Une route absente de la liste `PUBLIC_ROUTES`
  doit répondre 401, sinon le test échoue. Une nouvelle route publique doit donc
  être ajoutée explicitement à cette liste : c'est voulu.
- Rôles : `@MinRole('MODERATOR' | 'ADMIN')` sur l'admin ; un rôle se change
  seulement en ligne de commande (`user:role`) ou par un administrateur.
- Socket.io (`/live`) est public en lecture seule : il diffuse des bus anonymes,
  jamais d'identifiant de passager (testé).

## 2. Authentification et sessions

| Élément       | Mesure                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| Mots de passe | argon2id (19 Mio, 2 itérations : minimum OWASP), temps constant si email inconnu              |
| Access token  | JWT HS256, 15 min, secret ≥ 32 caractères (refusé en production s'il vaut l'exemple)          |
| Refresh token | Opaque, 30 j, seule l'empreinte SHA-256 est stockée, rotation à chaque usage                  |
| Vol de jeton  | Réutilisation d'un ancien refresh token ⇒ toute la session est révoquée                       |
| Admin web     | Cookie `httpOnly`, `Secure` en production, `SameSite=Strict`, chemin limité, origine vérifiée |
| Mobile        | Refresh token dans le trousseau (`expo-secure-store`), access token en mémoire                |

## 3. Protection de l'API

- **Validation** : chaque corps et chaque paramètre passe par un schéma zod
  (`@buslive/shared`) ; pas de texte libre dans les signalements.
- **SQL** : requêtes Prisma ou `$queryRaw` en gabarit (paramètres liés) ;
  aucun `$queryRawUnsafe` ni `Prisma.raw` dans le code (vérifié).
- **Taille des requêtes** : corps JSON limité à 100 Ko (413 au-delà, testé) ;
  `headersTimeout` 20 s et `requestTimeout` 30 s contre les connexions lentes.
- **En-têtes** : helmet (CSP, nosniff, frame-ancestors…) et HSTS (testés) ;
  Caddy ajoute HSTS, `Referrer-Policy` et `X-Frame-Options: DENY` pour l'admin.
- **CORS** : liste blanche `CORS_ORIGINS`, entièrement en `https://` en production
  (refus de démarrer sinon), appliquée aussi à Socket.io.
- **Limitation des requêtes** (`@RateLimit`) sur la connexion, l'inscription, la
  suppression de compte et toutes les écritures (signalements, partages,
  trajets, propositions…). Comptée par utilisateur connecté, sinon par IP
  (`TRUST_PROXY=1` derrière Caddy, sinon toutes les IP seraient celle du proxy).
- **Limite connue** : les lectures publiques (arrêts, lignes, horaires) ne sont
  pas limitées. Une seule instance tient environ 100 requêtes/s (voir la
  section 7). En cas d'abus, placer un CDN ou un pare-feu applicatif devant
  Caddy (par exemple Cloudflare, offre gratuite), ou ajouter le module
  `caddy-ratelimit`.

## 4. Vie privée

- **Positions** : la position envoyée pour chercher des arrêts n'est jamais
  stockée. Pendant un partage « Je suis dans le bus », seule la **dernière**
  position de la session est gardée, sans historique du trajet.
- **Journaux** : ni IP, ni corps de requête, ni position ; les jetons des liens de
  suivi sont masqués (`/t/***`) ; testé par `logging.test.ts`.
- **Durées de conservation** (`RETENTION_RULES`, `@buslive/shared/privacy.ts`),
  appliquées chaque jour par `RetentionService` (notifications et appareils :
  `NotificationsService`) :

  | Donnée                             | Durée                     |
  | ---------------------------------- | ------------------------- |
  | Dernière position d'un partage     | 7 jours (puis effacée)    |
  | Sessions de partage                | 90 jours                  |
  | Signalements                       | 365 jours après création  |
  | Passages observés (anonymes)       | 400 jours (statistiques)  |
  | Trajets de covoiturage             | 90 jours après le départ  |
  | Refresh tokens expirés ou révoqués | 30 jours                  |
  | Liens « Partager mon trajet »      | 7 jours (+ 3 h de trajet) |
  | Notifications                      | 30 jours                  |
  | Appareils push inactifs            | 60 jours                  |

- **Suppression du compte** (dans l'app : Profil → Supprimer mon compte ; page
  web publique `/legal/account-deletion` exigée par Google Play) : arrêt des
  partages, annulation des trajets proposés (les passagers sont prévenus), puis
  suppression du compte. Les signalements et votes restent **anonymes**
  (auteur à `NULL`) pour ne pas fausser les statistiques. Un modérateur ou un
  administrateur doit d'abord perdre son rôle (409) : le journal de modération
  garde son nom.
- **Politique de confidentialité** : `/legal/privacy` (français et arabe), avec
  les durées ci-dessus tirées du code. Elle doit être **relue par un juriste**
  avant la publication.

## 5. Dépendances

- `pnpm audit` (octobre 2026) : 4 alertes, **toutes dans l'outillage de l'app
  mobile** (CLI d'Expo, jest-expo), qui ne tourne que sur les postes de
  développement : `node-forge` et `uuid` (CLI d'Expo), `braces` et `sprintf-js`
  (Jest). Trois n'ont pas encore de correctif. Aucune ne touche l'API, l'admin
  ni l'app installée sur les téléphones. À revoir à la prochaine version du SDK Expo.
- Dependabot propose chaque semaine les mises à jour mineures (groupées) ; les
  versions figées (voir CLAUDE.md) sont exclues et se mettent à jour à la main.
- Avertissement connu en test : `pg` signale des « client.query() » simultanés.
  Ils viennent de l'interpréteur de requêtes de Prisma 7.10 dans les
  transactions, pas de notre code. Sans effet avec `pg` 8 ; ne pas passer à
  `pg` 9 avant que Prisma le corrige (exclu de Dependabot).

## 6. Infrastructure

- Image de l'API : utilisateur non-root `node`, aucun secret dedans
  (`.dockerignore`), secrets montés en lecture seule (`/run/secrets`).
- Base PostgreSQL sans port publié ; seuls 80 et 443 (Caddy) sont ouverts.
- HTTPS automatique (Let's Encrypt) ; HTTP redirige vers HTTPS.
- Sauvegardes quotidiennes gardées 14 jours, à copier hors du serveur.
- Intégration continue sans aucun secret, sans déploiement automatique.

### Rotation des secrets

Voir le tableau de [DEPLOIEMENT.md § 6](DEPLOIEMENT.md#6-secrets). Après une
fuite supposée du `JWT_ACCESS_SECRET` : le changer et redémarrer suffit (les
access tokens volés expirent immédiatement). Après une fuite de la base :
révoquer toutes les sessions (`UPDATE refresh_tokens SET revoked_at = now()`)
et changer le mot de passe PostgreSQL.

### À faire plus tard

- **Plusieurs instances** : passer sur Redis le registre des bus en direct
  (`LiveRegistry`), la limitation des requêtes et l'adaptateur Socket.io. Tant
  que ce n'est pas fait, ne lancer **qu'une seule** instance de l'API.
- Double authentification pour les comptes ADMIN.
- Vérification de l'adresse email à l'inscription (aujourd'hui non vérifiée :
  les limites d'inscription et le score de confiance freinent les faux comptes).
- Supervision externe de `/api/v1/health/ready` (par exemple UptimeRobot, gratuit).

## 7. Test de charge

Script : `pnpm --filter @buslive/api load:test` (`apps/api/test/load/load-test.ts`).
Des « passagers » enchaînent les écrans (arrêts proches → prochains passages →
lignes → détail d'une ligne), pendant que des clients Socket.io suivent une ligne.

Mesures du 19/10/2026 (PC de développement Windows, base dans Docker Desktop,
une instance de l'API, réseau de démonstration) :

| Essai                                    | Débit total | p50    | p95    | p99     | Erreurs |
| ---------------------------------------- | ----------- | ------ | ------ | ------- | ------- |
| 1 passager                               | 58 req/s    | 14 ms  | 49 ms  | 89 ms   | 0       |
| 20 passagers + 100 abonnés (avant)       | 58 req/s    | 314 ms | 777 ms | 1083 ms | 0       |
| 20 passagers + 200 abonnés (après corr.) | 98 req/s    | 205 ms | 352 ms | 432 ms  | 0       |

- Les 200 abonnés temps réel se connectent en moins d'une seconde.
- L'API est limitée par le **processeur** (94 % d'un cœur mesuré), pas par la
  base : Node exécute le JavaScript sur un seul fil. Le profil montre le temps
  réparti entre Prisma, `pg` et Express.
- Correction faite grâce au profil : le tri des numéros de ligne recréait un
  comparateur `Intl` à chaque comparaison (`compareLineCodes`) ; un
  `Intl.Collator` partagé a fait passer le débit de 58 à 98 requêtes/s.
- Ordre de grandeur : 98 requêtes/s ≈ 25 ouvertures complètes de l'app par
  seconde, largement assez pour Mahdia et Ksour Essef. Si cela devient juste :
  mettre en cache mémoire (60 s) les lignes et leur détail, qui changent
  rarement, avant de penser à plusieurs instances.

## 8. Google Play : formulaire « Sécurité des données » (brouillon)

À reporter dans la Play Console et à vérifier avant l'envoi.

| Type de données          | Collecté | Partagé | Finalité                | Facultatif | Détail                                                                                  |
| ------------------------ | -------- | ------- | ----------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Position précise         | Oui      | Non     | Fonctionnalité de l'app | Oui        | Arrêts proches (non stockée) ; partage « Je suis dans le bus » (dernière position, 7 j) |
| Adresse email            | Oui      | Non     | Gestion du compte       | Non*       | *Compte requis seulement pour partager, signaler, les favoris et alertes                |
| Nom                      | Oui      | Non     | Gestion du compte       | Oui        | Nom affiché                                                                             |
| Identifiants utilisateur | Oui      | Non     | Gestion du compte       | Non*       | Identifiant interne                                                                     |
| Activité dans l'app      | Oui      | Non     | Fonctionnalité de l'app | Oui        | Signalements, votes, favoris                                                            |
| Identifiants d'appareil  | Oui      | Non     | Notifications           | Oui        | Jeton Firebase Cloud Messaging                                                          |

- Données chiffrées en transit : **oui** (HTTPS uniquement).
- Suppression possible : **oui**, dans l'app et sur `https://<domaine>/legal/account-deletion`.
- Les fournisseurs de service (Google Maps, Firebase) agissent pour le compte de
  l'app : ce n'est pas un « partage » au sens de Google Play, mais ils sont
  cités dans la politique de confidentialité.

### Déclaration de la localisation en arrière-plan

Google Play demande une justification et une **vidéo** (30 s) :

> BusLive permet aux passagers de partager la position du bus dans lequel ils
> se trouvent, pour que les autres usagers voient le bus arriver en temps réel
> (il n'existe pas de données officielles en Tunisie). Le partage est lancé
> volontairement avec le bouton « Je suis dans le bus », affiché en permanence
> par une notification, et s'arrête au terminus, après 10 minutes sans
> mouvement ou au bout de 3 heures. La localisation en arrière-plan est
> nécessaire pour que le partage continue écran éteint pendant le trajet.

Vidéo à montrer : l'écran d'information (`share.disclosure`) **avant** la
demande de permission, la demande « Toujours autoriser », le bouton de partage,
la notification, puis l'arrêt du partage.

## 9. Déclaration INPDP (Tunisie)

La loi organique 2004-63 sur la protection des données personnelles impose une
**déclaration préalable** à l'Instance nationale de protection des données
personnelles (INPDP) avant tout traitement de données personnelles. La
géolocalisation peut demander une autorisation. Démarche à faire par la
personne responsable du traitement avant le lancement, de préférence avec
l'avis d'un juriste. Préparer : finalités, données (section 8), durées
(section 4), hébergeur et pays du serveur, mesures de sécurité (ce document).
