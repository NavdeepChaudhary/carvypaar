"""Enumerations shared by models, schemas and (later) the ML pipeline."""
from enum import StrEnum


class UserRole(StrEnum):
    BUYER = "buyer"
    SELLER = "seller"
    ADMIN = "admin"


class FuelType(StrEnum):
    PETROL = "petrol"
    DIESEL = "diesel"
    ELECTRIC = "electric"
    HYBRID = "hybrid"
    CNG = "cng"
    LPG = "lpg"


class Transmission(StrEnum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"
    SEMI_AUTOMATIC = "semi_automatic"


class BodyType(StrEnum):
    SEDAN = "sedan"
    HATCHBACK = "hatchback"
    SUV = "suv"
    COUPE = "coupe"
    CONVERTIBLE = "convertible"
    WAGON = "wagon"
    PICKUP = "pickup"
    VAN = "van"
    MINIVAN = "minivan"


class CarCondition(StrEnum):
    NEW = "new"
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class ListingType(StrEnum):
    SALE = "sale"
    AUCTION = "auction"


class ListingStatus(StrEnum):
    PENDING = "pending"      # awaiting admin approval
    ACTIVE = "active"        # visible to buyers
    SOLD = "sold"
    REJECTED = "rejected"    # rejected by admin
    INACTIVE = "inactive"    # hidden by seller


class AuctionStatus(StrEnum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    ENDED = "ended"
    CANCELLED = "cancelled"


class OfferStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class NotificationType(StrEnum):
    OUTBID = "outbid"
    AUCTION_WON = "auction_won"
    AUCTION_ENDED = "auction_ended"
    OFFER_RECEIVED = "offer_received"
    OFFER_UPDATED = "offer_updated"
    MESSAGE = "message"
    LISTING_APPROVED = "listing_approved"
    LISTING_REJECTED = "listing_rejected"
    SYSTEM = "system"
