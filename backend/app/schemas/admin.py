"""Admin dashboard schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import UserRole
from app.schemas.auction import AuctionState
from app.schemas.common import Money, UtcDatetime
from app.schemas.listing import ListingCard
from app.schemas.user import UserRead


class DailyPoint(BaseModel):
    date: str  # YYYY-MM-DD (UTC)
    listings: int
    users: int
    bids: int


class CountItem(BaseModel):
    label: str
    count: int


class AdminStats(BaseModel):
    users_total: int
    users_by_role: dict[str, int]
    users_new_7d: int
    users_new_prev_7d: int
    listings_by_status: dict[str, int]
    listings_new_7d: int
    listings_new_prev_7d: int
    pending_review: int
    auctions_by_status: dict[str, int]
    bids_total: int
    bids_7d: int
    gmv: Money  # sold fixed-price listings + winning auction bids
    gmv_7d: Money
    daily: list[DailyPoint]  # last 14 days
    top_makes: list[CountItem]  # active listings


class PublicStats(BaseModel):
    """Homepage counters (no sensitive data)."""

    active_listings: int
    live_auctions: int
    auctions_closed: int
    members: int


class AdminListingRow(BaseModel):
    listing: ListingCard
    seller_id: int
    seller_name: str
    seller_email: str
    seller_phone: str | None
    rejection_reason: str | None
    updated_at: UtcDatetime


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class AdminUserRow(BaseModel):
    user: UserRead
    listings: int
    bids: int
    last_login_at: UtcDatetime | None
    updated_at: UtcDatetime


class AdminSaleRow(BaseModel):
    listing_id: int
    title: str
    cover_image: str | None
    sold_via: Literal["auction", "offer", "direct"]
    sold_price: Money
    commission: Money
    seller_amount: Money
    seller_name: str
    buyer_id: int | None  # None: marked sold by the seller without a recorded buyer
    buyer_name: str | None
    buyer_email: str | None
    sold_at: UtcDatetime


class AdminSales(BaseModel):
    commission_pct: float
    cars_sold: int
    gross: Money
    commission: Money
    items: list[AdminSaleRow]


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None


class AdminAuctionRow(BaseModel):
    auction: AuctionState
    listing_id: int
    listing_title: str
    seller_name: str
    cover_image: str | None


AdminListingStatus = Literal["pending", "active", "sold", "rejected", "inactive", "all"]
