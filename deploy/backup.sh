#!/usr/bin/env sh
# Back up the CarvyPaar database and uploaded photos.
#
#   ./deploy/backup.sh                 # writes ./backups/<timestamp>/
#   KEEP_DAYS=14 ./deploy/backup.sh    # prune backups older than 14 days (default 7)
#
# Schedule it daily, e.g. crontab:  15 3 * * *  cd /srv/carvypaar && ./deploy/backup.sh >> backups/backup.log 2>&1
# Copy ./backups OFF the server (S3, B2, another host). A backup on the same disk is not a backup.
#
# Restore:
#   gunzip -c backups/<ts>/db.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.production \
#       exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm -v "$PWD/backups/<ts>:/b" \
#       backend sh -c 'tar -xzf /b/uploads.tar.gz -C /app'
set -eu

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="backups/$STAMP"
KEEP_DAYS="${KEEP_DAYS:-7}"
mkdir -p "$DEST"

# Load DB name/user from the env file without exporting secrets to the process list.
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env.production | cut -d= -f2- || true)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' .env.production | cut -d= -f2- || true)
POSTGRES_USER=${POSTGRES_USER:-carvypaar}
POSTGRES_DB=${POSTGRES_DB:-carvypaar}

echo "[$STAMP] dumping database $POSTGRES_DB"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists | gzip -9 > "$DEST/db.sql.gz"

echo "[$STAMP] archiving uploads"
$COMPOSE exec -T backend tar -czf - -C /app uploads > "$DEST/uploads.tar.gz"

# Sanity check: an empty dump means something went wrong.
if [ "$(gzip -cd "$DEST/db.sql.gz" | head -c 1000 | wc -c)" -lt 100 ]; then
  echo "Backup looks empty, check the database container" >&2
  exit 1
fi

find backups -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "[$STAMP] done: $(du -sh "$DEST" | cut -f1) in $DEST"
