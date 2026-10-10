#!/bin/sh
# Restores a backup made by backup.sh into a scratch database and checks it with verify.js (T167).
# It never touches the live database: the target must be empty, and different from DATABASE_URL.
#
#   RESTORE_URL=postgres://…/craftcrew_restore tools/db/restore.sh /opt/craftcrew-backups/daily/2026-10-04
#
#   RESTORE_URL   an empty scratch database (create it first, for example `createdb craftcrew_restore`)
#   PG_RESTORE, PSQL  the pg_restore and psql commands (default pg_restore and psql)
#   NODE_ENV      passed to verify.js: production (default) for live backups, development for demo data
#
# An older snapshot cannot reveal Stripe operations accepted after its snapshot. Before payment
# reuse, reconcile provider objects and newer operation/history records; scratch verification alone
# does not authorize replay of monetary work whose history was lost.
#
# The data folder of the backup is unpacked into a temporary folder for the check and removed afterwards.
set -eu

DIR=${1:?Usage: RESTORE_URL=postgres://… tools/db/restore.sh <backup folder>}
: "${RESTORE_URL:?Set RESTORE_URL to an empty scratch database, never the live one}"
PG_RESTORE=${PG_RESTORE:-pg_restore}
PSQL=${PSQL:-psql}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

if [ -n "${DATABASE_URL:-}" ] && [ "$DATABASE_URL" = "$RESTORE_URL" ]; then
  echo "restore: RESTORE_URL is the live database (DATABASE_URL). Restore into a scratch database." >&2
  exit 1
fi
(cd "$DIR" && sha256sum -c --quiet SHA256SUMS) || { echo "restore: the backup files are damaged" >&2; exit 1; }

# shellcheck disable=SC2086 # PSQL and PG_RESTORE may be commands with arguments
TABLES=$($PSQL "$RESTORE_URL" -Atc "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')")
if [ "$TABLES" != "0" ]; then
  echo "restore: the target database is not empty ($TABLES tables). Use a new scratch database." >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/data"
tar xzf "$DIR/data.tgz" -C "$WORK/data"
if [ -f "$DIR/craftcrew.dump" ]; then
  # shellcheck disable=SC2086
  $PG_RESTORE --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$DIR/craftcrew.dump"
  echo "restore: database restored from $DIR/craftcrew.dump"
  DATABASE_URL=$RESTORE_URL node "$ROOT/tools/db/verify.js" --data-dir "$WORK/data" ${EXPECT:+--expect "$EXPECT"}
else
  echo "restore: no database dump in $DIR (STORE=json backup); checking db.json"
  node "$ROOT/tools/db/verify.js" --data-dir "$WORK/data" --json ${EXPECT:+--expect "$EXPECT"}
fi

echo "restore: scratch validation cannot detect Stripe operations omitted by an older snapshot; reconcile provider and newer operation records before payment reuse."
