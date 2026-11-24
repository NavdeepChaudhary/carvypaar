#!/bin/bash
# Entry point of the single-container image: migrate, then run API + web app + proxy.
# If any of the three exits, the container exits and the platform restarts it.
set -euo pipefail

export PORT="${PORT:-10000}"

# Render sets RENDER_EXTERNAL_URL (e.g. https://carvypaar.onrender.com). Use it as the
# public origin unless CORS_ORIGINS / PUBLIC_BASE_URL were set explicitly (custom domain).
if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export CORS_ORIGINS="${CORS_ORIGINS:-$RENDER_EXTERNAL_URL}"
  export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$RENDER_EXTERNAL_URL}"
fi

cd /app/backend
echo "Applying database migrations..."
alembic upgrade head

# Only the proxy is reachable from outside; uvicorn trusts X-Forwarded-For from it (127.0.0.1).
uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --no-server-header \
  --workers "${WEB_CONCURRENCY:-1}" &
API_PID=$!

(cd /app/web && HOSTNAME=127.0.0.1 PORT=3000 exec node server.js) &
WEB_PID=$!

caddy run --config /app/Caddyfile --adapter caddyfile &
PROXY_PID=$!

shutdown() { kill -TERM "$API_PID" "$WEB_PID" "$PROXY_PID" 2>/dev/null || true; wait || true; }
trap shutdown TERM INT

echo "CarVypaar is up on port $PORT"
# Wait for the first process to exit, then stop the rest (so the platform restarts us).
wait -n
status=$?
echo "A process exited (status $status); shutting down" >&2
shutdown
exit "$status"
