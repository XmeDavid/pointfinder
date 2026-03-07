#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

CMD="${1:-help}"
if [[ $# -gt 0 ]]; then
  shift
fi
EXTRA_ARGS=("$@")

ROOT_DIR="$(cd .. && pwd)"
LOCAL_COMPOSE_FILE="$ROOT_DIR/docker-compose.e2e-local.yml"
LOCAL_DB_CONTAINER="pointfinder-db-local-e2e"
LOCAL_NGINX_CONTAINER="pointfinder-nginx-local-e2e"
MAESTRO_BIN=""

uses_local_default_target() {
  case "$CMD" in
    smoke|smoke:web|smoke:web:local|smoke:ios|smoke:android|api|api:local|api:positive|web|web:local|ios|android|all|all:local|cleanup|local:up|local:down)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

forces_local_stack() {
  case "$CMD" in
    smoke:web:local|api:local|web:local|all:local|local:up|local:down)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

uses_local_base_url() {
  [[ "${BASE_URL:-}" =~ ^https://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]
}

if uses_local_default_target; then
  export BASE_URL="${BASE_URL:-https://localhost}"
  export OPERATOR_EMAIL="${OPERATOR_EMAIL:-local-e2e-admin@example.test}"
  export OPERATOR_PASSWORD="${OPERATOR_PASSWORD:-LocalE2E!12345}"
fi

if [[ "${BASE_URL:-}" =~ ^https://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
  export NODE_TLS_REJECT_UNAUTHORIZED=0
fi

# --- Lifecycle functions ---
setup() {
  echo "=== Setup: creating main game fixture ==="
  npx tsx shared/setup.ts
  # Export run ID for subcommands
  export E2E_RUN_ID=$(cat .runtime/latest-run-id)
}

cleanup_trap() {
  echo "=== Cleanup: deleting all E2E games ==="
  npx tsx shared/cleanup.ts || true
}

run_with_lifecycle() {
  setup
  trap cleanup_trap EXIT
  "$@"
}

prepare_local_stack_assets() {
  mkdir -p \
    "$ROOT_DIR/data/local-e2e/certs" \
    "$ROOT_DIR/data/local-e2e/secrets" \
    "$ROOT_DIR/data/local-e2e/uploads" \
    "$ROOT_DIR/data/local-e2e/postgres"

  if [[ ! -f "$ROOT_DIR/data/local-e2e/certs/fullchain.pem" || ! -f "$ROOT_DIR/data/local-e2e/certs/privkey.pem" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 \
      -keyout "$ROOT_DIR/data/local-e2e/certs/privkey.pem" \
      -out "$ROOT_DIR/data/local-e2e/certs/fullchain.pem" \
      -days 365 \
      -subj '/CN=localhost'
  fi

  [[ -f "$ROOT_DIR/data/local-e2e/secrets/firebase-service-account.json" ]] || printf '{}' > "$ROOT_DIR/data/local-e2e/secrets/firebase-service-account.json"
  [[ -f "$ROOT_DIR/data/local-e2e/secrets/AuthKey_LOCAL_E2E.p8" ]] || printf 'LOCAL_E2E_APNS_KEY\n' > "$ROOT_DIR/data/local-e2e/secrets/AuthKey_LOCAL_E2E.p8"
}

seed_local_admin() {
  local password_hash
  password_hash=$(docker run --rm httpd:2.4-alpine htpasswd -bnBC 10 '' "$OPERATOR_PASSWORD" | tr -d ':\n')

  docker exec -i "$LOCAL_DB_CONTAINER" psql -U scout -d pointfinder -v ON_ERROR_STOP=1 <<SQL
INSERT INTO users (id, email, name, password_hash, role)
VALUES (
  gen_random_uuid(),
  '${OPERATOR_EMAIL}',
  'Local E2E Admin',
  '${password_hash}',
  'admin'
)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = 'admin';
SQL
}

wait_for_local_stack() {
  for _ in $(seq 1 60); do
    if curl -sk https://localhost/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Local E2E stack did not become ready in time." >&2
  return 1
}

local_up() {
  prepare_local_stack_assets
  if [[ "${E2E_LOCAL_REBUILD:-0}" == "1" ]]; then
    docker compose -f "$LOCAL_COMPOSE_FILE" up -d --build
  else
    docker compose -f "$LOCAL_COMPOSE_FILE" up -d
  fi
  seed_local_admin
  docker exec "$LOCAL_NGINX_CONTAINER" nginx -s reload >/dev/null 2>&1 || true
  wait_for_local_stack
}

local_down() {
  docker compose -f "$LOCAL_COMPOSE_FILE" down
}

run_local_with_lifecycle() {
  local_up
  run_with_lifecycle "$@"
}

run_managed_with_lifecycle() {
  if forces_local_stack || uses_local_base_url; then
    run_local_with_lifecycle "$@"
  else
    run_with_lifecycle "$@"
  fi
}

run_playwright() {
  local cmd=(npx playwright test "$@")
  if (( ${#EXTRA_ARGS[@]} > 0 )); then
    cmd+=("${EXTRA_ARGS[@]}")
  fi
  "${cmd[@]}"
}

resolve_maestro() {
  if [[ -n "$MAESTRO_BIN" ]]; then
    return 0
  fi

  local candidate
  if candidate="$(command -v maestro 2>/dev/null)" && [[ -n "$candidate" ]]; then
    MAESTRO_BIN="$candidate"
    return 0
  fi

  for candidate in \
    "$HOME/.maestro/bin/maestro" \
    "/opt/homebrew/bin/maestro" \
    "/usr/local/bin/maestro"
  do
    if [[ -x "$candidate" ]]; then
      MAESTRO_BIN="$candidate"
      return 0
    fi
  done

  echo "Maestro CLI not found. Install Maestro or add it to PATH." >&2
  return 127
}

ensure_maestro_runtime() {
  resolve_maestro

  if ! java -version >/dev/null 2>&1; then
    echo "Java runtime not found. Maestro CLI requires Java. Install a JRE/JDK and try again." >&2
    return 1
  fi
}

maestro_supports_device_locale() {
  ensure_maestro_runtime >/dev/null 2>&1 || return 1
  "$MAESTRO_BIN" test --help 2>&1 | grep -q -- '--device-locale'
}

run_maestro_test() {
  ensure_maestro_runtime

  local cmd=("$MAESTRO_BIN" test --format junit)
  if maestro_supports_device_locale; then
    cmd+=(--device-locale=en)
  fi
  cmd+=("$@")
  "${cmd[@]}"
}

run_mobile_suite() {
  run_maestro_test mobile/shared/positive/
  run_maestro_test mobile/shared/negative/
}

run_api()      { run_playwright --project=api; }
run_api_pos()  { run_playwright --project=api --grep-invert @negative; }
run_web()      { run_playwright --project=web; }
run_ios()      { run_mobile_suite; }
run_android()  { run_mobile_suite; }

# --- Commands ---
case "$CMD" in
  smoke)
    run_managed_with_lifecycle run_playwright --project=api --grep @smoke
    ;;
  smoke:web)
    run_managed_with_lifecycle run_playwright --project=web --grep @smoke
    ;;
  smoke:web:local)
    run_managed_with_lifecycle run_playwright --project=web --grep @smoke
    ;;
  smoke:ios)
    run_managed_with_lifecycle run_maestro_test \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    ;;
  smoke:android)
    run_managed_with_lifecycle run_maestro_test \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    ;;
  api)
    run_managed_with_lifecycle run_api
    ;;
  api:local)
    run_managed_with_lifecycle run_api
    ;;
  api:positive)
    run_managed_with_lifecycle run_api_pos
    ;;
  web)
    run_managed_with_lifecycle run_web
    ;;
  web:local)
    run_managed_with_lifecycle run_web
    ;;
  ios)
    run_managed_with_lifecycle run_ios
    ;;
  android)
    run_managed_with_lifecycle run_android
    ;;
  all)
    if forces_local_stack || uses_local_base_url; then
      local_up
    fi
    setup
    trap cleanup_trap EXIT
    run_api
    run_web
    run_ios
    run_android
    ;;
  all:local)
    if forces_local_stack || uses_local_base_url; then
      local_up
    fi
    setup
    trap cleanup_trap EXIT
    run_api
    run_web
    run_ios
    run_android
    ;;
  local:up)
    local_up
    ;;
  local:down)
    local_down
    ;;
  parity)
    npx tsx shared/parity-check.ts
    ;;
  cleanup)
    npx tsx shared/cleanup.ts
    ;;
  help|*)
    echo "Usage: ./run.sh [command]"
    echo ""
    echo "API/web commands default to the local Docker-backed E2E stack."
    echo "Set BASE_URL, OPERATOR_EMAIL, and OPERATOR_PASSWORD explicitly if you want another target."
    echo "Mobile commands still depend on the app-side backend configuration."
    echo ""
    echo "Commands:"
    echo "  smoke          Local API smoke test (critical path)"
    echo "  smoke:web      Local web smoke test (operator checks + API-assisted player)"
    echo "  smoke:web:local Alias for the local web smoke flow"
    echo "  smoke:ios      iOS smoke test (login + create game)"
    echo "  smoke:android  Android smoke test (login + create game)"
    echo "  api            Local stack → setup → API tests → teardown"
    echo "  api:local      Alias for the local API flow"
    echo "  api:positive   Local stack → setup → API positive only → teardown"
    echo "  web            Local stack → setup → web UI tests → teardown"
    echo "  web:local      Alias for the local web flow"
    echo "  ios            Setup → Maestro iOS flows → teardown"
    echo "  android        Setup → Maestro Android flows → teardown"
    echo "  all            Setup → API → web → iOS → Android → teardown"
    echo "  all:local      Start local prod-like stack → setup → API → web → iOS → Android → teardown"
    echo "  local:up       Start or refresh the local prod-like Docker E2E stack"
    echo "  local:down     Stop the local prod-like Docker E2E stack"
    echo ""
    echo "Set E2E_LOCAL_REBUILD=1 to force a docker rebuild during *:local or local:up commands."
    echo "  parity         Check scenario coverage across platforms"
    echo "  cleanup        Delete orphaned E2E games"
    ;;
esac
