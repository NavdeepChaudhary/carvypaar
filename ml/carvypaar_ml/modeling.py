"""Model definition, training and evaluation.

The saved bundle is a plain dict of scikit-learn estimators plus metadata, so
the backend can load it without importing this package:

    {"model": point estimator, "lower": 10th-percentile model, "upper": 90th-percentile model,
     "meta": {...}}

All three models predict log(price) (wrapped in TransformedTargetRegressor), so
errors scale with the car's value (₹50k matters on a hatchback, not on a Porsche).
"""
from __future__ import annotations

import json
import platform
from datetime import datetime, timezone
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, median_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder

from .schema import CATEGORICAL, FEATURES, METRICS_PATH, MODEL_PATH, NUMERIC, TARGET

INTERVAL = (0.10, 0.90)  # 80% prediction interval
MODEL_VERSION_PREFIX = "hgb"


def build_model(loss: str = "squared_error", quantile: float | None = None, seed: int = 42) -> TransformedTargetRegressor:
    encoder = OrdinalEncoder(
        handle_unknown="use_encoded_value",
        unknown_value=np.nan,          # unseen makes/models/cities -> "missing", handled natively
        encoded_missing_value=np.nan,
        min_frequency=3,               # very rare categories are grouped together
        max_categories=250,            # HistGradientBoosting supports at most 255 per feature
    )
    pre = ColumnTransformer(
        [("cat", encoder, CATEGORICAL), ("num", "passthrough", NUMERIC)],
        verbose_feature_names_out=False,
    )
    kwargs: dict[str, Any] = {"loss": loss}
    if quantile is not None:
        kwargs["quantile"] = quantile
    hgb = HistGradientBoostingRegressor(
        categorical_features=[True] * len(CATEGORICAL) + [False] * len(NUMERIC),
        learning_rate=0.06,
        max_iter=800,
        max_leaf_nodes=48,
        min_samples_leaf=20,
        l2_regularization=1.0,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=30,
        random_state=seed,
        **kwargs,
    )
    return TransformedTargetRegressor(regressor=Pipeline([("pre", pre), ("hgb", hgb)]), func=np.log, inverse_func=np.exp)


def _fit_all(X: pd.DataFrame, y: pd.Series, seed: int) -> dict[str, TransformedTargetRegressor]:
    return {
        "model": build_model(seed=seed).fit(X, y),
        "lower": build_model("quantile", INTERVAL[0], seed).fit(X, y),
        "upper": build_model("quantile", INTERVAL[1], seed).fit(X, y),
    }


def _baseline_mae(train: pd.DataFrame, test: pd.DataFrame) -> float:
    """Naive benchmark: median price of the same make+model (else make, else global)."""
    by_mm = train.groupby(["make", "model"])[TARGET].median()
    by_make = train.groupby("make")[TARGET].median()
    overall = train[TARGET].median()
    preds = [
        by_mm.get((r.make, r.model), by_make.get(r.make, overall))
        for r in test[["make", "model"]].itertuples(index=False)
    ]
    return float(mean_absolute_error(test[TARGET], preds))


