"""ML pipeline tests: schema cleaning, Kaggle mapping, synthetic data, training, persistence."""
import joblib
import numpy as np
import pandas as pd
import pytest

from carvypaar_ml import cardekho, modeling
from carvypaar_ml.schema import COLUMNS, FEATURES, normalise_frame, normalise_text
from carvypaar_ml.synthetic import generate, market_price


@pytest.fixture(scope="module")
def synthetic() -> pd.DataFrame:
    return normalise_frame(generate(3_000, seed=1))


@pytest.fixture(scope="module")
def trained(synthetic):
    return modeling.train(synthetic, sources={"synthetic": len(synthetic)}, seed=1)


def test_normalise_text():
    assert normalise_text("  Maruti   SUZUKI ") == "maruti suzuki"
    assert normalise_text(None) == "unknown"
    assert normalise_text(float("nan")) == "unknown"


def test_normalise_frame_drops_bad_rows():
    df = pd.DataFrame([
        {"make": "BMW", "model": "X5", "year": 2020, "mileage": 30000, "fuel_type": "Diesel", "transmission": "automatic",
         "body_type": "suv", "condition": "good", "location": "Pune", "price": 6_000_000},
        {"make": "BMW", "model": "X5", "year": 1950, "mileage": 30000, "fuel_type": "diesel", "transmission": "automatic",
         "body_type": "suv", "condition": "good", "location": "Pune", "price": 6_000_000},  # too old
        {"make": "BMW", "model": "X5", "year": 2020, "mileage": -5, "fuel_type": "diesel", "transmission": "automatic",
         "body_type": "suv", "condition": "good", "location": "Pune", "price": 6_000_000},  # negative km
        {"make": "BMW", "model": "X5", "year": 2020, "mileage": 30000, "fuel_type": "diesel", "transmission": "automatic",
         "body_type": "suv", "condition": "good", "location": "Pune", "price": "n/a"},  # bad price
    ])
    out = normalise_frame(df)
    assert len(out) == 1 and out.loc[0, "fuel_type"] == "diesel" and out.loc[0, "make"] == "bmw"
    with pytest.raises(ValueError):
        normalise_frame(df.drop(columns=["price"]))


def test_synthetic_data_is_plausible(synthetic):
    assert list(synthetic.columns) == COLUMNS
    assert len(synthetic) > 2_900
    # Depreciation: older cars of the same model are cheaper on average.
    swift = synthetic[synthetic["model"] == "swift"]
    assert swift[swift["year"] >= swift["year"].max() - 1]["price"].median() > swift[swift["year"] <= swift["year"].max() - 8]["price"].median()
    # Market model sanity: more km or worse condition -> lower price.
    base = dict(new_price=1_000_000, retention=0.9, age=5, fuel="petrol", automatic=False, city="Pune")
    assert market_price(mileage=40_000, condition="good", **base) > market_price(mileage=140_000, condition="good", **base)
    assert market_price(mileage=50_000, condition="excellent", **base) > market_price(mileage=50_000, condition="fair", **base)


def test_cardekho_cleaning_maps_schema():
    raw = pd.DataFrame({
        "name": ["Maruti Swift Dzire VDI", "Land Rover Discovery Sport", "Hyundai Creta 1.6", "Tata Nano Std",
                 "Honda City", "Maruti Alto LX"],
        "year": [2014, 2017, 2018, 2012, 2018, 2007],
        "selling_price": [450000, 3500000, 1100000, 60000, 900000, 70000],
        "km_driven": [145500, 40000, 30000, 70000, 25000, 120000],
        "fuel": ["Diesel", "Diesel", "Petrol", "Petrol", "Electric-ish", "Petrol"],
        "seller_type": ["Individual"] * 6,
        "transmission": ["Manual", "Automatic", "Manual", "Manual", "Manual", "Manual"],
        "owner": ["First Owner", "Second Owner", "First Owner", "Third Owner", "First Owner", "Fourth & Above Owner"],
    })
    out = cardekho.clean(raw, reference_year=2026)
    assert len(out) == 5  # unknown fuel dropped
    swift = out[out["model"] == "swift"].iloc[0]
    assert swift["make"] == "maruti suzuki" and swift["body_type"] == "hatchback" and swift["location"] == "unknown"
    assert swift["year"] == 2014 + 6  # age preserved in today's terms
    assert swift["price"] == pytest.approx(450000 * 1.05 ** 6, rel=0.01)
    assert out[out["model"] == "discovery"].iloc[0]["make"] == "land rover"
    # Condition uses age at scrape time (2020): an 8-year-old third-owner car is "fair",
    # a 13-year-old fourth-owner car is "poor".
    assert out[out["model"] == "nano"].iloc[0]["condition"] == "fair"
    assert out[out["model"] == "alto"].iloc[0]["condition"] == "poor"
    with pytest.raises(ValueError):
        cardekho.clean(pd.DataFrame({"foo": [1]}))


def test_training_beats_baseline_and_interval_is_calibrated(trained):
    bundle, meta = trained
    m = meta["metrics"]
    # Small (3k-row) training set: raw-price R² is dominated by a few rare luxury cars,
    # so judge typical accuracy on the log scale. (The full 25k-row run reaches R² ≈ 0.985.)
    assert m["r2_log"] > 0.95
    assert m["mape"] < 0.15
    assert m["mae"] < m["baseline_mae"] / 2
    assert 0.7 <= m["interval_coverage"] <= 0.9  # ~80% after conformal calibration
    assert set(bundle) == {"model", "lower", "upper", "meta"}
    assert set(meta["baseline"]) == set(FEATURES)
    assert "swift" in meta["known_values"]["model"]


def test_bundle_roundtrip_and_prediction(trained, tmp_path):
    bundle, meta = trained
    path, metrics_path = tmp_path / "m.joblib", tmp_path / "m.json"
    modeling.save(bundle, path, metrics_path)
    loaded = joblib.load(path)
    row = pd.DataFrame([{"make": "hyundai", "model": "creta", "year": 2022, "mileage": 30000, "fuel_type": "diesel",
                         "transmission": "automatic", "body_type": "suv", "condition": "excellent", "location": "pune"}])
    pred, lo, hi = modeling.predict_interval(loaded, row, meta["interval_adjust_log"])
    assert lo[0] <= pred[0] <= hi[0]
    assert 700_000 < pred[0] < 2_500_000
    # Unknown categories don't crash (treated as missing).
    odd = row.assign(make="zzz", model="yyy", location="atlantis")
    assert np.isfinite(loaded["model"].predict(odd)).all()
    assert "known_values" not in metrics_path.read_text()
