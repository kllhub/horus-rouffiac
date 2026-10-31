#!/usr/bin/env bash
# Sauvegarde quotidienne de la base HORUS (et d'elle seule), chiffrée.
#   Cron : 20 3 * * *  ~/horus/infra/backup.sh >> ~/horus/backups/backup.log 2>&1
#
# Restauration :
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass file:~/horus/backups/.cle -in horus-AAAAMMJJ-HHMM.sql.gz.enc \
#     | gunzip | docker exec -i horus-postgres psql -U horus -d horus
set -euo pipefail
DEST=${HORUS_BACKUP_DIR:-$HOME/horus/backups}
CLE="$DEST/.cle"
mkdir -p "$DEST" && chmod 700 "$DEST"
[ -s "$CLE" ] || { (umask 077; openssl rand -base64 48 > "$CLE"); echo "Clé créée : $CLE — à copier EN LIEU SÛR (sans elle, pas de restauration)."; }

F="$DEST/horus-$(date +%Y%m%d-%H%M).sql.gz.enc"
docker exec horus-postgres pg_dump -U horus -d horus --no-owner \
  | gzip -9 | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:"$CLE" -out "$F"
chmod 600 "$F"
echo "$(date -Is) OK $(du -h "$F" | cut -f1) $F"
find "$DEST" -name 'horus-*.sql.gz.enc' -mtime +30 -delete
# Copie hors serveur (à brancher) : rsync / rclone vers le stockage de sauvegarde de la mairie.
if [ -n "${HORUS_BACKUP_COPIE:-}" ]; then rsync -a "$DEST/" "$HORUS_BACKUP_COPIE/"; fi
