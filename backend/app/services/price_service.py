"""AI price predictor: loads the model trained by ml/scripts/train.py and serves
estimates, calibrated 80% ranges, per-car explanations and deal ratings.

* Loading: the joblib bundle is read lazily and re-read whenever the file's
  modification time changes, so `python ml/scripts/train.py` takes effect
  without restarting the API. Training writes atomically, so a half-written
  file is never loaded.
* Explanations: for each feature group we swap the car's value for the
  "typical car" value stored at training time and measure how much the
  estimate moves. That's model-agnostic, needs no extra dependencies, and costs
  one batched predict call.
* Never fatal: if no model is available, listing endpoints just omit price
  badges, and /api/predict-price returns 503 with instructions.
"""
from __future__ import annotations

import logging
import re
import threading
from collections import OrderedDict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models import Listing, ListingType
from app.schemas.listing import ListingCard
from app.schemas.price import (
    Confidence,
    DealInsight,
    ModelInfo,
    PriceFactor,
    PriceInsight,
    PricePrediction,
    PriceRating,
)

logger = logging.getLogger("carvypaar.price")

UNKNOWN = "unknown"
FEATURE_ORDER = ["make", "model", "fuel_type", "transmission", "body_type", "condition", "location", "year", "mileage"]
CATEGORICAL = {"make", "model", "fuel_type", "transmission", "body_type", "condition", "location"}

# (key, label, columns swapped together)
FACTOR_GROUPS: list[tuple[str, str, tuple[str, ...]]] = [
    ("make_model", "Make & model", ("make", "model")),
    ("year", "Year", ("year",)),
    ("mileage", "Mileage", ("mileage",)),
    ("condition", "Condition", ("condition",)),
    ("fuel_type", "Fuel", ("fuel_type",)),
    ("transmission", "Transmission", ("transmission",)),
    ("body_type", "Body type", ("body_type",)),
    ("location", "Location", ("location",)),
]
MAX_FACTORS = 5
CACHE_SIZE = 5_000


class ModelUnavailable(RuntimeError):
    """No trained model on disk (or it couldn't be loaded)."""


def normalise_text(value: object) -> str:
    """Must match ml/carvypaar_ml/schema.py:normalise_text."""
    if value is None:
        return UNKNOWN
    text = re.sub(r"\s+", " ", str(value)).strip().lower()
    return text or UNKNOWN


@dataclass(frozen=True)
class Estimate:
    estimate: float
    low: float
    high: float


def _round_price(x: float) -> float:
    """Round to a believable figure: ₹1,000 under ₹10 L, else ₹5,000."""
    step = 1_000 if x < 1_000_000 else 5_000
    return float(max(step, round(x / step) * step))


