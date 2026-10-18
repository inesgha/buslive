# @buslive/mobile

Application mobile BusLive : React Native 0.88 + Expo SDK 58 (expo-router),
i18next (français / arabe avec RTL), TanStack Query.

## Lancer l'app sur un téléphone Android (Expo Go)

### Une seule fois

1. **Installer « Expo Go »** depuis le Play Store. Il doit prendre en charge le
   **SDK 58** : en cas de message « incompatible », mettre Expo Go à jour.
2. **Créer `apps/mobile/.env.local`** à partir de `.env.example`, avec l'adresse
   IP de ton PC sur le Wi-Fi. Pour la trouver : commande `ipconfig`, ligne
   « Adresse IPv4 » de la carte **Wi-Fi** (pas VMware ni WSL).
3. **Autoriser les connexions du téléphone vers le PC** : dans PowerShell **en
   administrateur** :

   ```powershell
   New-NetFirewallRule -DisplayName "BusLive API (3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "BusLive Expo (8081)" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
   ```

   Ces règles ne s'appliquent qu'aux réseaux **privés**. Si Windows classe ton
   Wi-Fi comme « Public » et que c'est un réseau de confiance (ta box à la
   maison), passe-le en « Privé » : Paramètres → Réseau et Internet → Wi-Fi →
   propriétés du réseau → « Réseau privé ».

   ⚠️ Sur un Wi-Fi public, d'entreprise ou d'université, les appareils sont
   souvent isolés les uns des autres : le téléphone ne verra pas le PC. Dans ce
   cas, active le **point d'accès mobile** du téléphone, connectes-y le PC et
   mets à jour l'IP dans `.env.local`.

### À chaque fois

```bash
pnpm db:up        # base de données
pnpm dev:api      # API (dans un premier terminal)
pnpm dev:mobile   # Expo (dans un second terminal) → scanner le QR code avec Expo Go
```

Raccourcis dans le terminal Expo : `r` recharge l'app, `j` ouvre le débogueur.

## Build de développement (EAS) : nécessaire pour le partage en arrière-plan

Dans Expo Go, Android ne permet **pas** la localisation en arrière-plan : le
partage « Je suis dans le bus » ne marche qu'app ouverte (l'app le détecte et
le signale). Pour l'arrière-plan, il faut **ta propre version de l'app** (un
APK), construite par EAS Build dans le cloud. Elle remplace Expo Go pour
BusLive ; le code JavaScript reste servi par ton PC (`pnpm dev:mobile`), comme avec Expo Go.

### Une seule fois

1. Créer un compte gratuit sur <https://expo.dev/signup>.
2. Installer l'outil EAS : `npm install -g eas-cli`.
3. **Commiter tes changements** (EAS envoie le contenu suivi par git).
4. Dans `apps/mobile` :

   ```bash
   eas login
   eas init                                         # relie le projet à ton compte (ajoute un identifiant dans app.json)
   eas build --profile development --platform android
   ```

   Accepter la création de la clé de signature Android (gardée par Expo).
   L'offre gratuite peut faire attendre le build plusieurs dizaines de minutes.

5. À la fin, ouvrir le lien (ou scanner le QR code) sur le téléphone pour
   installer l'APK. Android demandera d'autoriser l'installation d'applications
   depuis le navigateur.

### Ensuite

```bash
pnpm dev:mobile    # puis ouvrir l'app « BusLive » (dev) sur le téléphone et choisir le serveur
```

