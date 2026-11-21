# ---- CarvyPaar API for Render (frontend on Vercel) ----
# Build context: repository root (needs backend/ and the trained model in ml/models/).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ENVIRONMENT=production COOKIE_SECURE=true \
    UPLOAD_DIR=/app/uploads PRICE_MODEL_PATH=/app/ml_models/price_model.joblib ML_DATA_DIR=/app/ml_data \
    # Render's load balancer (and Vercel's proxy in front of it) set X-Forwarded-For.
    FORWARDED_ALLOW_IPS=*

WORKDIR /app
COPY backend/requirements.txt requirements.txt
RUN pip install -r requirements.txt
COPY backend/ .
COPY ml/models/price_model.joblib ml_models/price_model.joblib
COPY deploy/render/api-start.sh start.sh

RUN useradd --create-home --uid 10001 app \
    && mkdir -p uploads ml_data \
    && sed -i 's/\r$//' start.sh && chmod +x start.sh \
    && chown -R app:app /app
USER app

ENV PORT=10000
EXPOSE 10000
CMD ["/app/start.sh"]
