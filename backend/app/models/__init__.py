"""Import every model here so SQLAlchemy relationships resolve and Alembic's
autogenerate sees the full metadata."""
from app.models.auction import Auction, Bid
from app.models.car import Favorite, Listing, ListingImage
from app.models.enums import (
    AuctionStatus,
    BodyType,
    CarCondition,
    FuelType,
    ListingStatus,
    ListingType,
    NotificationType,
    OfferStatus,
    Transmission,
    UserRole,
)
from app.models.interaction import Message, Offer
from app.models.notification import Notification
from app.models.user import RefreshToken, User

__all__ = [
    "Auction",
    "AuctionStatus",
    "Bid",
    "BodyType",
    "CarCondition",
    "Favorite",
    "FuelType",
    "Listing",
    "ListingImage",
    "ListingStatus",
    "ListingType",
    "Message",
    "Notification",
    "NotificationType",
    "Offer",
    "OfferStatus",
    "RefreshToken",
    "Transmission",
    "User",
    "UserRole",
]