Un nouveau build n'est nécessaire que si l'on ajoute un module **natif**
(`npx expo install …` d'un paquet avec du code Android) ou si l'on change
`app.json` (permissions, plugins). Pour du code JavaScript, le rechargement suffit.

## Partage « Je suis dans le bus »

- **Arrière-plan** (build EAS + permission « Toujours ») : `src/live/backgroundTask.ts`
  envoie les positions par lots, même app fermée, avec la notification
  permanente exigée par Android.
- **App ouverte** (Expo Go, ou permission « Toujours » refusée) : `ShareProvider`
  suit la position et garde l'écran allumé.
- Les positions partent en **REST** (`POST /live/sessions/:id/positions`), plus
  fiable en arrière-plan qu'un socket. Les bus en direct arrivent par
  **Socket.io** (`src/live/socket.ts`, hook `useLineVehicles`).
- Le texte affiché avant la demande de position en arrière-plan
  (`share.disclosure`) est une **obligation de Google Play** : ne pas le retirer.

## Organisation

```
app/                      écrans (expo-router : un fichier = un écran)
  _layout.tsx             racine : police, langue, thème, session, navigation
  (tabs)/                 barre d'onglets : Carte · Lignes · Signaler · Alertes · Profil
    index.tsx             carte : arrêts proches, prochains passages
  lines/[id].tsx          détail d'une ligne : tracé, bus en direct, arrêts, horaires du jour
  share.tsx               « Je suis dans le bus » (fenêtre modale)
  auth/login.tsx          connexion (fenêtre modale)
  auth/register.tsx       inscription (fenêtre modale)
src/
  api/                    appels à l'API (validés avec les schémas zod partagés), cache hors ligne
  auth/                   session, stockage sécurisé des jetons, messages d'erreur
  components/             composants d'interface réutilisables
  hooks/                  heure de Tunis, position, état du réseau
  i18n/                   traductions fr/ar, sens d'écriture (RTL)
  live/                   partage de position (arrière-plan / app ouverte), Socket.io, bus en direct
  reports/                formulaire de signalement (logique pure), votes, mises à jour en direct
  storage/                préférences (langue, thème)
  theme/                  couleurs, police, contrastes, style de carte sombre
  time/                   formatage des distances et des heures (« dans 5 min »)
```

## À savoir

- **Couleurs** : toujours via `useTheme().colors` (ou la prop `color` d'`AppText`),
  jamais en dur, sinon le mode sombre ne s'applique pas. Un test vérifie le
  contraste (WCAG AA) de chaque couleur de texte.
- **Textes** : jamais en dur dans un écran. Ajouter la clé dans
  `src/i18n/locales/fr.json` **et** `ar.json` : un test échoue si une clé manque
  dans l'une des deux langues. Les clés sont typées (`t('tabs.map')`).
- **Arabe et RTL** : l'interface s'inverse automatiquement (`I18nManager`).
  Changer de sens d'écriture demande un redémarrage de l'app, géré dans
  `src/i18n/direction.ts`. Les `<TextInput>` ne s'alignent pas seuls : utiliser
  `TextField`.
- **Connexion** : le refresh token est dans `expo-secure-store` (coffre-fort du
  téléphone), l'access token seulement en mémoire. `apiRequest(path, { auth: true })`
  renouvelle l'accès automatiquement, avec **une seule requête `/auth/refresh` à
  la fois** (sinon l'API révoquerait la session).
- **Variables `EXPO_PUBLIC_*`** : intégrées dans l'app, donc lisibles par tous.
  Jamais de secret dedans.
- **Heures** : toujours avec `tunisClock()` / `useServiceClock()` (heure de Tunis),
  jamais avec l'heure du téléphone. Un passage est une heure absolue
  (`serviceDate` + `passingMinutes`) : `formatPassage` en fait « dans 5 min ».
- **Hors ligne** : le cache (lignes, arrêts proches, passages) est sauvegardé
  24 h sur le téléphone. Pour sauvegarder un nouveau type de données, ajouter sa
  clé dans `shouldPersistQuery` (`src/api/queryClient.ts`) — jamais de données
  personnelles.
- **Carte** : Google Maps fonctionne dans Expo Go sans clé. Pour une version
  publiée (build), il faudra une clé « Maps SDK for Android » (phase 11).

## Scripts

| Script      | Effet                                                        |
| ----------- | ------------------------------------------------------------ |
| `start`     | Lance Expo (QR code pour Expo Go)                            |
| `typecheck` | Vérifie les types                                            |
| `test`      | Tests Jest (traductions, contrastes, client API, composants) |
