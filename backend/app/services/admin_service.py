"""Admin moderation, user management and statistics."""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import utcnow
from app.models import (
    Auction,
    AuctionStatus,
    Bid,
    Listing,
    ListingStatus,
    ListingType,
    NotificationType,
    User,
    UserRole,
)
from app.schemas.admin import (
    AdminAuctionRow,
    AdminListingRow,
    AdminStats,
    AdminUserRow,
    AdminUserUpdate,
    CountItem,
    DailyPoint,
    PublicStats,
)
from app.schemas.common import Page
from app.schemas.user import UserRead
from app.services import auction_service, listing_service
from app.services.auth_service import revoke_all_user_tokens
from app.services.listing_service import ListingError, _like
from app.services.notification_service import notify


def _page(total: int, page: int, page_size: int) -> int:
    return max(1, math.ceil(total / page_size))


def _count(db: Session, stmt) -> int:  # type: ignore[no-untyped-def]
    return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0


# ---------------------------------------------------------------- stats
def _grouped(db: Session, column, model) -> dict[str, int]:  # type: ignore[no-untyped-def]
    return {getattr(k, "value", str(k)): v for k, v in db.execute(select(column, func.count()).select_from(model).group_by(column))}


def _gmv(db: Session, since: datetime | None = None) -> Decimal:
    sale = select(func.coalesce(func.sum(Listing.price), 0)).where(
        Listing.status == ListingStatus.SOLD, Listing.listing_type == ListingType.SALE
    )
    auction = select(func.coalesce(func.sum(Auction.final_price), 0)).where(
        Auction.status == AuctionStatus.ENDED, Auction.winner_id.is_not(None)
    )
    if since is not None:
        sale = sale.where(Listing.updated_at >= since)
        auction = auction.where(Auction.end_time >= since)
    return Decimal(db.scalar(sale) or 0) + Decimal(db.scalar(auction) or 0)


def _daily_counts(db: Session, column, since: datetime) -> dict[str, int]:  # type: ignore[no-untyped-def]
    # date() works on SQLite and PostgreSQL alike. (CAST(... AS DATE) on SQLite
    # applies numeric affinity and returns just the year!)
    day = func.date(column)
    rows = db.execute(select(day, func.count()).where(column >= since).group_by(day))
    return {str(d)[:10]: n for d, n in rows}


def stats(db: Session) -> AdminStats:
    now = utcnow()
    week, two_weeks = now - timedelta(days=7), now - timedelta(days=14)

    def new_since(model, start: datetime, end: datetime | None = None) -> int:  # type: ignore[no-untyped-def]
        stmt = select(func.count()).select_from(model).where(model.created_at >= start)
        if end is not None:
            stmt = stmt.where(model.created_at < end)
        return db.scalar(stmt) or 0

    start_day = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
    listings_d = _daily_counts(db, Listing.created_at, start_day)
    users_d = _daily_counts(db, User.created_at, start_day)
    bids_d = _daily_counts(db, Bid.created_at, start_day)
    daily = []
    for i in range(14):
        key = (start_day + timedelta(days=i)).date().isoformat()
        daily.append(DailyPoint(date=key, listings=listings_d.get(key, 0), users=users_d.get(key, 0), bids=bids_d.get(key, 0)))

    makes = db.execute(
        select(Listing.make, func.count())
        .where(Listing.status == ListingStatus.ACTIVE)
        .group_by(Listing.make)
        .order_by(func.count().desc(), Listing.make)
        .limit(8)
    ).all()
    listings_by_status = _grouped(db, Listing.status, Listing)

    return AdminStats(
        users_total=db.scalar(select(func.count()).select_from(User)) or 0,
        users_by_role=_grouped(db, User.role, User),
        users_new_7d=new_since(User, week),
        users_new_prev_7d=new_since(User, two_weeks, week),
        listings_by_status=listings_by_status,
        listings_new_7d=new_since(Listing, week),
        listings_new_prev_7d=new_since(Listing, two_weeks, week),
        pending_review=listings_by_status.get("pending", 0),
        auctions_by_status=_grouped(db, Auction.status, Auction),
        bids_total=db.scalar(select(func.count()).select_from(Bid)) or 0,
        bids_7d=db.scalar(select(func.count()).select_from(Bid).where(Bid.created_at >= week)) or 0,
        gmv=_gmv(db),
        gmv_7d=_gmv(db, week),
        daily=daily,
        top_makes=[CountItem(label=m, count=c) for m, c in makes],
    )


