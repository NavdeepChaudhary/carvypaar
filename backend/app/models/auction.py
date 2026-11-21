"""Auctions and bids."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, enum_column
from app.models.enums import AuctionStatus

if TYPE_CHECKING:
    from app.models.car import Listing
    from app.models.user import User


class Auction(TimestampMixin, Base):
    __tablename__ = "auctions"
    __table_args__ = (
        CheckConstraint("starting_price > 0", name="starting_price_positive"),
        CheckConstraint("bid_increment > 0", name="bid_increment_positive"),
        CheckConstraint("end_time > start_time", name="end_after_start"),
        Index("ix_auctions_status_end", "status", "end_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), unique=True)

    starting_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    reserve_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # hidden from bidders
    bid_increment: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    current_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # highest bid so far

    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # moves with anti-sniping
    original_end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    status: Mapped[AuctionStatus] = mapped_column(
        enum_column(AuctionStatus),
        default=AuctionStatus.SCHEDULED,
        server_default=AuctionStatus.SCHEDULED.value,
        index=True,
    )
    # bid_count doubles as an optimistic-concurrency version: every bid UPDATE
    # requires the count it read, so two simultaneous bids can't both win.
    bid_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    leading_bidder_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    final_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    reserve_met: Mapped[bool | None] = mapped_column()

    listing: Mapped[Listing] = relationship(back_populates="auction")
    winner: Mapped[User | None] = relationship(foreign_keys=[winner_id])
    leading_bidder: Mapped[User | None] = relationship(foreign_keys=[leading_bidder_id])
    bids: Mapped[list[Bid]] = relationship(
        back_populates="auction", cascade="all, delete-orphan", passive_deletes=True, order_by="Bid.amount.desc()"
    )


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_bids_auction_amount", "auction_id", "amount"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), index=True)
    bidder_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    auction: Mapped[Auction] = relationship(back_populates="bids")
    bidder: Mapped[User] = relationship(back_populates="bids")
