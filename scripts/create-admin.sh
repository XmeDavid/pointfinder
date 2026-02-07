#!/usr/bin/env bash
#
# Creates an admin user in the Scout Mission Control database.
# Requires: docker (to reach the running postgres container)
#
# Usage:
#   ./scripts/create-admin.sh
#   ./scripts/create-admin.sh --name "Admin" --email admin@scout.dev --password secret123
#

set -euo pipefail

CONTAINER="scoutmission-db"
DB="scoutmission"
DB_USER="scout"

# ── Parse flags or prompt interactively ──────────────────────────
NAME=""
EMAIL=""
PASSWORD=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)     NAME="$2";     shift 2 ;;
    --email)    EMAIL="$2";    shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  read -rp "Admin name: " NAME
fi
if [[ -z "$EMAIL" ]]; then
  read -rp "Admin email: " EMAIL
fi
if [[ -z "$PASSWORD" ]]; then
  read -rsp "Admin password: " PASSWORD
  echo
fi

if [[ -z "$NAME" || -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Error: name, email, and password are all required."
  exit 1
fi

# ── Check that the postgres container is running ─────────────────
if ! docker inspect "$CONTAINER" --format='{{.State.Running}}' 2>/dev/null | grep -q true; then
  echo "Error: container '$CONTAINER' is not running."
  echo "Start the stack first:  docker compose up -d"
  exit 1
fi

# ── Ensure pgcrypto extension exists ─────────────────────────────
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB" -qc \
  "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null

# ── Insert the admin (upsert on email) ───────────────────────────
echo "Creating admin user..."
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB" -c "
  INSERT INTO users (id, email, name, password_hash, role)
  VALUES (
    gen_random_uuid(),
    '${EMAIL}',
    '${NAME}',
    crypt('${PASSWORD}', gen_salt('bf', 10)),
    'admin'
  )
  ON CONFLICT (email) DO UPDATE SET
    name          = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role          = 'admin';
"

echo ""
echo "Admin user created successfully."
echo "  Email:    $EMAIL"
echo "  Name:     $NAME"
echo "  Login at: http://localhost:5173"
