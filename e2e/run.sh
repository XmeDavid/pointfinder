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
  echo "Waiting for local E2E stack to be ready..."
  for i in $(seq 1 150); do
    local http_code
    http_code=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/health 2>/dev/null || echo "000")
    if [[ "$http_code" =~ ^(200|401|403)$ ]]; then
      echo "Local E2E stack ready (took ${i}s)."
      return 0
    fi
    if (( i % 15 == 0 )); then
      echo "  Still waiting... (${i}s, last status: $http_code)"
    fi
    sleep 1
  done

  echo "Local E2E stack did not become ready in 150s." >&2
  return 1
}

local_up() {
  prepare_local_stack_assets
  if [[ "${E2E_LOCAL_REBUILD:-0}" == "1" ]]; then
    docker compose -f "$LOCAL_COMPOSE_FILE" up -d --build
  else
    docker compose -f "$LOCAL_COMPOSE_FILE" up -d
  fi
  docker exec "$LOCAL_NGINX_CONTAINER" nginx -s reload >/dev/null 2>&1 || true
  wait_for_local_stack
  seed_local_admin
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

load_run_context_value() {
  local path_expr="$1"
  if [[ -z "${E2E_RUN_ID:-}" ]]; then
    echo "E2E run context not initialized." >&2
    return 1
  fi

  node -e '
const fs = require("fs");
const ctxPath = process.argv[1];
const pathExpr = process.argv[2];
const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf8"));
const tokens = pathExpr.split(".").flatMap((segment) => {
  const resolved = [];
  const regex = /([^\[\]]+)|\[(\d+)\]/g;
  let match;
  while ((match = regex.exec(segment)) !== null) {
    resolved.push(match[1] ?? Number(match[2]));
  }
  return resolved;
});
let value = ctx;
for (const token of tokens) {
  value = value?.[token];
}
if (value === undefined || value === null) {
  process.exit(1);
}
process.stdout.write(String(value));
' ".runtime/${E2E_RUN_ID}.json" "$path_expr"
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

# --- Simulator / Emulator auto-launch ---

IOS_SIM_NAME="${IOS_SIM_NAME:-}"
IOS_SIM_BOOTED_BY_US=false
ANDROID_EMU_BOOTED_BY_US=false
ANDROID_EMULATOR_BIN=""

resolve_android_emulator() {
  if [[ -n "$ANDROID_EMULATOR_BIN" ]]; then
    return 0
  fi

  local candidate
  if candidate="$(command -v emulator 2>/dev/null)" && [[ -n "$candidate" ]]; then
    ANDROID_EMULATOR_BIN="$candidate"
    return 0
  fi

  for candidate in \
    "$HOME/Library/Android/sdk/emulator/emulator" \
    "$ANDROID_HOME/emulator/emulator" \
    "$ANDROID_SDK_ROOT/emulator/emulator"
  do
    if [[ -x "$candidate" ]]; then
      ANDROID_EMULATOR_BIN="$candidate"
      return 0
    fi
  done

  echo "Android emulator not found." >&2
  return 127
}

ensure_ios_simulator() {
  # Check if any iOS simulator is already booted
  if xcrun simctl list devices booted 2>/dev/null | grep -q "(Booted)"; then
    echo "iOS Simulator already running."
    return 0
  fi

  # Pick simulator: use IOS_SIM_NAME env var, or auto-detect an iPhone
  local sim_name="$IOS_SIM_NAME"
  if [[ -z "$sim_name" ]]; then
    sim_name=$(xcrun simctl list devices available 2>/dev/null \
      | grep -E "iPhone.*Shutdown" \
      | head -1 \
      | sed 's/^[[:space:]]*//' \
      | sed 's/ (.*//')
  fi

  if [[ -z "$sim_name" ]]; then
    echo "No available iPhone simulator found." >&2
    return 1
  fi

  echo "Booting iOS Simulator: $sim_name"
  xcrun simctl boot "$sim_name" 2>/dev/null || true

  # Wait for it to be ready
  for _ in $(seq 1 30); do
    if xcrun simctl list devices booted 2>/dev/null | grep -q "(Booted)"; then
      IOS_SIM_BOOTED_BY_US=true
      echo "iOS Simulator ready: $sim_name"
      return 0
    fi
    sleep 1
  done

  echo "iOS Simulator failed to boot in time." >&2
  return 1
}

shutdown_ios_simulator_if_ours() {
  if [[ "$IOS_SIM_BOOTED_BY_US" == "true" ]]; then
    echo "Shutting down iOS Simulator we started..."
    xcrun simctl shutdown all 2>/dev/null || true
  fi
}

ensure_android_emulator() {
  # Check if an Android device/emulator is already connected
  if adb devices 2>/dev/null | grep -qE "device$"; then
    echo "Android device/emulator already connected."
    return 0
  fi

  resolve_android_emulator || return 1

  # Pick AVD: use ANDROID_AVD env var, or first available
  local avd_name="${ANDROID_AVD:-}"
  if [[ -z "$avd_name" ]]; then
    avd_name=$("$ANDROID_EMULATOR_BIN" -list-avds 2>/dev/null | head -1)
  fi

  if [[ -z "$avd_name" ]]; then
    echo "No Android AVD found. Create one with Android Studio or avdmanager." >&2
    return 1
  fi

  echo "Starting Android emulator: $avd_name"
  "$ANDROID_EMULATOR_BIN" -avd "$avd_name" -no-snapshot-save -no-audio -no-window &
  local emu_pid=$!

  # Wait for device to be ready
  for _ in $(seq 1 150); do
    if adb shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
      ANDROID_EMU_BOOTED_BY_US=true
      echo "Android emulator ready: $avd_name (PID $emu_pid)"
      return 0
    fi
    sleep 2
  done

  echo "Android emulator failed to boot in time." >&2
  kill "$emu_pid" 2>/dev/null || true
  return 1
}

shutdown_android_emulator_if_ours() {
  if [[ "$ANDROID_EMU_BOOTED_BY_US" == "true" ]]; then
    echo "Shutting down Android emulator we started..."
    adb emu kill 2>/dev/null || true
  fi
}

maestro_supports_device_locale() {
  ensure_maestro_runtime >/dev/null 2>&1 || return 1
  "$MAESTRO_BIN" test --help 2>&1 | grep -q -- '--device-locale'
}

run_maestro_test() {
  local platform="$1"
  shift

  local -a extra_env=()
  while [[ $# -gt 1 ]]; do
    if [[ "$1" == "--env" ]]; then
      extra_env+=("$2")
      shift 2
      continue
    fi
    break
  done

  ensure_maestro_runtime

  local app_id
  if [[ "$platform" == "ios" ]]; then
    app_id="${IOS_APP_ID:-com.prayer.pointfinder}"
  else
    app_id="${ANDROID_APP_ID:-com.prayer.pointfinder}"
  fi

  local cmd=(
    "$MAESTRO_BIN"
    "--platform=$platform"
    test
    --format
    junit
    -e
    "APP_ID=$app_id"
    -e
    "OPERATOR_EMAIL=$OPERATOR_EMAIL"
    -e
    "OPERATOR_PASSWORD=$OPERATOR_PASSWORD"
  )
  if maestro_supports_device_locale; then
    cmd+=(--device-locale=en)
  fi

  local env_kv
  if (( ${#extra_env[@]} > 0 )); then
    for env_kv in "${extra_env[@]}"; do
      cmd+=(-e "$env_kv")
    done
  fi

  cmd+=("$@")
  "${cmd[@]}"
}

run_mobile_suite() {
  local platform="$1"
  local main_game_name
  local join_code
  local draft_game_name
  local created_base_name="Base Alpha Edited"
  local updated_base_name="Base Alpha v2"
  local created_challenge_title="Find the Hidden Clue (Updated)"
  local updated_challenge_title="Find the Hidden Clue v2"
  local created_team_name="Team Eagle"
  local updated_team_name="Team Eagle Edited"
  local join_team_name="Team 0"
  local player_base_name="Base 0"
  local player_challenge_title="Challenge Text 0"

  main_game_name="$(load_run_context_value 'mainGameName')"
  join_code="$(load_run_context_value 'joinCodes[0]')"
  draft_game_name="${MAESTRO_DRAFT_GAME_NAME:-E2E Mobile ${E2E_RUN_ID}}"

  local -a passed=()
  local -a failed=()
  local -a skipped=()
  local setup_chain_broken=false

  # Helper: run a flow, track result, honour setup-chain dependencies
  run_tracked() {
    local label="$1"
    local is_setup_chain="$2"
    shift 2

    if [[ "$is_setup_chain" == "true" && "$setup_chain_broken" == "true" ]]; then
      echo "--- SKIP [$label] (setup chain broken) ---"
      skipped+=("$label")
      return
    fi

    echo "--- RUN [$label] ---"
    local rc=0
    run_maestro_test "$@" || rc=$?

    if (( rc == 0 )); then
      echo "--- PASS [$label] ---"
      passed+=("$label")
    else
      echo "--- FAIL [$label] (exit $rc) ---"
      failed+=("$label")
      if [[ "$is_setup_chain" == "true" ]]; then
        setup_chain_broken=true
      fi
    fi
  }

  # --- Setup chain (ordered; skip dependents on failure) ---
  run_tracked "operator-login"      true  "$platform" mobile/shared/positive/operator-login.yaml
  run_tracked "game-create"         true  "$platform" --env "GAME_NAME=$draft_game_name" mobile/shared/positive/game-create.yaml
  run_tracked "base-create-edit"    true  "$platform" --env "GAME_NAME=$draft_game_name" mobile/shared/positive/base-create-edit.yaml
  run_tracked "challenge-create-edit" true "$platform" --env "GAME_NAME=$draft_game_name" mobile/shared/positive/challenge-create-edit.yaml
  run_tracked "team-create"         true  "$platform" --env "GAME_NAME=$draft_game_name" --env "TEAM_NAME=$created_team_name" mobile/shared/positive/team-create.yaml
  run_tracked "assignment-linking"  true  "$platform" --env "GAME_NAME=$draft_game_name" --env "BASE_NAME=$created_base_name" --env "CHALLENGE_TITLE=$created_challenge_title" mobile/shared/positive/assignment-linking.yaml
  run_tracked "edit-entities"       true  "$platform" --env "GAME_NAME=$draft_game_name" --env "BASE_NAME=$created_base_name" --env "CHALLENGE_TITLE=$created_challenge_title" --env "TEAM_NAME=$created_team_name" --env "UPDATED_BASE_NAME=$updated_base_name" --env "UPDATED_CHALLENGE_TITLE=$updated_challenge_title" --env "UPDATED_TEAM_NAME=$updated_team_name" mobile/shared/positive/edit-entities.yaml
  run_tracked "game-activate"       true  "$platform" --env "GAME_NAME=$draft_game_name" mobile/shared/positive/game-activate.yaml

  # --- Independent flows (always run) ---
  run_tracked "invalid-login"         false "$platform" mobile/shared/negative/invalid-login.yaml
  run_tracked "monitoring"            false "$platform" --env "GAME_NAME=$main_game_name" mobile/shared/positive/monitoring.yaml
  run_tracked "export-import"         false "$platform" --env "GAME_NAME=$main_game_name" mobile/shared/positive/export-import.yaml
  run_tracked "operator-notification" false "$platform" --env "GAME_NAME=$main_game_name" mobile/shared/positive/operator-notification.yaml
  run_tracked "player-join"           false "$platform" --env "JOIN_CODE=$join_code" --env "JOIN_TEAM_NAME=$join_team_name" mobile/shared/positive/player-join.yaml
  run_tracked "player-progress"       false "$platform" --env "JOIN_CODE=$join_code" --env "BASE_NAME=$player_base_name" --env "CHALLENGE_TITLE=$player_challenge_title" mobile/shared/positive/player-progress.yaml
  run_tracked "player-submit"         false "$platform" --env "JOIN_CODE=$join_code" --env "BASE_NAME=$player_base_name" --env "CHALLENGE_TITLE=$player_challenge_title" mobile/shared/positive/player-submit.yaml
  run_tracked "submission-review"     false "$platform" --env "GAME_NAME=$main_game_name" mobile/shared/positive/submission-review.yaml
  run_tracked "business-rules"        false "$platform" mobile/shared/negative/business-rules.yaml
  run_tracked "delete-entities"       false "$platform" --env "GAME_NAME=$draft_game_name" --env "UPDATED_BASE_NAME=$updated_base_name" --env "UPDATED_CHALLENGE_TITLE=$updated_challenge_title" mobile/shared/positive/delete-entities.yaml

  # --- Summary ---
  echo ""
  echo "======================================"
  echo " Mobile Suite Summary ($platform)"
  echo "======================================"
  echo " PASSED  (${#passed[@]}): ${passed[*]:-none}"
  echo " FAILED  (${#failed[@]}): ${failed[*]:-none}"
  echo " SKIPPED (${#skipped[@]}): ${skipped[*]:-none}"
  echo "======================================"

  (( ${#failed[@]} == 0 ))
}

run_api()      { run_playwright --project=api; }
run_api_pos()  { run_playwright --project=api --grep-invert @negative; }
run_web()      { run_playwright --project=web; }
run_ios() {
  ensure_ios_simulator
  run_mobile_suite ios
  shutdown_ios_simulator_if_ours
}
run_android() {
  ensure_android_emulator
  run_mobile_suite android
  shutdown_android_emulator_if_ours
}

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
    ensure_ios_simulator
    run_managed_with_lifecycle run_maestro_test ios \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    shutdown_ios_simulator_if_ours
    ;;
  smoke:android)
    ensure_android_emulator
    run_managed_with_lifecycle run_maestro_test android \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    shutdown_android_emulator_if_ours
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
