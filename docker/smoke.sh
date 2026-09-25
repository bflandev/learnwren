#!/bin/sh
# Self-hosting smoke check: builds and starts the stack, waits for the api
# behind nginx, and fetches the SPA shell. Exit 0 = the stack serves.
# Usage: docker/smoke.sh [--down]   (--down tears the stack down afterwards)
set -eu
PORT="${LEARNWREN_WEB_PORT:-8000}"
docker compose up -d --build
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null; then break; fi
  sleep 2
done
curl -sf "http://localhost:${PORT}/api/health" | grep -q '"status":"ok"'
curl -sf "http://localhost:${PORT}/" | grep -q '<app-root'
curl -sf "http://localhost:${PORT}/courses" | grep -q '<app-root'   # SPA fallback
echo "smoke: ok (http://localhost:${PORT})"
if [ "${1:-}" = "--down" ]; then docker compose down; fi
