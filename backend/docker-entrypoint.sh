#!/bin/sh
# Apply database migrations, then hand off to the CMD (uvicorn by default).
set -e

echo "Running database migrations..."
alembic upgrade head

exec "$@"
