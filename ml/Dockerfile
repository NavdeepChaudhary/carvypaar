# ---- CarVypaar ML trainer (one-shot job) ----
# Same Python minor version and scikit-learn as the backend image, so the
# pickled model loads there without compatibility issues.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /ml

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN useradd --create-home --uid 10001 mluser && chown -R mluser:mluser /ml
USER mluser

# Default: train only if no model exists yet (keeps `docker compose up` fast).
# Retrain any time with:  docker compose run --rm ml python scripts/train.py
CMD ["python", "scripts/train.py", "--if-missing"]
