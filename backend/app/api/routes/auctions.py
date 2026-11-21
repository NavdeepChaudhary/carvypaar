"""/api/auctions REST endpoints (live updates are pushed over /api/ws/auctions/{id})."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user, require_roles
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.auction import AuctionCard, AuctionCreate, AuctionDetail, AuctionState, BidCreate, BidRead, BidResult, MyBid
from app.schemas.common import Page
from app.services import auction_service as svc
from app.services import listing_service

router = APIRouter(tags=["auctions"])
require_seller = require_roles(UserRole.SELLER, UserRole.ADMIN)


@router.post("/listings/{listing_id}/auction", response_model=AuctionDetail, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
def create_auction(
    request: Request,
    listing_id: int,
    payload: AuctionCreate,
    user: User = Depends(require_seller),
    db: Session = Depends(get_db),
) -> AuctionDetail:
    """Put one of your listings up for auction (one auction per listing)."""
    listing = listing_service.get_managed_listing(db, listing_id, user)
    auction = svc.create_auction(db, listing, payload)
    return svc.auction_detail(db, auction, user)


@router.get("/auctions", response_model=Page[AuctionCard])
def list_auctions(
    tab: Literal["live", "upcoming", "ended"] = "live",
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=12, ge=1, le=48),
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> Page[AuctionCard]:
    return svc.list_auctions(db, tab, page, page_size, viewer)


@router.get("/auctions/{auction_id}", response_model=AuctionDetail)
def auction_detail(
    auction_id: int, viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)
) -> AuctionDetail:
    return svc.auction_detail(db, svc.get_visible_auction(db, auction_id, viewer), viewer)


@router.get("/auctions/{auction_id}/bids", response_model=list[BidRead])
def bid_history(
    auction_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> list[BidRead]:
    svc.get_visible_auction(db, auction_id, viewer)
    return [svc.to_bid_read(b) for b in svc.recent_bids(db, auction_id, limit)]


@router.post("/auctions/{auction_id}/bids", response_model=BidResult, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def place_bid(
    request: Request,
    auction_id: int,
    payload: BidCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BidResult:
    """HTTP fallback for bidding; the WebSocket accepts the same bids. Both broadcast."""
    svc.get_visible_auction(db, auction_id, user)
    return svc.place_bid(db, auction_id, user, payload.amount)


@router.post("/auctions/{auction_id}/cancel", response_model=AuctionState)
def cancel_auction(auction_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AuctionState:
    auction = svc.get_visible_auction(db, auction_id, user)
    if not listing_service.can_manage(auction.listing, user):
        raise svc.AuctionError("Only the seller can cancel this auction", 403)
    return svc.to_state(svc.cancel_auction(db, auction, user))


@router.get("/users/me/bids", response_model=list[MyBid])
def my_bids(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MyBid]:
    return svc.my_bids(db, user)
