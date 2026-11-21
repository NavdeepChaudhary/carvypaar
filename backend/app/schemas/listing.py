"""Listing request/response schemas and search filters."""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import BodyType, CarCondition, FuelType, ListingStatus, ListingType, Transmission
from app.schemas.common import MAX_PRICE, Money, UtcDatetime
from app.schemas.price import PriceInsight, PriceRating
from app.schemas.user import PublicUser

MAX_FEATURES = 30
MAX_FEATURE_LEN = 50


# ---------------------------------------------------------------- validators
def _collapse_ws(v: Any) -> Any:
    """Trim and collapse internal whitespace: '  BMW   M3 ' -> 'BMW M3'."""
    return re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else v


def _check_year(v: int | None) -> int | None:
    if v is not None and v > date.today().year + 1:
        raise ValueError(f"Year cannot be later than {date.today().year + 1}")
    return v


def _clean_features(v: Any) -> Any:
    if v is None or not isinstance(v, list):
        return v
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in v:
        if not isinstance(raw, str):
            raise ValueError("Features must be text")
        item = _collapse_ws(raw)
        if not item:
            continue
        if len(item) > MAX_FEATURE_LEN:
            raise ValueError(f"Each feature must be at most {MAX_FEATURE_LEN} characters")
        if item.lower() not in seen:
            seen.add(item.lower())
            cleaned.append(item)
    if len(cleaned) > MAX_FEATURES:
        raise ValueError(f"At most {MAX_FEATURES} features")
    return cleaned


def _strip(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


_TEXT_FIELDS = ("title", "make", "model", "color", "location")


# ---------------------------------------------------------------- write models
class ListingCreate(BaseModel):
    title: str = Field(min_length=5, max_length=150)
    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1886)
    mileage: int = Field(ge=0, le=2_000_000, description="Kilometres driven")
    fuel_type: FuelType
    transmission: Transmission
    body_type: BodyType
    condition: CarCondition
    color: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=2, max_length=120)
    price: Decimal = Field(gt=0, le=MAX_PRICE, max_digits=12, decimal_places=2)
    description: str = Field(default="", max_length=5000)
    features: list[str] = Field(default_factory=list)

    _ws = field_validator(*_TEXT_FIELDS, mode="before")(_collapse_ws)
    _desc = field_validator("description", mode="before")(_strip)
    _year = field_validator("year")(_check_year)
    _features = field_validator("features", mode="before")(_clean_features)


class ListingUpdate(BaseModel):
    """Partial update. `status` lets owners hide, relist or mark a car as sold."""

    title: str | None = Field(default=None, min_length=5, max_length=150)
    make: str | None = Field(default=None, min_length=1, max_length=60)
    model: str | None = Field(default=None, min_length=1, max_length=60)
    year: int | None = Field(default=None, ge=1886)
    mileage: int | None = Field(default=None, ge=0, le=2_000_000)
    fuel_type: FuelType | None = None
    transmission: Transmission | None = None
    body_type: BodyType | None = None
    condition: CarCondition | None = None
    color: str | None = Field(default=None, min_length=1, max_length=40)
    location: str | None = Field(default=None, min_length=2, max_length=120)
    price: Decimal | None = Field(default=None, gt=0, le=MAX_PRICE, max_digits=12, decimal_places=2)
    description: str | None = Field(default=None, max_length=5000)
    features: list[str] | None = None
    status: Literal["active", "inactive", "sold"] | None = None

    _ws = field_validator(*_TEXT_FIELDS, mode="before")(_collapse_ws)
    _desc = field_validator("description", mode="before")(_strip)
    _year = field_validator("year")(_check_year)
    _features = field_validator("features", mode="before")(_clean_features)


class ImageOrder(BaseModel):
    image_ids: list[int] = Field(min_length=1, max_length=50)


# ---------------------------------------------------------------- read models
class ImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    position: int


class ListingCard(BaseModel):
    """Compact shape for grids and lists."""

    id: int
    title: str
    make: str
    model: str
    year: int
    mileage: int
    fuel_type: FuelType
    transmission: Transmission
    body_type: BodyType
    condition: CarCondition
    location: str
    price: Money
    listing_type: ListingType
    status: ListingStatus
    cover_image: str | None
    image_count: int
    views_count: int
    created_at: UtcDatetime
    is_favorite: bool = False
    auction_id: int | None = None  # set while the listing is (or was) sold by auction
    estimated_price: Money | None = None  # AI estimate (fixed-price listings, when a model is trained)
    price_rating: PriceRating | None = None


class ListingDetail(ListingCard):
    color: str
    description: str
    features: list[str]
    images: list[ImageRead]
    seller: PublicUser
    favorites_count: int
    updated_at: UtcDatetime
    is_owner: bool = False
    price_insight: PriceInsight | None = None


class MakeModels(BaseModel):
    make: str
    count: int
    models: list[str]


# ---------------------------------------------------------------- search
SortOption = Literal["newest", "oldest", "price_asc", "price_desc", "year_desc", "year_asc", "mileage_asc"]


class ListingFilters(BaseModel):
    """Query parameters for GET /api/listings."""

    model_config = ConfigDict(extra="ignore")

    q: str | None = Field(default=None, max_length=100)
    make: str | None = Field(default=None, max_length=60)
    model: str | None = Field(default=None, max_length=60)
    min_price: Decimal | None = Field(default=None, ge=0)
    max_price: Decimal | None = Field(default=None, ge=0)
    min_year: int | None = Field(default=None, ge=1886, le=2100)
    max_year: int | None = Field(default=None, ge=1886, le=2100)
    max_mileage: int | None = Field(default=None, ge=0)
    fuel_type: FuelType | None = None
    transmission: Transmission | None = None
    body_type: BodyType | None = None
    condition: CarCondition | None = None
    location: str | None = Field(default=None, max_length=120)
    listing_type: ListingType | None = None
    seller_id: int | None = Field(default=None, ge=1)
    sort: SortOption = "newest"
    page: int = Field(default=1, ge=1, le=10_000)
    page_size: int = Field(default=12, ge=1, le=48)

    @field_validator("q", "make", "model", "location", mode="before")
    @classmethod
    def _blank_to_none(cls, v: Any) -> Any:
        v = _collapse_ws(v)
        return v or None

    @model_validator(mode="after")
    def _ranges(self) -> "ListingFilters":
        if self.min_price is not None and self.max_price is not None and self.min_price > self.max_price:
            raise ValueError("min_price cannot exceed max_price")
        if self.min_year is not None and self.max_year is not None and self.min_year > self.max_year:
            raise ValueError("min_year cannot exceed max_year")
        return self
