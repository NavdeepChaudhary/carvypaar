"""Offers, contact messages and notifications."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import NotificationType, OfferStatus
from app.schemas.common import Money, UtcDatetime
from app.schemas.listing import MAX_PRICE
from app.schemas.user import PublicUser


def _strip_or_none(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


# ---------------------------------------------------------------- offers
class OfferCreate(BaseModel):
    amount: Decimal = Field(gt=0, le=MAX_PRICE, max_digits=12, decimal_places=2)
    message: str | None = Field(default=None, max_length=1000)

    _msg = field_validator("message", mode="before")(_strip_or_none)


class OfferStatusUpdate(BaseModel):
    """Sellers accept/reject; buyers withdraw."""

    status: Literal["accepted", "rejected", "withdrawn"]


class OfferRead(BaseModel):
    id: int
    listing_id: int
    listing_title: str
    listing_price: Money
    cover_image: str | None
    buyer: PublicUser
    amount: Money
    message: str | None
    status: OfferStatus
    created_at: UtcDatetime
    updated_at: UtcDatetime


# ---------------------------------------------------------------- messages
class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body", mode="before")
    @classmethod
    def _strip_body(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class MessageRead(BaseModel):
    id: int
    listing_id: int
    listing_title: str
    sender: PublicUser
    recipient: PublicUser
    body: str
    read_at: UtcDatetime | None
    created_at: UtcDatetime


# ---------------------------------------------------------------- notifications
class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    title: str
    body: str
    link: str | None
    data: dict[str, Any]
    is_read: bool
    created_at: UtcDatetime


class NotificationList(BaseModel):
    items: list[NotificationRead]
    unread_count: int
