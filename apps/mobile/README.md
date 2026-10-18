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

## Organisation

```
app/                      écrans (expo-router : un fichier = un écran)
  _layout.tsx             racine : police, langue, thème, session, navigation
  (tabs)/                 barre d'onglets : Carte · Lignes · Signaler · Alertes · Profil
    index.tsx             carte : arrêts proches, prochains passages
  lines/[id].tsx          détail d'une ligne : tracé, arrêts, horaires du jour
  auth/login.tsx          connexion (fenêtre modale)
  auth/register.tsx       inscription (fenêtre modale)
src/
  api/                    appels à l'API (validés avec les schémas zod partagés), cache hors ligne
  auth/                   session, stockage sécurisé des jetons, messages d'erreur
  components/             composants d'interface réutilisables
  hooks/                  heure de Tunis, position, état du réseau
  i18n/                   traductions fr/ar, sens d'écriture (RTL)
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
