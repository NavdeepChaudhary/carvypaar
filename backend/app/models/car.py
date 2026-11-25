"""Car listings, their photos and user favorites."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, enum_column
from app.models.enums import BodyType, CarCondition, FuelType, ListingStatus, ListingType, Transmission

if TYPE_CHECKING:
    from app.models.auction import Auction
    from app.models.interaction import Message, Offer
    from app.models.user import User


class Listing(TimestampMixin, Base):
    __tablename__ = "listings"
    __table_args__ = (
        Index("ix_listings_make_model", "make", "model"),
        Index("ix_listings_status_created", "status", "created_at"),
        CheckConstraint("year >= 1886 AND year <= 2100", name="year_range"),
        CheckConstraint("mileage >= 0", name="mileage_non_negative"),
        CheckConstraint("price >= 0", name="price_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(150))
    make: Mapped[str] = mapped_column(String(60), index=True)
    model: Mapped[str] = mapped_column(String(60), index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    mileage: Mapped[int] = mapped_column(Integer, index=True)  # kilometres
    fuel_type: Mapped[FuelType] = mapped_column(enum_column(FuelType), index=True)
    transmission: Mapped[Transmission] = mapped_column(enum_column(Transmission), index=True)
    body_type: Mapped[BodyType] = mapped_column(enum_column(BodyType), index=True)
    condition: Mapped[CarCondition] = mapped_column(enum_column(CarCondition))
    color: Mapped[str] = mapped_column(String(40))
    location: Mapped[str] = mapped_column(String(120), index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    features: Mapped[list[str]] = mapped_column(JSON, default=list)

    listing_type: Mapped[ListingType] = mapped_column(
        enum_column(ListingType), default=ListingType.SALE, server_default=ListingType.SALE.value
    )
    status: Mapped[ListingStatus] = mapped_column(
        enum_column(ListingStatus),
        default=ListingStatus.PENDING,
        server_default=ListingStatus.PENDING.value,
        index=True,
    )
    views_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Why an admin rejected it (shown to the seller and on the admin dashboard); cleared on approval.
    rejection_reason: Mapped[str | None] = mapped_column(String(500))

    seller: Mapped[User] = relationship(back_populates="listings")
    images: Mapped[list[ListingImage]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", order_by="ListingImage.position"
    )
    favorites: Mapped[list[Favorite]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", passive_deletes=True
    )
    auction: Mapped[Auction | None] = relationship(
        back_populates="listing", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )
    offers: Mapped[list[Offer]] = relationship(back_populates="listing", cascade="all, delete-orphan", passive_deletes=True)
    messages: Mapped[list[Message]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<Listing id={self.id} {self.year} {self.make} {self.model}>"


class ListingImage(Base):
    __tablename__ = "listing_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    storage_key: Mapped[str] = mapped_column(String(300))  # backend-specific key used for deletion
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    listing: Mapped[Listing] = relationship(back_populates="images")


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "listing_id", name="uq_favorites_user_listing"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="favorites")
    listing: Mapped[Listing] = relationship(back_populates="favorites")


class ListingView(Base):
    """One row per (listing, device) that has viewed it, so `Listing.views_count` counts
    devices, not page loads. A device is an anonymous random id kept in a cookie."""

    __tablename__ = "listing_views"
    __table_args__ = (UniqueConstraint("listing_id", "device_id", name="uq_listing_views_listing_device"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
