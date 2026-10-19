#!/bin/sh
# Restaure une sauvegarde dans la base de production. À lancer SUR LE SERVEUR,
# depuis le dossier deploy/ :
#   ./restore.sh backups/buslive-20261019-030000.dump
#
# ⚠ Remplace TOUTES les données actuelles par celles de la sauvegarde.
# L'API est arrêtée pendant l'opération, puis redémarrée.
set -eu

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Usage : ./restore.sh backups/<fichier>.dump" >&2
  exit 1
fi

compose="docker compose -f docker-compose.prod.yml --env-file .env.production"
printf 'Restaurer %s ? Toutes les données actuelles seront remplacées. Taper OUI : ' "$file"
read -r answer
[ "$answer" = "OUI" ] || { echo "Annulé."; exit 1; }

$compose stop api
# --clean --if-exists : supprime puis recrée chaque objet de la sauvegarde.
$compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
$compose start api
echo "Restauration terminée."
