#!/usr/bin/env bash
# 208 STEP 3 — protected staging database backup taken before migrations.
# Writes OUTSIDE the git repository so tenant data can never be committed.
# Never echoes the connection string.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/api/.env.staging.local"
BACKUP_DIR="$HOME/titan-staging-backups"
FORBIDDEN_PROD_REF="rshuiaghmtrvvilhqpwm"
STAGING_REF="cpkuwtaipjxeipvbssvn"

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"

if [ -z "$DATABASE_URL" ]; then echo "BLOCKED: no staging DATABASE_URL"; exit 2; fi
case "$DATABASE_URL" in
  *"$FORBIDDEN_PROD_REF"*) echo "BLOCKED: refusing production project ref"; exit 3;;
esac
case "$DATABASE_URL" in
  *"$STAGING_REF"*) : ;;
  *) echo "BLOCKED: target is not the known staging project ref"; exit 3;;
esac

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/titan-staging-pre-0171-$STAMP.dump"

if [ -e "$OUT" ]; then echo "BLOCKED: refusing to overwrite $OUT"; exit 4; fi

echo "Dumping staging database (custom format) -> $OUT"
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$OUT"

chmod 600 "$OUT"

SIZE_BYTES="$(stat -f %z "$OUT")"
SHA256="$(shasum -a 256 "$OUT" | awk '{print $1}')"

cat > "$OUT.meta.json" <<META
{
  "label": "208-step3-staging-backup",
  "purpose": "Pre-migration backup taken before applying drizzle chain through 0171_xero_complete_historical_sync",
  "environment": "staging",
  "supabaseProjectRef": "$STAGING_REF",
  "path": "$OUT",
  "format": "postgresql custom (pg_dump -Fc, compress=9)",
  "takenAtUtc": "$STAMP",
  "sizeBytes": $SIZE_BYTES,
  "sha256": "$SHA256",
  "pgDumpVersion": "$(pg_dump --version | head -1)",
  "insideGitRepo": false,
  "restoreProcedure": "pg_restore --clean --if-exists --no-owner --no-privileges --dbname \\"\$STAGING_DATABASE_URL\\" $OUT"
}
META
chmod 600 "$OUT.meta.json"

echo "---- BACKUP COMPLETE ----"
cat "$OUT.meta.json"
