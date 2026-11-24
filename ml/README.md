# CarVypaar ML: AI price predictor

Predicts a used car's market price in INR, with a **calibrated 80% price range**,
the **top factors** behind the estimate, and a **deal rating** for listings.

```
ml/
├── carvypaar_ml/
│   ├── schema.py       # the training schema + text normalisation (shared contract with the API)
│   ├── synthetic.py    # synthetic Indian market generator (documented price model)
│   ├── cardekho.py     # cleans the public Kaggle CarDekho dataset into the schema
│   └── modeling.py     # model, conformal calibration, evaluation, save
├── scripts/
│   ├── generate_synthetic.py
│   ├── download_data.py
│   └── train.py        # train / retrain (writes models/price_model.joblib + metrics.json)
├── tests/test_ml.py
├── data/raw/           # downloaded Kaggle files (git-ignored)
├── data/processed/     # synthetic.csv, cardekho.csv, marketplace.csv (git-ignored)
└── models/             # price_model.joblib, metrics.json
```

## Quick start

```powershell
cd ml
pip install -r requirements.txt     # or reuse backend/.venv, which already has these
python scripts/train.py             # ~25 s; generates synthetic data on first run
pytest                              # 6 pipeline tests
```

The API hot-reloads the model on its next request after training, so there's no restart.

## Data sources

| Source | Command | Notes |
|--------|---------|-------|
| Synthetic (default) | `python scripts/generate_synthetic.py --rows 25000` | All 9 features. Prices from an explicit market model (depreciation by brand, mileage vs ~11k km/yr, condition, fuel, gearbox, city, ±8% noise). |
| Kaggle CarDekho | `python scripts/download_data.py` | [nehalbirla/vehicle-dataset-from-cardekho](https://www.kaggle.com/datasets/nehalbirla/vehicle-dataset-from-cardekho), real Indian listings in INR. Needs Kaggle credentials, or download the zip manually into `data/raw/`. It has no body type, condition or city: body type is looked up from the model name, condition is inferred from ownership and age, and city becomes `unknown`. Years are shifted from the 2020 scrape date, keeping each car's age, and prices are inflated 5%/yr. |
| Marketplace | `cd backend; python -m app.cli export-training-data` | Live and sold CarVypaar listings. Sold auctions use the hammer price. |

`python scripts/train.py` (`--source auto`) combines every source that exists.
Use `--source synthetic` or `--source cardekho` to train on a single source.

## Model

* **Features:** make, model, year, mileage, fuel_type, transmission, body_type, condition, location.
* **Estimator:** scikit-learn `HistGradientBoostingRegressor` with native categorical
  support. Unseen makes, models and cities are treated as missing, so they never crash a prediction.
  It is trained on **log(price)**, so errors scale with the car's value.
* **Price range:** two quantile models (10th and 90th percentile), then **conformalized quantile
  regression** (Romano et al., 2019). A calibration split measures how far real prices fall outside
  the raw band, and the band is widened until it truly covers ~80% of new cars. Raw quantile models
  only covered ~67%.
* **Top factors:** for each feature group, the car's value is swapped for a "typical car" value and
  we measure the change in the estimate (one batched prediction). It's model-agnostic and needs no SHAP dependency.
* **Deal rating:** **great deal** if the asking price is ≥10% under the estimate or below the range;
  **overpriced** if it's ≥12% over or above the range; otherwise **fair**
  (`DEAL_GREAT_BELOW_PCT`, `DEAL_OVERPRICED_ABOVE_PCT` in the backend config).

## Current model: real data

Trained on **6,923 real Indian used-car listings** (Kaggle CarDekho, cleaned from 8,128 rows).
`python scripts/train.py` uses real data whenever it's present. Synthetic data is only a
fallback for when no real data exists, so made-up prices never mix with real ones.

| Metric (20% hold-out) | Value |
|--------|-------|
| MAPE | ≈ 17.6% |
| MAE | ≈ ₹1.24 L (naive make+model median: ₹2.07 L) |
| R² | ≈ 0.79 (0.90 on log price) |
| 80% range coverage | ≈ 78% (67% before conformal calibration). Ranges are honestly wide, about ±24% |

**Known limits of this dataset:**
- It's a **2020 snapshot**. Years are shifted so each car keeps its age (and prices are
  inflated 5%/yr), but the model has never seen post-2020 generations or price jumps.
  Models that held their value strongly, such as the Fortuner, are **undervalued**. These usually come back with low confidence and a wide range.
- It has **no city information**, so location doesn't affect estimates.
- It's mostly mass-market cars, so luxury models are thin and get "low confidence".

**The fix is more recent data.** As real listings accumulate on CarVypaar, run
`python -m app.cli export-training-data` followed by `python scripts/train.py`. The marketplace export is
combined with the Kaggle data automatically.

## Retraining

```powershell
cd backend; python -m app.cli export-training-data   # optional: include real listings
cd ..\ml;   python scripts/train.py
```

In Docker: `docker compose run --rm ml python scripts/train.py`. The `ml` service also trains
automatically on the first `docker compose up` if no model exists yet.

**Version pinning:** `scikit-learn` is pinned to the same exact version here and in
`backend/requirements.txt`, because pickled models aren't guaranteed to load across versions.
The bundle records the version it was trained with, and the API logs a warning on mismatch.
