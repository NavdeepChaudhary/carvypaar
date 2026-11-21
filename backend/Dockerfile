# ---- CarvyPaar API ----
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app \
    && sed -i 's/\r$//' /app/docker-entrypoint.sh \
    && chmod +x /app/docker-entrypoint.sh
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# --proxy-headers trusts X-Forwarded-For ONLY from FORWARDED_ALLOW_IPS (uvicorn reads the env
# var; default 127.0.0.1). Never "*" unless the API is reachable solely through your proxy,
# otherwise clients can spoof their IP and dodge rate limits. Workers: WEB_CONCURRENCY
# (more than 1 needs REDIS_URL for WebSocket fan-out, shared rate limits and lockouts).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
