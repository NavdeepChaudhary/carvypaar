# ---- CarVypaar: single-container production image ----
# Web app (Next.js) + API (FastAPI) behind Caddy on ONE port and origin, for platforms
# that run one container per service (Render, Railway, Fly.io, Koyeb, ...).
#   / -> Next.js     /api/*, /api/ws/*, /uploads/* -> FastAPI
# One origin keeps the refresh cookie first-party (works in Safari too) and needs no CORS.
# (Self-hosting on a VPS? docker-compose.prod.yml runs these as separate containers.)

# 1) Build the web app. NEXT_PUBLIC_API_URL="" = "same origin": the browser calls /api on
#    whatever host served the page, so one image works on any domain.
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_PUBLIC_API_URL="" NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2) Runtime: Python for the API, plus the Node binary and Caddy (a static Go binary).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    ENVIRONMENT=production COOKIE_SECURE=true \
    UPLOAD_DIR=/app/uploads PRICE_MODEL_PATH=/app/ml_models/price_model.joblib ML_DATA_DIR=/app/ml_data \
    XDG_DATA_HOME=/app/.caddy XDG_CONFIG_HOME=/app/.caddy
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=caddy:2.8-alpine /usr/bin/caddy /usr/bin/caddy

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ backend/
COPY ml/models/price_model.joblib ml_models/price_model.joblib
COPY --from=web /web/.next/standalone web/
COPY --from=web /web/.next/static web/.next/static
COPY --from=web /web/public web/public
COPY deploy/render/Caddyfile Caddyfile
COPY deploy/render/start.sh start.sh

RUN useradd --create-home --uid 10001 app \
    && mkdir -p uploads ml_data .caddy \
    && sed -i 's/\r$//' start.sh && chmod +x start.sh \
    && chown -R app:app /app
USER app

# Platforms inject PORT (Render: 10000). Caddy listens there; the API and web app stay on localhost.
ENV PORT=10000
EXPOSE 10000
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
    CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health').status==200 else 1)"
CMD ["/app/start.sh"]
