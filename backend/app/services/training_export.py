"""Export real marketplace listings in the ML training schema (ml/carvypaar_ml/schema.py).

Closing the loop: as CarvyPaar grows, retraining on its own listings makes the
model reflect this market. We export:
  * fixed-price listings that are live or sold (asking price)
  * auctions that sold (the hammer price is the best signal of market value)
Pending/rejected/hidden listings and unsold auctions are excluded.
"""
from __future__ import annotations

import csv
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import AuctionStatus, Listing, ListingStatus, ListingType

COLUMNS = ["make", "model", "fuel_type", "transmission", "body_type", "condition", "location", "year", "mileage", "price"]


def export_training_data(db: Session, path: Path) -> int:
    rows = []
    listings = db.scalars(
        select(Listing)
        .where(Listing.status.in_([ListingStatus.ACTIVE, ListingStatus.SOLD]))
        .options(selectinload(Listing.auction))
    )
    for l in listings:
        a = l.auction
        if a is not None and a.status == AuctionStatus.ENDED and a.final_price is not None:
            price = a.final_price
        elif l.listing_type == ListingType.SALE:
            price = l.price
        else:
            continue  # live/unsold auctions don't have a market price yet
        rows.append({
            "make": l.make, "model": l.model, "fuel_type": l.fuel_type.value, "transmission": l.transmission.value,
            "body_type": l.body_type.value, "condition": l.condition.value, "location": l.location,
            "year": l.year, "mileage": l.mileage, "price": float(price),
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)
