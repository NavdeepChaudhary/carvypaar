"""User accounts and persisted refresh tokens."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func, true, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, enum_column
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.auction import Bid
    from app.models.car import Favorite, Listing
    from app.models.interaction import Offer
    from app.models.notification import Notification


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Null for accounts created through Clerk (or the old Google sign-in): Clerk owns passwords.
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    # Legacy: Google's account ID from before sign-in moved to Clerk. Kept for existing rows.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    # Clerk's stable user ID ("user_..."). Every sign-in goes through Clerk.
    clerk_user_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(30))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole), default=UserRole.BUYER, server_default=UserRole.BUYER.value, index=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    is_verified: Mapped[bool] = mapped_column(default=False, server_default=false())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    listings: Mapped[list[Listing]] = relationship(back_populates="seller", cascade="all, delete-orphan", passive_deletes=True)
    favorites: Mapped[list[Favorite]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    bids: Mapped[list[Bid]] = relationship(back_populates="bidder", cascade="all, delete-orphan", passive_deletes=True)
    offers_made: Mapped[list[Offer]] = relationship(back_populates="buyer", cascade="all, delete-orphan", passive_deletes=True)
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def has_password(self) -> bool:
        return self.hashed_password is not None

    @property
    def has_google(self) -> bool:
        return self.google_sub is not None

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"


class RefreshToken(Base):
    """One row per issued refresh token (identified by its JWT `jti`).
    Rotation revokes the old row; reuse of a revoked token revokes the family."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="refresh_tokens")
