#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# db-backup.sh — PostgreSQL backup via pg_dump inside the running
# Docker container.  Creates timestamped, gzip-compressed dumps and
# removes backups older than a configurable retention period.
#
# Usage:
#   ./scripts/db-backup.sh [BACKUP_DIR]
#
# Environment variables (all optional):
#   DB_CONTAINER   Docker container name         (default: pointfinder-db)
#   DB_NAME        Database to dump              (default: pointfinder)
#   DB_USER        PostgreSQL user               (default: scout)
#   RETENTION_DAYS Number of days to keep backups (default: 30)
#
# Examples:
#   # Defaults — dumps to ./backups, keeps 30 days
#   ./scripts/db-backup.sh
#
#   # Custom directory and 7-day retention
#   RETENTION_DAYS=7 ./scripts/db-backup.sh /mnt/nas/pointfinder-backups
#
#   # Different container (e.g. e2e stack)
#   DB_CONTAINER=pointfinder-e2e-db ./scripts/db-backup.sh
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
BACKUP_DIR="${1:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-pointfinder-db}"
DB_NAME="${DB_NAME:-pointfinder}"
DB_USER="${DB_USER:-scout}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ── Timestamp for the backup filename ────────────────────────────────
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILENAME="${DB_NAME}-${TIMESTAMP}.sql.gz"

# ── Ensure backup directory exists ───────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── Verify the container is running ──────────────────────────────────
if ! docker inspect --format='{{.State.Running}}' "${DB_CONTAINER}" 2>/dev/null | grep -q true; then
  echo "ERROR: Container '${DB_CONTAINER}' is not running." >&2
  exit 1
fi

# ── Run pg_dump inside the container and compress on the host ────────
echo "Backing up '${DB_NAME}' from container '${DB_CONTAINER}'..."
docker exec "${DB_CONTAINER}" \
  pg_dump -U "${DB_USER}" --no-password "${DB_NAME}" \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

# ── Verify the backup is non-empty ───────────────────────────────────
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"
if [ ! -s "${BACKUP_PATH}" ]; then
  echo "ERROR: Backup file is empty — removing." >&2
  rm -f "${BACKUP_PATH}"
  exit 1
fi

BACKUP_SIZE="$(du -h "${BACKUP_PATH}" | cut -f1)"
echo "Backup created: ${BACKUP_PATH} (${BACKUP_SIZE})"

# ── Prune old backups ────────────────────────────────────────────────
# Only deletes files matching the naming pattern produced by this script.
DELETED_COUNT=0
while IFS= read -r old_backup; do
  rm -f "${old_backup}"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name "${DB_NAME}-*.sql.gz" -type f -mtime +"${RETENTION_DAYS}")

if [ "${DELETED_COUNT}" -gt 0 ]; then
  echo "Pruned ${DELETED_COUNT} backup(s) older than ${RETENTION_DAYS} days."
fi

echo "Done."
