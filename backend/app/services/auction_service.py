"""Auction rules, bidding and lifecycle.

Bidding rules
  * the auction must be live (started, not ended/cancelled)
  * sellers can't bid on their own car; the current leader can't outbid themselves
  * the first bid must be >= the starting price; later bids >= current bid + increment
  * anti-sniping: a bid with <= ANTI_SNIPE_WINDOW_SECONDS left extends the end
    by ANTI_SNIPE_EXTENSION_SECONDS

Concurrency
  Each bid is applied with a compare-and-swap UPDATE guarded by the `bid_count`
  it read (an optimistic version). If another bid landed first, the UPDATE
  matches 0 rows and we re-validate against the new state. Closing an auction
  is guarded the same way plus `end_time <= now`, so a last-second bid that
  extends the auction can never be lost to the closer. This is correct on both
  SQLite and PostgreSQL and with several API workers.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.security import ensure_aware, utcnow
from app.models import (
    Auction,
    AuctionStatus,
    Bid,
    Listing,
    ListingStatus,
    ListingType,
    NotificationType,
    Offer,
    OfferStatus,
    User,
)
from app.realtime import hub
from app.schemas.auction import (
    AuctionCard,
    AuctionCreate,
    AuctionDetail,
    AuctionState,
    BidderInfo,
    BidRead,
    BidResult,
    MyBid,
    Outcome,
)
from app.schemas.common import Page
from app.services import listing_service
from app.services.listing_service import ListingError, can_manage, is_admin
from app.services.notification_service import notify

logger = logging.getLogger("carvypaar.auctions")

OPEN_STATUSES = (AuctionStatus.SCHEDULED, AuctionStatus.LIVE)


class AuctionError(ListingError):
    """Rendered as {"detail": message} with the given status (shares ListingError's handler)."""


# ---------------------------------------------------------------- helpers
def _money(amount: Decimal | float) -> str:
    return f"₹{float(amount):,.0f}"


def display_name(user: User) -> str:
    """'Rahul Sharma' -> 'Rahul S.' (bid history shouldn't reveal full names)."""
    parts = user.full_name.split()
    if len(parts) < 2:
        return parts[0] if parts else "Bidder"
    return f"{parts[0]} {parts[-1][0].upper()}."


def _car_name(listing: Listing) -> str:
    return f"{listing.year} {listing.make} {listing.model}"


def effective_status(a: Auction, now: datetime) -> AuctionStatus:
    """The status a client should see right now, even if the background worker hasn't
    persisted the transition yet."""
    if a.status == AuctionStatus.SCHEDULED and ensure_aware(a.start_time) <= now:
        return AuctionStatus.ENDED if ensure_aware(a.end_time) <= now else AuctionStatus.LIVE
    if a.status == AuctionStatus.LIVE and ensure_aware(a.end_time) <= now:
        return AuctionStatus.ENDED
    return a.status


def min_next_bid(a: Auction) -> Decimal:
    return a.starting_price if a.current_price is None else a.current_price + a.bid_increment


def to_state(a: Auction, now: datetime | None = None) -> AuctionState:
    now = now or utcnow()
    has_reserve = a.reserve_price is not None
    if a.reserve_met is not None:
        reserve_met: bool | None = a.reserve_met
    elif has_reserve:
        reserve_met = a.current_price is not None and a.current_price >= a.reserve_price  # type: ignore[operator]
    else:
        reserve_met = None
    return AuctionState(
        id=a.id,
        listing_id=a.listing_id,
        status=effective_status(a, now),
        starting_price=a.starting_price,
        bid_increment=a.bid_increment,
        current_price=a.current_price,
        min_next_bid=min_next_bid(a),
        bid_count=a.bid_count,
        start_time=a.start_time,
        end_time=a.end_time,
        original_end_time=a.original_end_time,
        extended=ensure_aware(a.end_time) > ensure_aware(a.original_end_time),
        has_reserve=has_reserve,
        reserve_met=reserve_met,
        leading_bidder_id=a.leading_bidder_id,
        winner_id=a.winner_id,
        final_price=a.final_price,
        server_time=now,
    )


def to_bid_read(b: Bid) -> BidRead:
    return BidRead(
        id=b.id,
        auction_id=b.auction_id,
        amount=b.amount,
        created_at=b.created_at,
        bidder=BidderInfo(id=b.bidder.id, display_name=display_name(b.bidder)),
    )


def _auction_query():  # type: ignore[no-untyped-def]
    return select(Auction).options(
        selectinload(Auction.listing).selectinload(Listing.images),
        selectinload(Auction.listing).selectinload(Listing.seller),
        selectinload(Auction.listing).selectinload(Listing.auction),
    )


def get_auction(db: Session, auction_id: int) -> Auction | None:
    return db.scalar(_auction_query().where(Auction.id == auction_id).execution_options(populate_existing=True))


def get_visible_auction(db: Session, auction_id: int, viewer: User | None) -> Auction:
    a = get_auction(db, auction_id)
    if a is None:
        raise AuctionError("Auction not found", 404)
    hidden = a.listing.status in (ListingStatus.PENDING, ListingStatus.REJECTED) or a.status == AuctionStatus.CANCELLED
    if hidden and not can_manage(a.listing, viewer):
        raise AuctionError("Auction not found", 404)
    return a


def recent_bids(db: Session, auction_id: int, limit: int = 20) -> list[Bid]:
    return list(
        db.scalars(
            select(Bid)
            .where(Bid.auction_id == auction_id)
            .options(selectinload(Bid.bidder))
            .order_by(Bid.amount.desc(), Bid.id.desc())
            .limit(limit)
        )
    )


# ---------------------------------------------------------------- create / cancel
def create_auction(db: Session, listing: Listing, data: AuctionCreate) -> Auction:
    if listing.auction is not None:
        raise AuctionError("This listing already has an auction", 409)
    if listing.status not in (ListingStatus.ACTIVE, ListingStatus.PENDING):
        raise AuctionError("Only active listings can be auctioned", 409)

    now = utcnow()
    start = data.start_time or now
    if start < now - timedelta(minutes=1):
        raise AuctionError("Start time is in the past", 422)
    if start > now + timedelta(days=90):
        raise AuctionError("Auctions can be scheduled at most 90 days ahead", 422)
    start = max(start, now)
    end = data.end_time
    if end - start < timedelta(minutes=settings.MIN_AUCTION_MINUTES):
        raise AuctionError(f"Auctions must run for at least {settings.MIN_AUCTION_MINUTES} minutes", 422)
    if end - start > timedelta(days=settings.MAX_AUCTION_DAYS):
        raise AuctionError(f"Auctions can run for at most {settings.MAX_AUCTION_DAYS} days", 422)

    auction = Auction(
        listing_id=listing.id,
        starting_price=data.starting_price,
        reserve_price=data.reserve_price,
        bid_increment=data.bid_increment,
        start_time=start,
        end_time=end,
        original_end_time=end,
        status=AuctionStatus.LIVE if start <= now else AuctionStatus.SCHEDULED,
        bid_count=0,
    )
    db.add(auction)
    listing.listing_type = ListingType.AUCTION
    listing.price = data.starting_price

    # Pending fixed-price offers no longer apply; tell those buyers.
    for offer in db.scalars(select(Offer).where(Offer.listing_id == listing.id, Offer.status == OfferStatus.PENDING)):
        offer.status = OfferStatus.WITHDRAWN
        notify(db, offer.buyer_id, NotificationType.OFFER_UPDATED,
               title=f"The {_car_name(listing)} moved to an auction",
               body="Your offer was closed. You can bid in the auction instead.",
               link=f"/cars/{listing.id}")
    db.commit()
    return get_auction(db, auction.id)  # type: ignore[return-value]


def cancel_auction(db: Session, a: Auction, actor: User) -> Auction:
    if a.status not in OPEN_STATUSES:
        raise AuctionError(f"This auction is already {a.status.value}", 409)
    if a.bid_count > 0 and not is_admin(actor):
        raise AuctionError("Auctions with bids can't be cancelled. Contact support.", 409)
    res = db.execute(
        update(Auction)
        .where(Auction.id == a.id, Auction.bid_count == a.bid_count, Auction.status.in_(OPEN_STATUSES))
        .values(status=AuctionStatus.CANCELLED)
        .execution_options(synchronize_session=False)
    )
    if res.rowcount != 1:
        db.rollback()
        raise AuctionError("The auction changed while cancelling; refresh and try again", 409)
    listing = a.listing
    listing.listing_type = ListingType.SALE  # seller can relist it at a fixed price
    listing.status = ListingStatus.INACTIVE
    for bidder_id in _bidder_ids(db, a.id):
        notify(db, bidder_id, NotificationType.AUCTION_ENDED, title=f"Auction cancelled: {_car_name(listing)}",
               link=f"/auctions/{a.id}", data={"auction_id": a.id})
    db.commit()
    a = get_auction(db, a.id)  # type: ignore[assignment]
    hub.publish_auction(a.id, {"type": "status", "auction": to_state(a).model_dump(mode="json")})
    return a


# ---------------------------------------------------------------- bidding
def place_bid(db: Session, auction_id: int, bidder: User, amount: Decimal) -> BidResult:
    for _attempt in range(3):
        a = get_auction(db, auction_id)
        if a is None:
            raise AuctionError("Auction not found", 404)
        now = utcnow()
        status = effective_status(a, now)
        if status == AuctionStatus.SCHEDULED:
            raise AuctionError("This auction hasn't started yet", 409)
        if status != AuctionStatus.LIVE:
            raise AuctionError("This auction has ended", 409)
        if a.listing.status != ListingStatus.ACTIVE:
            raise AuctionError("This auction is not open for bidding", 409)
        if a.listing.seller_id == bidder.id:
            raise AuctionError("You can't bid on your own car", 403)
        if a.leading_bidder_id == bidder.id:
            raise AuctionError("You're already the highest bidder", 409)
        minimum = min_next_bid(a)
        if amount < minimum:
            raise AuctionError(f"Your bid must be at least {_money(minimum)}", 400)

        end = ensure_aware(a.end_time)
        extended = (end - now).total_seconds() <= settings.ANTI_SNIPE_WINDOW_SECONDS
        new_end = end + timedelta(seconds=settings.ANTI_SNIPE_EXTENSION_SECONDS) if extended else end
        previous_leader = a.leading_bidder_id

        res = db.execute(
            update(Auction)
            .where(
                Auction.id == a.id,
                Auction.bid_count == a.bid_count,  # optimistic lock
                Auction.status.in_(OPEN_STATUSES),
                Auction.end_time > now,
            )
            .values(
                current_price=amount,
                bid_count=a.bid_count + 1,
                leading_bidder_id=bidder.id,
                end_time=new_end,
                status=AuctionStatus.LIVE,
            )
            .execution_options(synchronize_session=False)
        )
        if res.rowcount != 1:
            db.rollback()  # someone else bid (or it just closed); re-check against fresh state
            continue

        bid = Bid(auction_id=a.id, bidder_id=bidder.id, amount=amount, created_at=now)
        db.add(bid)
        if previous_leader is not None and previous_leader != bidder.id:
            notify(
                db,
                previous_leader,
                NotificationType.OUTBID,
                title=f"You've been outbid on the {_car_name(a.listing)}",
                body=f"New highest bid: {_money(amount)}. Bid again to stay in the race!",
                link=f"/auctions/{a.id}",
                data={"auction_id": a.id, "amount": float(amount)},
            )
        db.commit()

        fresh = get_auction(db, a.id)
        assert fresh is not None
        bid_read = BidRead(id=bid.id, auction_id=a.id, amount=amount, created_at=now,
                           bidder=BidderInfo(id=bidder.id, display_name=display_name(bidder)))
        result = BidResult(bid=bid_read, auction=to_state(fresh, now), extended=extended)
        hub.publish_auction(a.id, {"type": "bid", **result.model_dump(mode="json")})
        return result

    raise AuctionError("Bidding is very busy right now. Please try again.", 409)


# ---------------------------------------------------------------- lifecycle (background worker)
def _bidder_ids(db: Session, auction_id: int) -> list[int]:
    return list(db.scalars(select(Bid.bidder_id).where(Bid.auction_id == auction_id).distinct()))


def activate_due(db: Session, now: datetime) -> list[int]:
    ids = list(db.scalars(select(Auction.id).where(Auction.status == AuctionStatus.SCHEDULED, Auction.start_time <= now)))
    opened: list[int] = []
    for auction_id in ids:
        res = db.execute(
            update(Auction)
            .where(Auction.id == auction_id, Auction.status == AuctionStatus.SCHEDULED)
            .values(status=AuctionStatus.LIVE)
            .execution_options(synchronize_session=False)
        )
        db.commit()
        if res.rowcount == 1:
            opened.append(auction_id)
            a = get_auction(db, auction_id)
            if a is not None:
                hub.publish_auction(auction_id, {"type": "status", "auction": to_state(a, now).model_dump(mode="json")})
    return opened


def close_auction(db: Session, a: Auction, now: datetime) -> bool:
    """Close one expired auction. Returns False if a bid (or another worker) got there first."""
    has_bids = a.current_price is not None and a.leading_bidder_id is not None
    reserve_met = has_bids and (a.reserve_price is None or a.current_price >= a.reserve_price)  # type: ignore[operator]
    winner_id = a.leading_bidder_id if reserve_met else None

    res = db.execute(
        update(Auction)
        .where(
            Auction.id == a.id,
            Auction.status.in_(OPEN_STATUSES),
            Auction.bid_count == a.bid_count,
            Auction.end_time <= now,
        )
        .values(
            status=AuctionStatus.ENDED,
            winner_id=winner_id,
            final_price=a.current_price if winner_id else None,
            reserve_met=reserve_met,
        )
        .execution_options(synchronize_session=False)
    )
    if res.rowcount != 1:
        db.rollback()
        return False

    listing = a.listing
    car = _car_name(listing)
    link = f"/auctions/{a.id}"
    if winner_id is not None:
        listing.status = ListingStatus.SOLD
        notify(db, winner_id, NotificationType.AUCTION_WON, title=f"🏆 You won the {car}!",
               body=f"Winning bid {_money(a.current_price)}. The seller will be in touch to arrange handover.",  # type: ignore[arg-type]
               link=link, data={"auction_id": a.id})
        notify(db, listing.seller_id, NotificationType.AUCTION_ENDED, title=f"Sold! Your {car} went for {_money(a.current_price)}",  # type: ignore[arg-type]
               link=link, data={"auction_id": a.id, "winner_id": winner_id})
    else:
        # Unsold: hide it and turn it back into a fixed-price listing the seller can relist.
        listing.status = ListingStatus.INACTIVE
        listing.listing_type = ListingType.SALE
        reason = "the reserve wasn't met" if has_bids else "there were no bids"
        notify(db, listing.seller_id, NotificationType.AUCTION_ENDED, title=f"Your {car} auction ended unsold",
               body=f"It ended because {reason}. You can relist it from your garage.", link=link, data={"auction_id": a.id})
    for bidder_id in _bidder_ids(db, a.id):
        if bidder_id != winner_id:
            notify(db, bidder_id, NotificationType.AUCTION_ENDED, title=f"Auction ended: {car}",
                   body="You didn't win this one. More cars go under the hammer every day.", link=link,
                   data={"auction_id": a.id})
    db.commit()

    fresh = get_auction(db, a.id)
    if fresh is not None:
        hub.publish_auction(a.id, {"type": "status", "auction": to_state(fresh, now).model_dump(mode="json")})
    logger.info("Auction %s closed (winner=%s)", a.id, winner_id)
    return True


def tick(db: Session) -> dict[str, int]:
    """One pass of the background worker: open due auctions, close expired ones."""
    now = utcnow()
    opened = activate_due(db, now)
    expired = list(
        db.scalars(
            _auction_query()
            .where(Auction.status.in_(OPEN_STATUSES), Auction.end_time <= now)
            .execution_options(populate_existing=True)
        )
    )
    closed = sum(close_auction(db, a, now) for a in expired)
    return {"opened": len(opened), "closed": closed}


# ---------------------------------------------------------------- queries
AuctionTab = Literal["live", "upcoming", "ended"]


def list_auctions(db: Session, tab: AuctionTab, page: int, page_size: int, viewer: User | None) -> Page[AuctionCard]:
    now = utcnow()
    stmt = _auction_query().join(Listing, Listing.id == Auction.listing_id)
    if tab == "live":
        stmt = stmt.where(
            Auction.status.in_(OPEN_STATUSES), Auction.start_time <= now, Auction.end_time > now,
            Listing.status == ListingStatus.ACTIVE,
        ).order_by(Auction.end_time.asc())  # ending soonest first
    elif tab == "upcoming":
        stmt = stmt.where(
            Auction.status == AuctionStatus.SCHEDULED, Auction.start_time > now, Listing.status == ListingStatus.ACTIVE
        ).order_by(Auction.start_time.asc())
    else:
        stmt = stmt.where(Auction.status == AuctionStatus.ENDED).order_by(Auction.end_time.desc())

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Auction.id.desc()).offset((page - 1) * page_size).limit(page_size)))
    favs = listing_service.favorite_ids(db, viewer, (a.listing_id for a in rows))
    return Page[AuctionCard](
        items=[AuctionCard(auction=to_state(a, now), listing=listing_service.to_card(a.listing, favs)) for a in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


def my_max_bid(db: Session, auction_id: int, user: User | None) -> Decimal | None:
    if user is None:
        return None
    return db.scalar(select(func.max(Bid.amount)).where(Bid.auction_id == auction_id, Bid.bidder_id == user.id))


def auction_detail(db: Session, a: Auction, viewer: User | None) -> AuctionDetail:
    return AuctionDetail(
        auction=to_state(a),
        listing=listing_service.to_detail(db, a.listing, viewer),
        bids=[to_bid_read(b) for b in recent_bids(db, a.id)],
        is_seller=viewer is not None and viewer.id == a.listing.seller_id,
        my_max_bid=my_max_bid(db, a.id, viewer),
        watchers=hub.watchers(a.id),
    )


def _outcome(a: Auction, user_id: int, now: datetime) -> Outcome:
    if a.status == AuctionStatus.CANCELLED:
        return "cancelled"
    if a.status == AuctionStatus.ENDED:  # persisted result: winner is final
        return "won" if a.winner_id == user_id else "lost"
    if effective_status(a, now) == AuctionStatus.SCHEDULED:
        return "upcoming"
    # Live, or expired but not closed yet: report the current standing.
    return "leading" if a.leading_bidder_id == user_id else "outbid"


def my_bids(db: Session, user: User) -> list[MyBid]:
    mine = (
        select(Bid.auction_id, func.max(Bid.amount).label("my_max"))
        .where(Bid.bidder_id == user.id)
        .group_by(Bid.auction_id)
        .subquery()
    )
    rows = db.execute(
        _auction_query().add_columns(mine.c.my_max).join(mine, mine.c.auction_id == Auction.id)
        .order_by(Auction.end_time.desc()).limit(200)
    ).all()
    now = utcnow()
    return [
        MyBid(auction=to_state(a, now), listing=listing_service.to_card(a.listing), my_max_bid=my_max,
              outcome=_outcome(a, user.id, now))
        for a, my_max in rows
    ]
