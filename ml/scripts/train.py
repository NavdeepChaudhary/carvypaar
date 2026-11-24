"""Train (or retrain) the CarVypaar price model.

    python scripts/train.py                      # auto: REAL data (Kaggle + marketplace) if present, else synthetic
    python scripts/train.py --source synthetic   # synthetic only
    python scripts/train.py --source cardekho    # Kaggle data only (run download_data.py first)
    python scripts/train.py --if-missing         # no-op if a model already exists (used by docker-compose)

Data sources (all in ml/data/processed/, all in the same schema):
    synthetic.csv    generated market data (scripts/generate_synthetic.py)
    cardekho.csv     cleaned Kaggle data (scripts/download_data.py)
    marketplace.csv  real CarVypaar listings (backend: python -m app.cli export-training-data)

Outputs ml/models/price_model.joblib and ml/models/metrics.json. The API hot-reloads
the new model on its next prediction; no restart needed.
"""
from __future__ import annotations

import argparse
import sys
import time

import pandas as pd

import _bootstrap  # noqa: F401

from carvypaar_ml.modeling import save, train
from carvypaar_ml.schema import CARDEKHO_CSV, MARKETPLACE_CSV, METRICS_PATH, MODEL_PATH, SYNTHETIC_CSV, normalise_frame
from carvypaar_ml.synthetic import generate


def load_sources(source: str, synthetic_rows: int, seed: int) -> tuple[pd.DataFrame, dict[str, int]]:
    frames: dict[str, pd.DataFrame] = {}
    # "auto" never mixes made-up prices into real ones: synthetic data is only a fallback
    # for when no real data (Kaggle download or marketplace export) exists yet.
    has_real = CARDEKHO_CSV.exists() or MARKETPLACE_CSV.exists()
    if source == "synthetic" or (source == "auto" and not has_real):
        if not SYNTHETIC_CSV.exists():
            print(f"Generating {synthetic_rows:,} synthetic rows...")
            SYNTHETIC_CSV.parent.mkdir(parents=True, exist_ok=True)
            normalise_frame(generate(synthetic_rows, seed)).to_csv(SYNTHETIC_CSV, index=False)
        frames["synthetic"] = pd.read_csv(SYNTHETIC_CSV)
    if source in ("auto", "cardekho"):
        if CARDEKHO_CSV.exists():
            frames["cardekho"] = pd.read_csv(CARDEKHO_CSV)
        elif source == "cardekho":
            sys.exit(f"{CARDEKHO_CSV} not found. Run: python scripts/download_data.py")
    if source == "auto" and MARKETPLACE_CSV.exists():
        frames["marketplace"] = pd.read_csv(MARKETPLACE_CSV)

    cleaned = {name: normalise_frame(df) for name, df in frames.items()}
    cleaned = {k: v for k, v in cleaned.items() if len(v)}
    if not cleaned:
        sys.exit("No training data available.")
    return pd.concat(cleaned.values(), ignore_index=True), {k: len(v) for k, v in cleaned.items()}


def fmt_inr(x: float) -> str:
    return f"₹{x:,.0f}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["auto", "synthetic", "cardekho"], default="auto")
    parser.add_argument("--synthetic-rows", type=int, default=25_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-refit", action="store_true", help="Keep the train-split model (skip refit on all data)")
    parser.add_argument("--if-missing", action="store_true", help="Exit 0 without training if a model exists")
    args = parser.parse_args()

    if args.if_missing and MODEL_PATH.exists():
        print(f"Model already present at {MODEL_PATH}; skipping training (use without --if-missing to retrain).")
        return 0

    df, sources = load_sources(args.source, args.synthetic_rows, args.seed)
    print(f"Training on {len(df):,} rows from {sources}")
    started = time.perf_counter()
    bundle, meta = train(df, sources=sources, seed=args.seed, refit=not args.no_refit)
    save(bundle)
    m = meta["metrics"]

    print(f"\nTrained {meta['version']} in {time.perf_counter() - started:.1f}s (hold-out: {meta['test_rows']:,} rows)")
    print(f"  MAE               {fmt_inr(m['mae']):>14}   (naive make+model median: {fmt_inr(m['baseline_mae'])})")
    print(f"  Median abs error  {fmt_inr(m['median_ae']):>14}")
    print(f"  MAPE              {m['mape']:>14.1%}")
    print(f"  R²                {m['r2']:>14.4f}   (on log price: {m['r2_log']:.4f})")
    print(f"  80% interval      {m['interval_coverage']:>14.1%} of hold-out prices fell inside "
          f"(median width {m['interval_width_pct']:.0%} of the estimate; "
          f"{m['raw_interval_coverage']:.1%} before conformal calibration)")
    print("  Feature importance:", ", ".join(f"{k} {v:.0%}" for k, v in meta["feature_importance"].items()))
    if set(sources) == {"synthetic"}:
        print("\n  Note: synthetic-only metrics measure how well the pipeline recovers a known market model,"
              "\n  not real-world accuracy. Add Kaggle or marketplace data for that.")
    print(f"\nSaved {MODEL_PATH}\n      {METRICS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
