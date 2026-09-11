#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.design.yml up -d --build
for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8188/actuator/health >/dev/null; then break; fi
  if [ "$attempt" = 60 ]; then echo 'Local backend did not become healthy'; exit 1; fi
  sleep 2
done
python3 scripts/init-design-storage.py
python3 scripts/seed-design.py
cd web
PF_LOCAL_DESIGN=1 bun run dev --host 0.0.0.0 --port 5188 --strictPort
