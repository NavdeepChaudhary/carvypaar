"""Auction and bid schemas (shared by REST responses and WebSocket events)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import AuctionStatus
from app.schemas.common import Money, UtcDatetime
from app.schemas.listing import MAX_PRICE, ListingCard, ListingDetail

_money = dict(gt=0, le=MAX_PRICE, max_digits=12, decimal_places=2)


class AuctionCreate(BaseModel):
    starting_price: Decimal = Field(**_money)
    reserve_price: Decimal | None = Field(default=None, **_money)
    bid_increment: Decimal = Field(gt=0, le=Decimal("10000000"), max_digits=12, decimal_places=2)
    start_time: datetime | None = Field(default=None, description="Omit to start immediately")
    end_time: datetime

    @field_validator("start_time", "end_time")
    @classmethod
    def _to_utc(cls, v: datetime | None) -> datetime | None:
        """Naive datetimes are treated as UTC; aware ones are converted to UTC."""
        if v is None:
            return v
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)

    @model_validator(mode="after")
    def _check(self) -> "AuctionCreate":
        if self.reserve_price is not None and self.reserve_price < self.starting_price:
            raise ValueError("Reserve price can't be lower than the starting price")
        if self.start_time is not None and self.end_time <= self.start_time:
            raise ValueError("End time must be after start time")
        return self


class BidCreate(BaseModel):
    amount: Decimal = Field(**_money)


class BidderInfo(BaseModel):
    id: int
    display_name: str  # "Rahul S." (surnames are abbreviated for privacy)


class BidRead(BaseModel):
    id: int
    auction_id: int
    amount: Money
    created_at: UtcDatetime
    bidder: BidderInfo


class AuctionState(BaseModel):
    """Everything a client needs to render an auction's live state.
    The reserve amount itself is never exposed, only whether it has been met."""

    id: int
    listing_id: int
    status: AuctionStatus
    starting_price: Money
    bid_increment: Money
    current_price: Money | None
    min_next_bid: Money
    bid_count: int
    start_time: UtcDatetime
    end_time: UtcDatetime
    original_end_time: UtcDatetime
    extended: bool
    has_reserve: bool
    reserve_met: bool | None
    leading_bidder_id: int | None
    winner_id: int | None
    final_price: Money | None
    server_time: UtcDatetime  # lets clients correct countdowns for clock skew


class AuctionCard(BaseModel):
    auction: AuctionState
    listing: ListingCard


class AuctionDetail(BaseModel):
    auction: AuctionState
    listing: ListingDetail
    bids: list[BidRead]
    is_seller: bool
    my_max_bid: Money | None
    watchers: int


class BidResult(BaseModel):
    bid: BidRead
    auction: AuctionState
    extended: bool


Outcome = Literal["upcoming", "leading", "outbid", "won", "lost", "cancelled"]


class MyBid(BaseModel):
    auction: AuctionState
    listing: ListingCard
    my_max_bid: Money
    outcome: Outcome