class PricePredictor:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._bundle: dict[str, Any] | None = None
        self._mtime: float | None = None
        self._lock = threading.Lock()
        self._cache: OrderedDict[tuple[Any, ...], Estimate] = OrderedDict()

    # ------------------------------------------------------------ loading
    def configure(self, path: str | Path) -> None:
        with self._lock:
            self.path = Path(path)
            self._bundle, self._mtime = None, None
            self._cache.clear()

    def _ensure_loaded(self) -> dict[str, Any]:
        try:
            mtime = self.path.stat().st_mtime
        except FileNotFoundError:
            raise ModelUnavailable(
                "The price model hasn't been trained yet. Run: python ml/scripts/train.py"
            ) from None
        if self._bundle is not None and mtime == self._mtime:
            return self._bundle
        with self._lock:
            if self._bundle is None or mtime != self._mtime:
                import joblib  # heavy import, deferred until a prediction is needed

                try:
                    bundle = joblib.load(self.path)
                    assert {"model", "lower", "upper", "meta"} <= set(bundle)
                except Exception as exc:  # noqa: BLE001 - corrupt/incompatible file
                    logger.exception("Couldn't load price model from %s", self.path)
                    raise ModelUnavailable(f"The price model couldn't be loaded: {exc}") from None
                self._warn_on_version_mismatch(bundle["meta"])
                self._bundle, self._mtime = bundle, mtime
                self._cache.clear()
                logger.info("Loaded price model %s (%s rows)", bundle["meta"].get("version"), bundle["meta"].get("rows"))
        return self._bundle  # type: ignore[return-value]

    @staticmethod
    def _warn_on_version_mismatch(meta: dict[str, Any]) -> None:
        import sklearn

        trained_with = meta.get("sklearn_version")
        if trained_with and trained_with != sklearn.__version__:
            logger.warning("Price model was trained with scikit-learn %s but %s is installed; retrain to be safe.",
                           trained_with, sklearn.__version__)

    @property
    def available(self) -> bool:
        try:
            self._ensure_loaded()
            return True
        except ModelUnavailable:
            return False

    def meta(self) -> dict[str, Any]:
        return self._ensure_loaded()["meta"]

    # ------------------------------------------------------------ prediction
    @staticmethod
    def _row(features: dict[str, Any]) -> dict[str, Any]:
        row = {}
        for col in FEATURE_ORDER:
            value = features[col]
            if hasattr(value, "value"):  # enums
                value = value.value
            row[col] = normalise_text(value) if col in CATEGORICAL else int(value)
        return row

    def predict_rows(self, rows: Sequence[dict[str, Any]]) -> list[Estimate]:
        """Batch prediction on already-normalised rows."""
        if not rows:
            return []
        import numpy as np
        import pandas as pd

        bundle = self._ensure_loaded()
        frame = pd.DataFrame(list(rows), columns=bundle["meta"]["features"])
        adjust = float(bundle["meta"].get("interval_adjust_log", 0.0))
        est = bundle["model"].predict(frame)
        lo = np.minimum(bundle["lower"].predict(frame) * np.exp(-adjust), est)
        hi = np.maximum(bundle["upper"].predict(frame) * np.exp(adjust), est)
        return [Estimate(float(e), float(lo_), float(hi_)) for e, lo_, hi_ in zip(est, lo, hi)]

    def unseen_fields(self, row: dict[str, Any]) -> list[str]:
        known = self.meta().get("known_values", {})
        unseen = []
        for f in ("make", "model", "location"):
            values = set(known.get(f, []))
            # Datasets without that field (e.g. real data with no city) only know "unknown":
            # flagging every input as unseen would just be noise.
            if not values or values <= {UNKNOWN}:
                continue
            if row[f] not in values:
                unseen.append(f)
        return unseen

    def confidence(self, est: Estimate, unseen: list[str]) -> Confidence:
        if "make" in unseen or "model" in unseen:
            return "low"
        width = (est.high - est.low) / est.estimate
        return "high" if width < 0.30 else "medium" if width < 0.55 else "low"

    def explain(self, row: dict[str, Any], display: dict[str, str]) -> tuple[Estimate, list[PriceFactor]]:
        """Estimate plus the top factors pushing this car's price up or down."""
        baseline = self.meta()["baseline"]
        variants: list[dict[str, Any]] = [row]
        groups: list[tuple[str, str]] = []
        for key, label, cols in FACTOR_GROUPS:
            if all(row[c] == baseline[c] for c in cols):
                continue  # already typical: no effect to report
            variants.append({**row, **{c: baseline[c] for c in cols}})
            groups.append((key, label))
        preds = self.predict_rows(variants)
        actual = preds[0]
        factors = []
        for (key, label), swapped in zip(groups, preds[1:]):
            impact = actual.estimate - swapped.estimate
            if abs(impact) < max(1_000, actual.estimate * 0.005):
                continue  # negligible
            factors.append(PriceFactor(key=key, label=label, value=display[key], impact=round(impact, -2),
                                       direction="up" if impact > 0 else "down"))
        factors.sort(key=lambda f: -abs(f.impact))
        return actual, factors[:MAX_FACTORS]

    # ------------------------------------------------------------ public API
    def predict(self, features: dict[str, Any], asking_price: float | None = None) -> PricePrediction:
        row = self._row(features)
        display = _display_values(features)
        est, factors = self.explain(row, display)
        unseen = self.unseen_fields(row)
        rounded = Estimate(_round_price(est.estimate), _round_price(est.low), _round_price(est.high))
        meta = self.meta()
        return PricePrediction(
            estimated_price=rounded.estimate,
            low=rounded.low,
            high=rounded.high,
            interval=round(meta["interval"][1] - meta["interval"][0], 2),
            confidence=self.confidence(est, unseen),
            factors=factors,
            deal=deal_insight(asking_price, est) if asking_price else None,
            unseen=unseen,
            model_version=meta["version"],
        )

    def listing_insight(self, listing: Listing) -> PriceInsight:
        features = listing_features(listing)
        row = self._row(features)
        est, factors = self.explain(row, _display_values(features))
        is_sale = listing.listing_type == ListingType.SALE
        deal = deal_insight(float(listing.price), est) if is_sale else None
        return PriceInsight(
            estimated_price=_round_price(est.estimate),
            low=_round_price(est.low),
            high=_round_price(est.high),
            confidence=self.confidence(est, self.unseen_fields(row)),
            rating=deal.rating if deal else None,
            delta_pct=deal.delta_pct if deal else None,
            factors=factors,
            model_version=self.meta()["version"],
        )

    def estimates_for(self, listings: Iterable[Listing]) -> dict[int, Estimate]:
        """Cached batch estimates keyed by listing id (cache invalidates on edit or retrain)."""
        version = self.meta()["version"]
        out: dict[int, Estimate] = {}
        todo: list[tuple[tuple[Any, ...], Listing]] = []
        for listing in listings:
            key = (listing.id, str(listing.updated_at), version)
            hit = self._cache.get(key)
            if hit is not None:
                self._cache.move_to_end(key)
                out[listing.id] = hit
            else:
                todo.append((key, listing))
        if todo:
            ests = self.predict_rows([self._row(listing_features(item)) for _, item in todo])
            for (key, listing), est in zip(todo, ests):
                out[listing.id] = est
                self._cache[key] = est
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return out

    def model_info(self) -> ModelInfo:
        try:
            meta = self.meta()
        except ModelUnavailable as exc:
            return ModelInfo(available=False, message=str(exc))
        return ModelInfo(
            available=True,
            version=meta["version"],
            trained_at=meta["trained_at"],
            rows=meta["rows"],
            sources=meta["sources"],
            metrics=meta["metrics"],
            feature_importance=meta["feature_importance"],
            interval=round(meta["interval"][1] - meta["interval"][0], 2),
        )


