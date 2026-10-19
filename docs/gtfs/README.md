# Importer un réseau au format GTFS

GTFS est le format standard des horaires de transport en commun (utilisé par
Google Maps, entre autres). C'est le moyen prévu pour remplacer les **données de
démonstration** par le vrai réseau de Mahdia et Ksour Essef.

## Si la SRT fournit un fichier GTFS

C'est généralement un fichier `.zip` : le décompresser dans un dossier, puis :

```bash
# 1. Essai à blanc : vérifie tout, affiche ce qui serait créé, n'écrit RIEN.
pnpm --filter @buslive/api gtfs:import chemin/vers/le/dossier --governorate TN-53 --prefix srt-mahdia-

# 2. Si le rapport est bon : import pour de bon (une seule transaction).
pnpm --filter @buslive/api gtfs:import chemin/vers/le/dossier --governorate TN-53 --prefix srt-mahdia- --apply
```

Options :

| Option          | Rôle                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `--governorate` | Gouvernorat des lignes importées (code ISO, ex. `TN-53` pour Mahdia)             |
| `--prefix`      | Préfixe des codes d'arrêts et de calendriers, pour ne pas mélanger deux réseaux  |
| `--line-type`   | `URBAN` (par défaut), `SUBURBAN` ou `INTERCITY` (GTFS ne fait pas la différence) |
| `--apply`       | Écrit réellement dans la base. Sans elle, c'est un essai à blanc                 |

L'import est **idempotent** : on peut le relancer avec un fichier mis à jour, les
éléments sont retrouvés par leur code et mis à jour (pas de doublon). Le
gouvernorat doit ensuite être **ouvert** dans l'admin (page Réseau) pour que les
lignes apparaissent dans l'app.

## Si personne ne fournit de GTFS : le préparer soi-même

Le dossier [`modele/`](modele/) contient les fichiers vides (une ligne
d'en-tête). Chacun s'ouvre dans un tableur (LibreOffice, Excel) : remplir,
puis **enregistrer au format CSV (séparateur virgule, encodage UTF-8)**, en
gardant l'extension `.txt`.

| Fichier            | Contenu                                                                  | Exemple                                          |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------ |
| `agency.txt`       | L'exploitant                                                             | `srt,SRT de Mahdia,https://…,Africa/Tunis`       |
| `stops.txt`        | Les arrêts, avec leur position (relevée sur place ou sur une carte)      | `ks-centre,Ksour Essef Centre,35.4181,10.9947`   |
| `routes.txt`       | Les lignes : numéro (`route_short_name`), nom, couleur sans `#`          | `L10,srt,10,Mahdia – Ksour Essef,3,0E7490`       |
| `calendar.txt`     | Les jours de circulation (1 = oui) et la période (AAAAMMJJ)              | `SEM,1,1,1,1,1,0,0,20260901,20270630`            |
| `trips.txt`        | Chaque course : ligne, calendrier, sens (0 aller, 1 retour), destination | `L10-0700,L10,SEM,0,Ksour Essef,`                |
| `stop_times.txt`   | Pour chaque course, l'heure à chaque arrêt, dans l'ordre                 | `L10-0700,07:00:00,07:00:00,gare,1`              |
| `translations.txt` | (facultatif) Les noms en arabe                                           | `stops,stop_name,ar,قصور الساف المركز,ks-centre` |
| `shapes.txt`       | (facultatif) Le tracé de la route, point par point                       | `L10-aller,35.4978,11.0473,1`                    |

Règles utiles :

- Les heures après minuit s'écrivent `24:30:00`, `25:10:00`… (course de la veille).
- Toutes les courses d'un même sens d'une ligne doivent passer par **les mêmes
  arrêts** : BusLive garde un seul parcours par sens (le plus fréquent), et
  signale les autres courses.
- Toutes les heures doivent être renseignées dans `stop_times.txt` (pas
  d'interpolation).
- Les noms de destination (`trip_headsign`) s'écrivent sans « vers » : BusLive
  l'ajoute (« vers Ksour Essef », « نحو قصور الساف »).
- `calendar_dates.txt` (jours fériés, exceptions) n'est pas encore pris en charge :
  il est signalé et ignoré. Pour le Ramadan, créer un calendrier à part, et lui
  donner une priorité plus haute dans la base si besoin.

Un exemple complet et minimal est dans
[`apps/api/test/fixtures/gtfs-mini/`](../../apps/api/test/fixtures/gtfs-mini/)
(il sert aux tests automatiques).
