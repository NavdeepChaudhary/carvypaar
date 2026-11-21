"""Demo data: a few sellers and realistic car listings with photos.

Photos point at Unsplash URLs (stored with an `external:` key so they're never
deleted from disk). Prices follow a simple depreciation model so the data is
believable; the Phase 4 synthetic dataset uses similar logic.
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, utcnow
from app.models import (
    Auction,
    AuctionStatus,
    BodyType,
    CarCondition,
    FuelType,
    Listing,
    ListingImage,
    ListingStatus,
    ListingType,
    Transmission,
    User,
    UserRole,
)
from app.services.storage import EXTERNAL_PREFIX

DEMO_PASSWORD = "DemoPass123"

# (make, model, body, fuel, transmission, approximate new price in INR)
CATALOG: list[tuple[str, str, BodyType, FuelType, Transmission, int]] = [
    ("Maruti Suzuki", "Swift", BodyType.HATCHBACK, FuelType.PETROL, Transmission.MANUAL, 750_000),
    ("Maruti Suzuki", "Baleno", BodyType.HATCHBACK, FuelType.PETROL, Transmission.AUTOMATIC, 850_000),
    ("Hyundai", "Creta", BodyType.SUV, FuelType.DIESEL, Transmission.AUTOMATIC, 1_700_000),
    ("Hyundai", "i20 N Line", BodyType.HATCHBACK, FuelType.PETROL, Transmission.MANUAL, 1_150_000),
    ("Tata", "Nexon EV", BodyType.SUV, FuelType.ELECTRIC, Transmission.AUTOMATIC, 1_600_000),
    ("Tata", "Harrier", BodyType.SUV, FuelType.DIESEL, Transmission.AUTOMATIC, 2_300_000),
    ("Mahindra", "Thar", BodyType.SUV, FuelType.DIESEL, Transmission.MANUAL, 1_650_000),
    ("Mahindra", "XUV700", BodyType.SUV, FuelType.DIESEL, Transmission.AUTOMATIC, 2_400_000),
    ("Honda", "City", BodyType.SEDAN, FuelType.PETROL, Transmission.AUTOMATIC, 1_400_000),
    ("Honda", "City e:HEV", BodyType.SEDAN, FuelType.HYBRID, Transmission.AUTOMATIC, 2_000_000),
    ("Toyota", "Fortuner", BodyType.SUV, FuelType.DIESEL, Transmission.AUTOMATIC, 4_500_000),
    ("Toyota", "Innova Hycross", BodyType.MINIVAN, FuelType.HYBRID, Transmission.AUTOMATIC, 3_000_000),
    ("Volkswagen", "Virtus GT", BodyType.SEDAN, FuelType.PETROL, Transmission.AUTOMATIC, 1_900_000),
    ("Skoda", "Octavia", BodyType.SEDAN, FuelType.PETROL, Transmission.AUTOMATIC, 2_900_000),
    ("BMW", "M340i", BodyType.SEDAN, FuelType.PETROL, Transmission.AUTOMATIC, 7_500_000),
    ("BMW", "X5", BodyType.SUV, FuelType.DIESEL, Transmission.AUTOMATIC, 9_800_000),
    ("Mercedes-Benz", "C-Class", BodyType.SEDAN, FuelType.PETROL, Transmission.AUTOMATIC, 6_000_000),
    ("Mercedes-Benz", "AMG GT", BodyType.COUPE, FuelType.PETROL, Transmission.AUTOMATIC, 25_000_000),
    ("Audi", "A4", BodyType.SEDAN, FuelType.PETROL, Transmission.AUTOMATIC, 4_700_000),
    ("Porsche", "911 Carrera", BodyType.COUPE, FuelType.PETROL, Transmission.AUTOMATIC, 19_000_000),
    ("Ford", "Mustang GT", BodyType.COUPE, FuelType.PETROL, Transmission.AUTOMATIC, 7_500_000),
    ("Kia", "Seltos", BodyType.SUV, FuelType.PETROL, Transmission.MANUAL, 1_500_000),
    ("Mini", "Cooper S Convertible", BodyType.CONVERTIBLE, FuelType.PETROL, Transmission.AUTOMATIC, 4_800_000),
    ("Toyota", "Hilux", BodyType.PICKUP, FuelType.DIESEL, Transmission.MANUAL, 3_700_000),
]

FEATURES = [
    "Sunroof", "Apple CarPlay", "Android Auto", "360° camera", "Cruise control", "Leather seats",
    "Ventilated seats", "Alloy wheels", "LED headlamps", "Wireless charging", "ADAS", "Keyless entry",
    "Push-button start", "Premium sound system", "Rear AC vents", "Heads-up display", "Ambient lighting",
    "Full service history", "Single owner", "Extended warranty",
]
COLORS = ["Racing Red", "Midnight Black", "Pearl White", "Gunmetal Grey", "Electric Blue", "Silver", "British Green"]
CITIES = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad", "Jaipur", "Chandigarh"]
CONDITION_FACTOR = {
    CarCondition.NEW: 1.0, CarCondition.EXCELLENT: 0.95, CarCondition.GOOD: 0.88,
    CarCondition.FAIR: 0.78, CarCondition.POOR: 0.62,
}

# Curated car photos on Unsplash (the frontend falls back gracefully if one disappears).
PHOTOS = [
    "photo-1503376780353-7e6692767b70", "photo-1494976388531-d1058494cdd8", "photo-1552519507-da3b142c6e3d",
    "photo-1555215695-3004980ad54e", "photo-1583121274602-3e2820c69888", "photo-1544636331-e26879cd4d9b",
    "photo-1502877338535-766e1452684a", "photo-1511919884226-fd3cad34687c", "photo-1492144534655-ae79c964c9d7",
    "photo-1525609004556-c46c7d6cf023", "photo-1549399542-7e3f8b79c341", "photo-1533473359331-0135ef1b58bf",
]


def _photo_url(photo_id: str) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w=1600&q=80"


def estimate_price(new_price: int, year: int, mileage: int, condition: CarCondition, rng: random.Random) -> int:
    """~12%/year depreciation, mileage penalty, condition factor, ±8% market noise."""
    age = max(0, date.today().year - year)
    value = new_price * (0.88 ** age)
    value *= max(0.55, 1 - mileage / 400_000)
    value *= CONDITION_FACTOR[condition]
    value *= rng.uniform(0.92, 1.08)
    return int(round(value / 5_000) * 5_000)  # round to nearest ₹5k like real listings


DEMO_SELLER_EMAILS = ("demo@carvypaar.com", "torque@carvypaar.com", "redline@carvypaar.com")
ASKING_SPREAD = 0.11  # log-normal sigma: how far sellers' asking prices stray from fair value


def market_reprice(listings: list[Listing], rng: random.Random) -> int:
    """Set demo asking prices around the AI model's fair value, the way a real
    market scatters: most fair, some bargains, some optimistic sellers.
    Without a trained model this is a no-op and the depreciation formula stands."""
    from app.services.price_service import ModelUnavailable, predictor

    sale = [l for l in listings if l.listing_type == ListingType.SALE]
    try:
        estimates = predictor.estimates_for(sale)
    except ModelUnavailable:
        return 0
    for l in sale:
        asking = estimates[l.id].estimate * rng.lognormvariate(0.0, ASKING_SPREAD)
        l.price = Decimal(max(5_000, int(round(asking / 5_000) * 5_000)))
    return len(sale)


def reprice_demo(db: Session, rng_seed: int = 11) -> int:
    """Re-price existing demo-seller listings (fixed price only) against the current model."""
    listings = list(
        db.scalars(
            select(Listing)
            .join(User, User.id == Listing.seller_id)
            .where(User.email.in_(DEMO_SELLER_EMAILS), Listing.listing_type == ListingType.SALE)
        )
    )
    n = market_reprice(listings, random.Random(rng_seed))
    db.commit()
    return n


def _get_or_create_seller(db: Session, email: str, name: str, city: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user:
        return user
    user = User(email=email, full_name=name, hashed_password=hash_password(DEMO_PASSWORD),
                role=UserRole.SELLER, location=city, is_verified=True)
    db.add(user)
    db.flush()
    return user


def seed(db: Session, count: int = 36, rng_seed: int = 42) -> int:
    rng = random.Random(rng_seed)
    sellers = [
        _get_or_create_seller(db, "demo@carvypaar.com", "Demo Garage", "Mumbai"),
        _get_or_create_seller(db, "torque@carvypaar.com", "Torque Motors", "Bengaluru"),
        _get_or_create_seller(db, "redline@carvypaar.com", "Redline Classics", "Delhi"),
    ]
    this_year = date.today().year
    created: list[Listing] = []
    for i in range(count):
        make, model, body, fuel, trans, new_price = rng.choice(CATALOG)
        year = rng.randint(this_year - 12, this_year)
        age = this_year - year
        mileage = 0 if age == 0 and rng.random() < 0.5 else int(rng.gauss(12_000, 4_000) * max(age, 0.3))
        mileage = max(0, mileage)
        condition = (
            CarCondition.NEW if mileage < 1_000
            else rng.choices([CarCondition.EXCELLENT, CarCondition.GOOD, CarCondition.FAIR, CarCondition.POOR],
                             weights=[3, 5, 2, 0.5])[0]
        )
        price = estimate_price(new_price, year, mileage, condition, rng)
        city = rng.choice(CITIES)
        feats = rng.sample(FEATURES, rng.randint(3, 8))
        listing = Listing(
            seller_id=rng.choice(sellers).id,
            title=f"{year} {make} {model}" + rng.choice(["", " – immaculate", " – one owner", " – low km", " – fully loaded"]),
            make=make, model=model, year=year, mileage=mileage, fuel_type=fuel, transmission=trans,
            body_type=body, condition=condition, color=rng.choice(COLORS), location=city,
            price=Decimal(price),
            description=(
                f"Well-kept {year} {make} {model} in {condition.value} condition, driven {mileage:,} km. "
                f"Garage parked in {city}, serviced on schedule. Test drives welcome."
            ),
            features=feats,
            status=ListingStatus.ACTIVE,
            views_count=rng.randint(0, 900),
        )
        listing.created_at = utcnow() - timedelta(hours=rng.randint(1, 24 * 60))
        listing.updated_at = listing.created_at
        db.add(listing)
        db.flush()
        created.append(listing)
        for pos, photo in enumerate(rng.sample(PHOTOS, rng.randint(3, 5))):
            db.add(ListingImage(listing_id=listing.id, url=_photo_url(photo),
                                storage_key=f"{EXTERNAL_PREFIX}{photo}", position=pos))
    market_reprice(created, rng)
    db.commit()
    return count


# (minutes from now the auction starts, minutes it runs). Negative start = already live.
AUCTION_SCHEDULE = [(-50, 53), (-30, 45), (-120, 180), (-600, 24 * 60), (-60, 3 * 24 * 60), (90, 24 * 60), (24 * 60, 2 * 24 * 60)]


def seed_auctions(db: Session, count: int = 6, rng_seed: int = 7) -> int:
    """Turn some seeded listings into auctions: a mix of live (one ending within
    minutes, great for watching anti-sniping) and upcoming."""
    rng = random.Random(rng_seed)
    candidates = list(
        db.scalars(
            select(Listing)
            .where(Listing.status == ListingStatus.ACTIVE, Listing.listing_type == ListingType.SALE)
            .order_by(Listing.price.desc())
            .limit(count * 3)
        )
    )
    candidates = [c for c in candidates if c.auction is None][:count]
    now = utcnow()
    for listing, (start_offset, duration) in zip(candidates, AUCTION_SCHEDULE):
        start = now + timedelta(minutes=start_offset)
        end = start + timedelta(minutes=duration)
        starting = (Decimal(int(listing.price) * rng.uniform(0.6, 0.75)) // 5000) * 5000
        increment = max(Decimal(5000), (starting * Decimal("0.01") // 1000) * 1000)
        db.add(Auction(
            listing_id=listing.id,
            starting_price=starting,
            reserve_price=(listing.price // 5000) * 5000 if rng.random() < 0.5 else None,
            bid_increment=increment,
            start_time=start,
            end_time=end,
            original_end_time=end,
            status=AuctionStatus.LIVE if start <= now else AuctionStatus.SCHEDULED,
        ))
        listing.listing_type = ListingType.AUCTION
        listing.price = starting
    db.commit()
    return len(candidates)
