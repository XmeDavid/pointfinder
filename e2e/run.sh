#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

CMD="${1:-help}"

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

run_api()      { npx playwright test --project=api; }
run_api_pos()  { npx playwright test --project=api --grep-invert @negative; }
run_web()      { npx playwright test --project=web; }
run_ios()      { maestro test --device-locale=en --format junit mobile/shared/; }
run_android()  { maestro test --device-locale=en --format junit mobile/shared/; }

# --- Commands ---
case "$CMD" in
  smoke)
    run_with_lifecycle npx playwright test --project=api --grep @smoke
    ;;
  smoke:web)
    run_with_lifecycle npx playwright test --project=web --grep @smoke
    ;;
  smoke:ios)
    run_with_lifecycle maestro test --device-locale=en --format junit \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    ;;
  smoke:android)
    run_with_lifecycle maestro test --device-locale=en --format junit \
      mobile/shared/positive/operator-login.yaml \
      mobile/shared/positive/game-create.yaml
    ;;
  api)
    run_with_lifecycle run_api
    ;;
  api:positive)
    run_with_lifecycle run_api_pos
    ;;
  web)
    run_with_lifecycle run_web
    ;;
  ios)
    run_with_lifecycle run_ios
    ;;
  android)
    run_with_lifecycle run_android
    ;;
  all)
    setup
    trap cleanup_trap EXIT
    run_api
    run_web
    run_ios
    run_android
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
    echo "Commands:"
    echo "  smoke          API smoke test (critical path)"
    echo "  smoke:web      Web smoke test (operator checks + API-assisted player)"
    echo "  smoke:ios      iOS smoke test (login + create game)"
    echo "  smoke:android  Android smoke test (login + create game)"
    echo "  api            Setup → API tests → teardown"
    echo "  api:positive   Setup → API positive only → teardown"
    echo "  web            Setup → web UI tests → teardown"
    echo "  ios            Setup → Maestro iOS flows → teardown"
    echo "  android        Setup → Maestro Android flows → teardown"
    echo "  all            Setup → API → web → iOS → Android → teardown"
    echo "  parity         Check scenario coverage across platforms"
    echo "  cleanup        Delete orphaned E2E games"
    ;;
esac