def public_stats(db: Session) -> PublicStats:
    now = utcnow()
    return PublicStats(
        active_listings=db.scalar(select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.ACTIVE)) or 0,
        live_auctions=db.scalar(
            select(func.count()).select_from(Auction).join(Listing, Listing.id == Auction.listing_id).where(
                Auction.status.in_([AuctionStatus.LIVE, AuctionStatus.SCHEDULED]), Auction.start_time <= now,
                Auction.end_time > now, Listing.status == ListingStatus.ACTIVE)
        ) or 0,
        auctions_closed=db.scalar(select(func.count()).select_from(Auction).where(Auction.status == AuctionStatus.ENDED)) or 0,
        members=db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0,
    )


# ---------------------------------------------------------------- listing moderation
def list_listings(db: Session, status: str, q: str | None, page: int, page_size: int) -> Page[AdminListingRow]:
    stmt = select(Listing).join(User, User.id == Listing.seller_id)
    if status != "all":
        stmt = stmt.where(Listing.status == ListingStatus(status))
    if q:
        for term in q.split()[:6]:
            p = _like(term)
            stmt = stmt.where(or_(Listing.title.ilike(p, escape="\\"), Listing.make.ilike(p, escape="\\"),
                                  Listing.model.ilike(p, escape="\\"), User.email.ilike(p, escape="\\")))
    total = _count(db, stmt)
    # Review queue: oldest first (fair to sellers). Everything else: newest first.
    order = Listing.created_at.asc() if status == "pending" else Listing.created_at.desc()
    rows = list(db.scalars(
        stmt.options(selectinload(Listing.images), selectinload(Listing.seller), selectinload(Listing.auction))
        .order_by(order, Listing.id).offset((page - 1) * page_size).limit(page_size)
    ))
    return Page[AdminListingRow](
        items=[AdminListingRow(listing=listing_service.to_card(l), seller_id=l.seller_id, seller_name=l.seller.full_name,
                               seller_email=l.seller.email, updated_at=l.updated_at) for l in rows],
        total=total, page=page, page_size=page_size, pages=_page(total, page, page_size),
    )


def _get_listing(db: Session, listing_id: int) -> Listing:
    listing = listing_service.get_listing(db, listing_id)
    if listing is None:
        raise ListingError("Listing not found", 404)
    return listing


def approve(db: Session, listing_id: int) -> Listing:
    listing = _get_listing(db, listing_id)
    if listing.status not in (ListingStatus.PENDING, ListingStatus.REJECTED):
        raise ListingError(f"Only pending or rejected listings can be approved (this one is {listing.status.value})", 409)
    listing.status = ListingStatus.ACTIVE
    notify(db, listing.seller_id, NotificationType.LISTING_APPROVED, title=f"Your {listing.year} {listing.make} {listing.model} is live!",
           body="Your listing passed review and buyers can now see it.", link=f"/cars/{listing.id}", data={"listing_id": listing.id})
    db.commit()
    return _get_listing(db, listing_id)


def reject(db: Session, listing_id: int, reason: str) -> Listing:
    listing = _get_listing(db, listing_id)
    if listing.status not in (ListingStatus.PENDING, ListingStatus.ACTIVE):
        raise ListingError(f"Only pending or live listings can be rejected (this one is {listing.status.value})", 409)
    if listing.auction is not None and listing.auction.status in (AuctionStatus.LIVE, AuctionStatus.SCHEDULED) \
            and listing.auction.bid_count > 0:
        raise ListingError("This listing has a live auction with bids. Cancel the auction first.", 409)
    listing.status = ListingStatus.REJECTED
    notify(db, listing.seller_id, NotificationType.LISTING_REJECTED, title=f"Your {listing.make} {listing.model} listing needs changes",
           body=f"Reason: {reason}. Edit the listing to resubmit it for review.", link=f"/cars/{listing.id}/edit",
           data={"listing_id": listing.id, "reason": reason})
    db.commit()
    return _get_listing(db, listing_id)


