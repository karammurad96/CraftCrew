#!/bin/sh
# Nightly backup (T167): the database (pg_dump, custom format) and the data folder (uploads, audit archive,
# and db.json with STORE=json) into a dated folder. Keeps 14 daily and 6 monthly copies, and copies the new one
# off the server with rclone when BACKUP_REMOTE is set.
#
#   BACKUP_DIR=/opt/craftcrew-backups DATA_DIR=/path/to/data DATABASE_URL=postgres://… tools/db/backup.sh
#
#   BACKUP_DIR     where the copies go (required)
#   DATA_DIR       the app's data folder (required); with Docker the volume's folder, for example
#                  /var/lib/docker/volumes/craftcrew_craftcrew-data/_data
#   DATABASE_URL   the database to dump; leave it unset with STORE=json
#   PG_DUMP        the pg_dump command (default pg_dump). For the compose database, which has no published port:
#                  PG_DUMP="docker compose -f /opt/craftcrew/docker-compose.yml exec -T postgres pg_dump"
#                  with DATABASE_URL=postgres://craftcrew:<password>@localhost:5432/craftcrew
#   BACKUP_REMOTE  optional rclone destination, for example storagebox:craftcrew-backups
#   KEEP_DAILY, KEEP_MONTHLY  how many copies to keep (default 14 and 6)
#
# Never prints DATABASE_URL. Exits with an error (and keeps the older copies) when any step fails.
set -eu

: "${BACKUP_DIR:?Set BACKUP_DIR}"
: "${DATA_DIR:?Set DATA_DIR}"
PG_DUMP=${PG_DUMP:-pg_dump}
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_MONTHLY=${KEEP_MONTHLY:-6}
DAY=${BACKUP_DATE:-$(date -u +%F)}
umask 077

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"
TARGET="$BACKUP_DIR/daily/$DAY"
WORK="$TARGET.partial"
rm -rf "$WORK"
mkdir -p "$WORK"

if [ -n "${DATABASE_URL:-}" ]; then
  # shellcheck disable=SC2086 # PG_DUMP may be a command with arguments
  $PG_DUMP --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$WORK/craftcrew.dump"
  [ -s "$WORK/craftcrew.dump" ] || { echo "backup: the database dump is empty" >&2; exit 1; }
fi
tar czf "$WORK/data.tgz" -C "$DATA_DIR" .
(cd "$WORK" && sha256sum ./* > SHA256SUMS)
rm -rf "$TARGET"
mv "$WORK" "$TARGET"

# The first backup of a month is also the monthly copy.
MONTH=$(echo "$DAY" | cut -c1-7)
[ -d "$BACKUP_DIR/monthly/$MONTH" ] || cp -r "$TARGET" "$BACKUP_DIR/monthly/$MONTH"

# Keep the newest copies; the names sort by date.
prune() {
  ls -1 "$1" | grep -v '\.partial$' | sort -r | tail -n +"$(($2 + 1))" | while read -r old; do rm -rf "${1:?}/$old"; done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$TARGET" "$BACKUP_REMOTE/daily/$DAY"
  rclone copy "$BACKUP_DIR/monthly/$MONTH" "$BACKUP_REMOTE/monthly/$MONTH"
fi
echo "backup: $TARGET ($(du -sh "$TARGET" | cut -f1))"
