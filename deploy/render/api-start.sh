#!/bin/sh
# Start the CarvyPaar API on Render: migrate, then serve on $PORT.
set -eu

# Photo URLs point straight at this service (RENDER_EXTERNAL_URL, e.g. https://carvypaar-api.onrender.com).
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT:-10000}}}"

echo "Applying database migrations..."
alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" \
  --proxy-headers --no-server-header --workers "${WEB_CONCURRENCY:-1}"
