"""AI price prediction schemas."""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import BodyType, CarCondition, FuelType, Transmission
from app.schemas.common import MAX_PRICE, Money, UtcDatetime

PriceRating = Literal["great_deal", "fair", "overpriced"]
Confidence = Literal["high", "medium", "low"]


class PricePredictRequest(BaseModel):
    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1990, le=2100)
    mileage: int = Field(ge=0, le=2_000_000)
    fuel_type: FuelType
    transmission: Transmission
    body_type: BodyType
    condition: CarCondition
    location: str = Field(min_length=2, max_length=120)
    asking_price: Decimal | None = Field(default=None, gt=0, le=MAX_PRICE, max_digits=12, decimal_places=2)

    @field_validator("make", "model", "location", mode="before")
    @classmethod
    def _clean(cls, v: Any) -> Any:
        return re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else v


class PriceFactor(BaseModel):
    key: str
    label: str  # "Mileage"
    value: str  # "85,000 km"
    impact: Money  # ₹ effect vs a typical car (positive raises the price)
    direction: Literal["up", "down"]


class DealInsight(BaseModel):
    rating: PriceRating
    asking_price: Money
    delta: Money  # asking - estimate
    delta_pct: float  # (asking - estimate) / estimate * 100


class PricePrediction(BaseModel):
    estimated_price: Money
    low: Money
    high: Money
    interval: float  # 0.8 -> 80% prediction interval
    confidence: Confidence
    factors: list[PriceFactor]
    deal: DealInsight | None
    unseen: list[str]  # inputs the model has never seen (e.g. a rare model)
    model_version: str
    currency: Literal["INR"] = "INR"


class PriceInsight(BaseModel):
    """Attached to listing detail responses."""

    estimated_price: Money
    low: Money
    high: Money
    confidence: Confidence
    rating: PriceRating | None  # None for auctions (the price is set by bidding)
    delta_pct: float | None
    factors: list[PriceFactor]
    model_version: str


class ModelInfo(BaseModel):
    available: bool
    version: str | None = None
    trained_at: UtcDatetime | None = None
    rows: int | None = None
    sources: dict[str, int] | None = None
    metrics: dict[str, float] | None = None
    feature_importance: dict[str, float] | None = None
    interval: float | None = None
    message: str | None = None