# ---------------------------------------------------------------- helpers
def listing_features(listing: Listing) -> dict[str, Any]:
    return {col: getattr(listing, col) for col in FEATURE_ORDER}


def _display_values(f: dict[str, Any]) -> dict[str, str]:
    def v(x: Any) -> str:
        return str(getattr(x, "value", x)).replace("_", " ")

    return {
        "make_model": f"{f['make']} {f['model']}",
        "year": str(f["year"]),
        "mileage": f"{int(f['mileage']):,} km",
        "condition": v(f["condition"]).capitalize(),
        "fuel_type": v(f["fuel_type"]).upper() if v(f["fuel_type"]) in ("cng", "lpg") else v(f["fuel_type"]).capitalize(),
        "transmission": v(f["transmission"]).capitalize(),
        "body_type": v(f["body_type"]).upper() if v(f["body_type"]) == "suv" else v(f["body_type"]).capitalize(),
        "location": str(f["location"]),
    }


def rate_price(asking: float, est: Estimate) -> PriceRating:
    """Great deal: >=DEAL_GREAT_BELOW_PCT under the estimate or below the 80% range.
    Overpriced: >=DEAL_OVERPRICED_ABOVE_PCT over it or above the range. Otherwise fair."""
    ratio = asking / est.estimate
    if asking < est.low or ratio <= 1 - settings.DEAL_GREAT_BELOW_PCT / 100:
        return "great_deal"
    if asking > est.high or ratio >= 1 + settings.DEAL_OVERPRICED_ABOVE_PCT / 100:
        return "overpriced"
    return "fair"


def deal_insight(asking: float | None, est: Estimate) -> DealInsight | None:
    if asking is None:
        return None
    asking = float(asking)
    return DealInsight(
        rating=rate_price(asking, est),
        asking_price=asking,
        delta=round(asking - est.estimate, -2),
        delta_pct=round((asking - est.estimate) / est.estimate * 100, 1),
    )


def annotate_cards(cards: list[ListingCard], listings: Sequence[Listing]) -> list[ListingCard]:
    """Add AI estimate + deal badge to fixed-price cards. Never raises: search must
    keep working even if the model is missing or broken."""
    sale = [l for l in listings if l.listing_type == ListingType.SALE]
    if not sale:
        return cards
    try:
        ests = predictor.estimates_for(sale)
    except ModelUnavailable:
        return cards
    except Exception:  # noqa: BLE001
        logger.exception("Price annotation failed")
        return cards
    by_id = {l.id: l for l in sale}
    for card in cards:
        est = ests.get(card.id)
        if est is not None:
            card.estimated_price = _round_price(est.estimate)  # type: ignore[assignment]
            card.price_rating = rate_price(float(by_id[card.id].price), est)
    return cards


def insight_for(listing: Listing) -> PriceInsight | None:
    try:
        return predictor.listing_insight(listing)
    except ModelUnavailable:
        return None
    except Exception:  # noqa: BLE001
        logger.exception("Price insight failed for listing %s", listing.id)
        return None


predictor = PricePredictor(settings.PRICE_MODEL_PATH)
