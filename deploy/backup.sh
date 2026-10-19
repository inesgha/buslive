#!/bin/sh
# Sauvegarde de la base, une fois par jour, dans deploy/backups/ (sur le serveur).
# Format « custom » de pg_dump : compressé, restaurable avec pg_restore (voir restore.sh).
# Les sauvegardes de plus de BACKUP_KEEP_DAYS jours sont supprimées.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

while true; do
  file="/backups/buslive-$(date -u +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --file="$file.tmp"; then
    # Renommage seulement si la sauvegarde est complète.
    mv "$file.tmp" "$file"
    echo "sauvegarde : $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "ÉCHEC de la sauvegarde" >&2
  fi
  find /backups -name 'buslive-*.dump' -mtime "+$KEEP_DAYS" -delete
  sleep 86400
done
