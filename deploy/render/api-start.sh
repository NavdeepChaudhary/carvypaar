#!/bin/sh
# Start the CarVypaar API on Render: migrate, then serve on $PORT.
set -eu

# Photo URLs point straight at this service (RENDER_EXTERNAL_URL, e.g. https://carvypaar-api.onrender.com).
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT:-10000}}}"

echo "Applying database migrations..."
alembic upgrade head

# Free Render instances have no shell, so the first admin can be created from env vars.
# Idempotent: an existing account is only (re)promoted to admin; its password is never changed.
if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  python -m app.cli create-admin --email "$BOOTSTRAP_ADMIN_EMAIL" --name "${BOOTSTRAP_ADMIN_NAME:-Administrator}"     --password "$BOOTSTRAP_ADMIN_PASSWORD" || echo "Admin bootstrap skipped (see error above)" >&2
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" \
  --proxy-headers --no-server-header --workers "${WEB_CONCURRENCY:-1}"