def predict_interval(models: dict[str, Any], X: pd.DataFrame, adjust_log: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Point estimate plus calibrated interval. `adjust_log` widens (or narrows) both
    quantiles in log space; the backend applies exactly the same formula."""
    pred = models["model"].predict(X)
    lo = np.minimum(models["lower"].predict(X) * np.exp(-adjust_log), pred)
    hi = np.maximum(models["upper"].predict(X) * np.exp(adjust_log), pred)
    return pred, lo, hi


def conformal_adjustment(models: dict[str, Any], cal: pd.DataFrame) -> float:
    """Conformalized quantile regression (Romano et al., 2019).

    Raw quantile models are often over-confident. On a calibration split that the
    models never saw, score each car by how far its true price falls outside the
    raw [lower, upper] band (log space, negative = inside). The (1-α) quantile of
    those scores is the margin that makes the band cover ~80% of new cars."""
    X, y = cal[FEATURES], np.log(cal[TARGET].to_numpy())
    lo, hi = np.log(models["lower"].predict(X)), np.log(models["upper"].predict(X))
    scores = np.maximum(lo - y, y - hi)
    alpha = INTERVAL[0] + (1 - INTERVAL[1])
    n = len(scores)
    level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)  # finite-sample correction
    return float(np.quantile(scores, level, method="higher"))


def evaluate(models: dict[str, Any], test: pd.DataFrame, adjust_log: float = 0.0) -> dict[str, float]:
    X, y = test[FEATURES], test[TARGET].to_numpy()
    pred, lo, hi = predict_interval(models, X, adjust_log)
    return {
        "mae": float(mean_absolute_error(y, pred)),
        "median_ae": float(median_absolute_error(y, pred)),
        "mape": float(np.mean(np.abs(pred - y) / y)),
        "r2": float(r2_score(y, pred)),
        "r2_log": float(r2_score(np.log(y), np.log(pred))),
        "interval_coverage": float(np.mean((y >= lo) & (y <= hi))),  # should be close to 0.80
        "interval_width_pct": float(np.median((hi - lo) / pred)),
    }


def global_importance(model: Any, test: pd.DataFrame, seed: int, n: int = 2_000) -> dict[str, float]:
    sample = test.sample(min(n, len(test)), random_state=seed)
    result = permutation_importance(
        model, sample[FEATURES], np.log(sample[TARGET]),
        scoring=lambda est, X, y: r2_score(y, np.log(est.predict(X))),
        n_repeats=3, random_state=seed,
    )
    raw = dict(zip(FEATURES, np.clip(result.importances_mean, 0, None)))
    total = sum(raw.values()) or 1.0
    return {k: round(float(v / total), 4) for k, v in sorted(raw.items(), key=lambda kv: -kv[1])}


def _baseline_row(df: pd.DataFrame) -> dict[str, Any]:
    """A 'typical car' used to explain predictions (each feature is swapped to this value)."""
    known = df[df["location"] != "unknown"] if (df["location"] != "unknown").any() else df
    make, model = df.groupby(["make", "model"]).size().idxmax()
    row: dict[str, Any] = {"make": make, "model": model}
    for col in ["fuel_type", "transmission", "body_type", "condition"]:
        values = df.loc[df[col] != "unknown", col]
        row[col] = (values if len(values) else df[col]).mode().iat[0]
    row["location"] = known["location"].mode().iat[0]
    row["year"] = int(df["year"].median())
    row["mileage"] = int(df["mileage"].median())
    return row


def train(df: pd.DataFrame, *, sources: dict[str, int], seed: int = 42, test_size: float = 0.2, refit: bool = True) -> tuple[dict[str, Any], dict[str, Any]]:
    """Train on a fit split, calibrate the interval on a calibration split, evaluate
    on an untouched test split, then (by default) refit on all data.
    Returns (bundle, metadata)."""
    train_df, test_df = train_test_split(df, test_size=test_size, random_state=seed)
    fit_df, cal_df = train_test_split(train_df, test_size=0.2, random_state=seed)
    models = _fit_all(fit_df[FEATURES], fit_df[TARGET], seed)
    adjust_log = conformal_adjustment(models, cal_df)
    raw_coverage = evaluate(models, test_df)["interval_coverage"]
    metrics = evaluate(models, test_df, adjust_log)
    metrics["raw_interval_coverage"] = raw_coverage
    metrics["baseline_mae"] = _baseline_mae(train_df, test_df)
    importance = global_importance(models["model"], test_df, seed)

    if refit:
        models = _fit_all(df[FEATURES], df[TARGET], seed)

    trained_at = datetime.now(timezone.utc)
    encoder: OrdinalEncoder = models["model"].regressor_.named_steps["pre"].named_transformers_["cat"]
    known = {col: sorted(str(c) for c in cats) for col, cats in zip(CATEGORICAL, encoder.categories_)}
    meta = {
        "version": f"{MODEL_VERSION_PREFIX}-{trained_at:%Y%m%d%H%M%S}",
        "trained_at": trained_at.isoformat(),
        "sklearn_version": sklearn.__version__,
        "python_version": platform.python_version(),
        "features": FEATURES,
        "categorical": CATEGORICAL,
        "numeric": NUMERIC,
        "interval": list(INTERVAL),
        "interval_adjust_log": round(adjust_log, 6),  # conformal margin (see conformal_adjustment)
        "rows": int(len(df)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "sources": sources,
        "metrics": {k: round(v, 4) for k, v in metrics.items()},
        "feature_importance": importance,
        "baseline": _baseline_row(df),
        "known_values": {"make": known["make"], "model": known["model"], "location": known["location"]},
        "price_range": [int(df[TARGET].quantile(0.01)), int(df[TARGET].quantile(0.99))],
    }
    return {**models, "meta": meta}, meta


def save(bundle: dict[str, Any], path=MODEL_PATH, metrics_path=METRICS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    joblib.dump(bundle, tmp, compress=3)
    tmp.replace(path)  # atomic swap: the API never sees a half-written model
    meta = {k: v for k, v in bundle["meta"].items() if k != "known_values"}
    metrics_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
