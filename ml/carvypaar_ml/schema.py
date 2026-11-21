"""The training schema shared by every data source and by the backend at inference.

Every dataset is converted to exactly these columns before training. Categorical
values are normalised with `normalise_text` (lower-case, single spaces); the
backend applies the same rule (app/services/price_service.py) before predicting.
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

ML_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ML_ROOT / "data" / "raw"
PROCESSED_DIR = ML_ROOT / "data" / "processed"
MODELS_DIR = ML_ROOT / "models"
MODEL_PATH = MODELS_DIR / "price_model.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"

SYNTHETIC_CSV = PROCESSED_DIR / "synthetic.csv"
CARDEKHO_CSV = PROCESSED_DIR / "cardekho.csv"
MARKETPLACE_CSV = PROCESSED_DIR / "marketplace.csv"  # exported from the live DB (backend CLI)

CATEGORICAL = ["make", "model", "fuel_type", "transmission", "body_type", "condition", "location"]
NUMERIC = ["year", "mileage"]
FEATURES = CATEGORICAL + NUMERIC
TARGET = "price"
COLUMNS = FEATURES + [TARGET]

# Allowed values mirror the backend enums (app/models/enums.py). "unknown" is
# only produced by external datasets that lack a field.
FUEL_TYPES = {"petrol", "diesel", "electric", "hybrid", "cng", "lpg"}
TRANSMISSIONS = {"manual", "automatic", "semi_automatic"}
BODY_TYPES = {"sedan", "hatchback", "suv", "coupe", "convertible", "wagon", "pickup", "van", "minivan"}
CONDITIONS = {"new", "excellent", "good", "fair", "poor"}
UNKNOWN = "unknown"

MIN_PRICE, MAX_PRICE = 30_000, 50_000_000
MIN_YEAR = 1990


def normalise_text(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return UNKNOWN
    text = re.sub(r"\s+", " ", str(value)).strip().lower()
    return text or UNKNOWN


def normalise_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce types, normalise categoricals and drop rows that can't be trained on."""
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")
    out = df[COLUMNS].copy()
    for col in CATEGORICAL:
        out[col] = out[col].map(normalise_text)
    out["year"] = pd.to_numeric(out["year"], errors="coerce")
    out["mileage"] = pd.to_numeric(out["mileage"], errors="coerce")
    out[TARGET] = pd.to_numeric(out[TARGET], errors="coerce")
    max_year = pd.Timestamp.now().year + 1
    out = out.dropna(subset=["year", "mileage", TARGET])
    out = out[
        out["year"].between(MIN_YEAR, max_year)
        & out["mileage"].between(0, 1_000_000)
        & out[TARGET].between(MIN_PRICE, MAX_PRICE)
    ]
    out["year"] = out["year"].astype(int)
    out["mileage"] = out["mileage"].astype(int)
    return out.reset_index(drop=True)
