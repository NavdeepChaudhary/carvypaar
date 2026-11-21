"""/api/admin: moderation, users, auctions and stats (admins only), plus public stats."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.admin import (
    AdminAuctionRow,
    AdminListingRow,
    AdminListingStatus,
    AdminStats,
    AdminUserRow,
    AdminUserUpdate,
    PublicStats,
    RejectRequest,
)
from app.schemas.auction import AuctionState
from app.schemas.common import Page
from app.schemas.listing import ListingCard
from app.services import admin_service as svc
from app.services import auction_service, listing_service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
public = APIRouter(tags=["meta"])


@public.get("/stats", response_model=PublicStats)
def public_stats(db: Session = Depends(get_db)) -> PublicStats:
    """Homepage counters."""
    return svc.public_stats(db)


@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)) -> AdminStats:
    return svc.stats(db)


# ---------------------------------------------------------------- listings
@router.get("/listings", response_model=Page[AdminListingRow])
def listings(
    status_: AdminListingStatus = Query(default="pending", alias="status"),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AdminListingRow]:
    return svc.list_listings(db, status_, q, page, page_size)


@router.post("/listings/{listing_id}/approve", response_model=ListingCard)
def approve(listing_id: int, db: Session = Depends(get_db)) -> ListingCard:
    return listing_service.to_card(svc.approve(db, listing_id))


@router.post("/listings/{listing_id}/reject", response_model=ListingCard)
def reject(listing_id: int, payload: RejectRequest, db: Session = Depends(get_db)) -> ListingCard:
    return listing_service.to_card(svc.reject(db, listing_id, payload.reason))


@router.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(listing_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    listing_service.delete_listing(db, listing_service.get_managed_listing(db, listing_id, admin), admin)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- users
@router.get("/users", response_model=Page[AdminUserRow])
def users(
    q: str | None = Query(default=None, max_length=100),
    role: UserRole | None = None,
    active: bool | None = None,
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AdminUserRow]:
    return svc.list_users(db, q, role, active, page, page_size)


@router.patch("/users/{user_id}", response_model=AdminUserRow)
def update_user(
    user_id: int, payload: AdminUserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> AdminUserRow:
    """Change role or (de)activate. Deactivating signs the user out everywhere."""
    return svc.update_user(db, admin, user_id, payload)


# ---------------------------------------------------------------- auctions
@router.get("/auctions", response_model=Page[AdminAuctionRow])
def auctions(
    status_: Literal["all", "scheduled", "live", "ended", "cancelled"] = Query(default="all", alias="status"),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[AdminAuctionRow]:
    return svc.list_auctions(db, status_, page, page_size)


@router.post("/auctions/{auction_id}/cancel", response_model=AuctionState)
def cancel_auction(auction_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> AuctionState:
    """Admins may cancel even with bids (e.g. a fraudulent listing); bidders are notified."""
    a = auction_service.get_auction(db, auction_id)
    if a is None:
        raise auction_service.AuctionError("Auction not found", 404)
    return auction_service.to_state(auction_service.cancel_auction(db, a, admin))
