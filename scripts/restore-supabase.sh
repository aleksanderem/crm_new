#!/usr/bin/env bash
# Restore a Supabase Postgres backup created by backup-supabase.sh.
#
# Usage:
#   ./scripts/restore-supabase.sh                    # restores the latest backup
#   ./scripts/restore-supabase.sh supabase-backups/backup-20260805T030000Z.sql.gz.enc
#
# Required env vars:
#   BACKUP_ENCRYPTION_KEY    Same passphrase used during backup
#   BACKUP_S3_BUCKET         Bucket name, no s3:// prefix (e.g. my-backups)
#   TARGET_DB_URL            PostgreSQL connection string for the restore target
#   AWS_ACCESS_KEY_ID        S3 credentials
#   AWS_SECRET_ACCESS_KEY    S3 credentials
#
# Optional env vars:
#   BACKUP_S3_PREFIX         Same as backup script (default: supabase-backups)
#   AWS_DEFAULT_REGION       S3 region (default: us-east-1)
#   AWS_ENDPOINT_URL         Override endpoint for S3-compatible stores (Backblaze B2, MinIO…)
#   RESTORE_NO_PROMPT        Set to 1 to skip the interactive confirmation (for CI / drills)

set -euo pipefail

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${TARGET_DB_URL:?TARGET_DB_URL is required}"

BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-supabase-backups}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
RESTORE_NO_PROMPT="${RESTORE_NO_PROMPT:-0}"

AWS_EXTRA=()
[ -n "${AWS_ENDPOINT_URL:-}" ] && AWS_EXTRA=(--endpoint-url "${AWS_ENDPOINT_URL}")

# ── Determine which backup to restore ───────────────────────────────────────
BACKUP_KEY="${1:-}"

if [ -z "$BACKUP_KEY" ]; then
  echo "[restore] No backup key specified — fetching latest from s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/..."
  BACKUP_KEY=$(aws s3api "${AWS_EXTRA[@]}" list-objects-v2 \
    --bucket "${BACKUP_S3_BUCKET}" \
    --prefix "${BACKUP_S3_PREFIX}/" \
    --region "${AWS_DEFAULT_REGION}" \
    --query "sort_by(Contents, &LastModified)[-1].Key" \
    --output text)

  if [ -z "$BACKUP_KEY" ] || [ "$BACKUP_KEY" = "None" ]; then
    echo "[restore] ERROR: no backups found in s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/"
    exit 1
  fi
fi

echo "[restore] Target backup: ${BACKUP_KEY}"

# ── Safety prompt ────────────────────────────────────────────────────────────
SAFE_TARGET="${TARGET_DB_URL//:*@/:**@}"   # mask password for logging
echo "[restore] Restore target: ${SAFE_TARGET}"
echo ""
echo "  CAUTION: This will apply the dump to the target database."
echo "  Existing tables with conflicting data may cause errors."
echo "  For a clean restore, truncate or drop the public schema first (see docs/backup-restore.md)."
echo ""

if [ "$RESTORE_NO_PROMPT" != "1" ] && [ -t 0 ]; then
  read -r -p "[restore] Continue? [y/N] " confirm
  case "$confirm" in
    [yY][eE][sS]|[yY]) ;;
    *) echo "[restore] Aborted."; exit 1 ;;
  esac
fi

WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

ENC_FILE="${WORK_DIR}/backup.sql.gz.enc"
GZ_FILE="${WORK_DIR}/backup.sql.gz"

# ── Download ─────────────────────────────────────────────────────────────────
echo "[restore] Downloading s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}..."
aws s3 cp "${AWS_EXTRA[@]}" \
  "s3://${BACKUP_S3_BUCKET}/${BACKUP_KEY}" \
  "${ENC_FILE}" \
  --region "${AWS_DEFAULT_REGION}" \
  --no-progress

# ── Decrypt ──────────────────────────────────────────────────────────────────
echo "[restore] Decrypting..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in  "${ENC_FILE}" \
  -out "${GZ_FILE}"

rm -f "${ENC_FILE}"

# ── Restore ──────────────────────────────────────────────────────────────────
echo "[restore] Restoring database..."
gunzip -c "${GZ_FILE}" | psql "${TARGET_DB_URL}" \
  --single-transaction \
  --on-error-stop \
  --quiet

echo ""
echo "[restore] Restore complete."
echo "[restore] Source backup: ${BACKUP_KEY}"
