"""AI price predictor: endpoint, explanations, deal badges, hot reload, training export.

Trains a small real model with the ml/ package once per session, so this tests the
genuine train -> save -> load -> predict path, not a mock.
"""
import csv
import os
import sys
import time
from pathlib import Path

import pytest

from app.services import price_service
from tests.conftest import auth_header
from tests.test_listings import CAR, create_car

ML_ROOT = Path(__file__).resolve().parents[2] / "ml"


@pytest.fixture(scope="session")
def trained_model(tmp_path_factory) -> Path:
    sys.path.insert(0, str(ML_ROOT))
    from carvypaar_ml import modeling
    from carvypaar_ml.schema import normalise_frame
    from carvypaar_ml.synthetic import generate

    df = normalise_frame(generate(4_000, seed=3))
    bundle, _ = modeling.train(df, sources={"synthetic": len(df)}, seed=3)
    folder = tmp_path_factory.mktemp("model")
    path = folder / "price_model.joblib"
    modeling.save(bundle, path, folder / "metrics.json")
    return path


@pytest.fixture()
def model(trained_model):
    price_service.predictor.configure(trained_model)
    yield trained_model
    price_service.predictor.configure(price_service.settings.PRICE_MODEL_PATH)  # back to "no model"


CRETA = {
    "make": "Hyundai", "model": "Creta", "year": 2022, "mileage": 28000, "fuel_type": "diesel",
    "transmission": "automatic", "body_type": "suv", "condition": "excellent", "location": "Pune",
}


def test_503_without_model(client):
    res = client.post("/api/predict-price", json=CRETA)
    assert res.status_code == 503 and "train.py" in res.json()["detail"]
    assert client.get("/api/predict-price/model").json()["available"] is False


def test_prediction_shape_and_sanity(client, model):
    res = client.post("/api/predict-price", json=CRETA)
    assert res.status_code == 200, res.text
    p = res.json()
    assert p["low"] <= p["estimated_price"] <= p["high"]
    assert 800_000 < p["estimated_price"] < 2_500_000  # a 2022 Creta in INR
    assert p["interval"] == 0.8 and p["currency"] == "INR"
    assert p["confidence"] in ("high", "medium") and p["unseen"] == []
    assert 1 <= len(p["factors"]) <= 5
    impacts = [abs(f["impact"]) for f in p["factors"]]
    assert impacts == sorted(impacts, reverse=True)
    assert all(f["direction"] == ("up" if f["impact"] > 0 else "down") for f in p["factors"])
    assert p["deal"] is None


def test_prediction_responds_to_features(client, model):
    def est(**override):
        return client.post("/api/predict-price", json={**CRETA, **override}).json()["estimated_price"]

    assert est(year=2023) > est(year=2015)
    assert est(mileage=15_000) > est(mileage=160_000)
    assert est(condition="excellent") > est(condition="poor")
    assert est(make="Porsche", model="911 Carrera", body_type="coupe", fuel_type="petrol") > 5 * est()


def test_deal_ratings(client, model):
    base = client.post("/api/predict-price", json=CRETA).json()["estimated_price"]

    def rating(asking):
        return client.post("/api/predict-price", json={**CRETA, "asking_price": asking}).json()["deal"]

    great, fair, over = rating(base * 0.7), rating(base), rating(base * 1.4)
    assert great["rating"] == "great_deal" and great["delta_pct"] < -20
    assert fair["rating"] == "fair"
    assert over["rating"] == "overpriced" and over["delta"] > 0


def test_unseen_model_lowers_confidence(client, model):
    p = client.post("/api/predict-price", json={**CRETA, "make": "Zorbatron", "model": "Hover 9000"}).json()
    assert p["confidence"] == "low" and set(p["unseen"]) >= {"make", "model"}


@pytest.mark.parametrize("bad", [{"year": 1800}, {"mileage": -1}, {"fuel_type": "plutonium"},
                                 {"make": ""}, {"asking_price": 0}])
def test_validation(client, model, bad):
    assert client.post("/api/predict-price", json={**CRETA, **bad}).status_code == 422


def test_model_info(client, model):
    info = client.get("/api/predict-price/model").json()
    assert info["available"] and info["version"].startswith("hgb-")
    assert {"mae", "r2", "interval_coverage", "baseline_mae"} <= set(info["metrics"])
    assert info["sources"] == {"synthetic": info["rows"]}


def test_listing_badges_and_detail_insight(client, model, register_user):
    seller = register_user("seller@example.com", role="seller")
    token = seller["access_token"]
    est = client.post("/api/predict-price", json={
        "make": CAR["make"], "model": CAR["model"], "year": CAR["year"], "mileage": CAR["mileage"],
        "fuel_type": CAR["fuel_type"], "transmission": CAR["transmission"], "body_type": CAR["body_type"],
        "condition": CAR["condition"], "location": CAR["location"]}).json()["estimated_price"]
    cheap = create_car(client, token, price=round(est * 0.6), title="Bargain BMW M340i")
    pricey = create_car(client, token, price=round(est * 1.6), title="Optimistic BMW M340i")

    items = {i["id"]: i for i in client.get("/api/listings").json()["items"]}
    assert items[cheap["id"]]["price_rating"] == "great_deal"
    assert items[pricey["id"]]["price_rating"] == "overpriced"
    assert items[cheap["id"]]["estimated_price"] == pytest.approx(est, rel=0.02)

    insight = client.get(f"/api/listings/{cheap['id']}").json()["price_insight"]
    assert insight["rating"] == "great_deal" and insight["delta_pct"] < -30
    assert insight["factors"] and insight["low"] <= insight["estimated_price"] <= insight["high"]

    # Garage + favorites are annotated too.
    mine = client.get("/api/users/me/listings", headers=auth_header(token)).json()
    assert all(m["price_rating"] for m in mine)


def test_listings_work_without_model(client, register_user):
    seller = register_user("seller@example.com", role="seller")
    car = create_car(client, seller["access_token"])
    item = client.get("/api/listings").json()["items"][0]
    assert item["price_rating"] is None and item["estimated_price"] is None
    assert client.get(f"/api/listings/{car['id']}").json()["price_insight"] is None


def test_hot_reload_after_retrain(client, trained_model, tmp_path):
    import shutil

    import joblib

    path = tmp_path / "live.joblib"
    shutil.copy(trained_model, path)
    price_service.predictor.configure(path)
    try:
        v1 = client.get("/api/predict-price/model").json()["version"]
        bundle = joblib.load(path)
        bundle["meta"]["version"] = "hgb-retrained"
        time.sleep(0.05)
        joblib.dump(bundle, path)
        os.utime(path, (time.time() + 5, time.time() + 5))  # guarantee a new mtime on coarse filesystems
        v2 = client.get("/api/predict-price/model").json()["version"]
        assert v1 != v2 == "hgb-retrained"
    finally:
        price_service.predictor.configure(price_service.settings.PRICE_MODEL_PATH)


def test_export_training_data(client, register_user, db_session, tmp_path):
    from app.services.training_export import export_training_data

    seller = register_user("seller@example.com", role="seller")
    create_car(client, seller["access_token"])
    hidden = create_car(client, seller["access_token"], title="Hidden car for sale")
    client.patch(f"/api/listings/{hidden['id']}", json={"status": "inactive"}, headers=auth_header(seller["access_token"]))

    out = tmp_path / "marketplace.csv"
    assert export_training_data(db_session, out) == 1  # inactive listings are excluded
    row = next(csv.DictReader(out.open(encoding="utf-8")))
    assert row["make"] == "BMW" and float(row["price"]) == CAR["price"] and row["fuel_type"] == "petrol"