# ---------------------------------------------------------------- users
def list_users(db: Session, q: str | None, role: UserRole | None, active: bool | None, page: int, page_size: int) -> Page[AdminUserRow]:
    stmt = select(User)
    if q:
        p = _like(q.strip())
        stmt = stmt.where(or_(User.email.ilike(p, escape="\\"), User.full_name.ilike(p, escape="\\")))
    if role is not None:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    total = _count(db, stmt)
    users = list(db.scalars(stmt.order_by(User.created_at.desc(), User.id.desc()).offset((page - 1) * page_size).limit(page_size)))
    ids = [u.id for u in users]
    listing_counts = dict(db.execute(select(Listing.seller_id, func.count()).where(Listing.seller_id.in_(ids)).group_by(Listing.seller_id)).all()) if ids else {}
    bid_counts = dict(db.execute(select(Bid.bidder_id, func.count()).where(Bid.bidder_id.in_(ids)).group_by(Bid.bidder_id)).all()) if ids else {}
    return Page[AdminUserRow](
        items=[AdminUserRow(user=UserRead.model_validate(u), listings=listing_counts.get(u.id, 0), bids=bid_counts.get(u.id, 0),
                            last_login_at=u.last_login_at) for u in users],
        total=total, page=page, page_size=page_size, pages=_page(total, page, page_size),
    )


def update_user(db: Session, admin: User, user_id: int, data: AdminUserUpdate) -> AdminUserRow:
    user = db.get(User, user_id)
    if user is None:
        raise ListingError("User not found", 404)
    if user.id == admin.id and (data.is_active is False or (data.role is not None and data.role != UserRole.ADMIN)):
        raise ListingError("You can't deactivate or demote your own admin account", 409)
    # Defence in depth: via the API the acting admin always remains, but keep the
    # invariant explicit in case this service is reused (CLI, scripts).
    losing_admin = user.role == UserRole.ADMIN and (data.is_active is False or (data.role not in (None, UserRole.ADMIN)))
    if losing_admin:
        admins = db.scalar(select(func.count()).select_from(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True))) or 0
        if admins <= 1:
            raise ListingError("At least one active admin must remain", 409)
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    if data.is_active is False:
        revoke_all_user_tokens(db, user.id)  # sign them out everywhere, immediately
    db.refresh(user)
    listings = db.scalar(select(func.count()).select_from(Listing).where(Listing.seller_id == user.id)) or 0
    bids = db.scalar(select(func.count()).select_from(Bid).where(Bid.bidder_id == user.id)) or 0
    return AdminUserRow(user=UserRead.model_validate(user), listings=listings, bids=bids, last_login_at=user.last_login_at)


# ---------------------------------------------------------------- auctions
def list_auctions(db: Session, status: str, page: int, page_size: int) -> Page[AdminAuctionRow]:
    stmt = select(Auction)
    if status != "all":
        stmt = stmt.where(Auction.status == AuctionStatus(status))
    total = _count(db, stmt)
    rows = list(db.scalars(
        stmt.options(selectinload(Auction.listing).selectinload(Listing.images), selectinload(Auction.listing).selectinload(Listing.seller))
        .order_by(Auction.end_time.desc(), Auction.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ))
    now = utcnow()
    return Page[AdminAuctionRow](
        items=[AdminAuctionRow(auction=auction_service.to_state(a, now), listing_id=a.listing_id, listing_title=a.listing.title,
                               seller_name=a.listing.seller.full_name,
                               cover_image=a.listing.images[0].url if a.listing.images else None) for a in rows],
        total=total, page=page, page_size=page_size, pages=_page(total, page, page_size),
    )
