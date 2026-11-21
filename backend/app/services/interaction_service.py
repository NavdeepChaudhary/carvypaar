"""Offers ("Make offer") and contact messages ("Contact seller")."""
from __future__ import annotations

from typing import Literal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import utcnow
from app.models import (
    Listing,
    ListingStatus,
    ListingType,
    Message,
    NotificationType,
    Offer,
    OfferStatus,
    User,
)
from app.schemas.interaction import MessageRead, OfferRead
from app.schemas.user import PublicUser
from app.services.listing_service import ListingError
from app.services.notification_service import notify


def _fmt_money(amount: object) -> str:
    return f"₹{float(amount):,.0f}"  # type: ignore[arg-type]


# ---------------------------------------------------------------- offers
def to_offer_read(offer: Offer) -> OfferRead:
    listing = offer.listing
    return OfferRead(
        id=offer.id,
        listing_id=listing.id,
        listing_title=listing.title,
        listing_price=listing.price,
        cover_image=listing.images[0].url if listing.images else None,
        buyer=PublicUser.model_validate(offer.buyer),
        amount=offer.amount,
        message=offer.message,
        status=offer.status,
        created_at=offer.created_at,
        updated_at=offer.updated_at,
    )


def _offer_query():  # type: ignore[no-untyped-def]
    return select(Offer).options(
        selectinload(Offer.listing).selectinload(Listing.images), selectinload(Offer.buyer)
    )


def make_offer(db: Session, buyer: User, listing: Listing, amount, message: str | None) -> Offer:  # type: ignore[no-untyped-def]
    if listing.seller_id == buyer.id:
        raise ListingError("You can't make an offer on your own listing", 403)
    if listing.status != ListingStatus.ACTIVE:
        raise ListingError("This listing is not accepting offers", 409)
    if listing.listing_type != ListingType.SALE:
        raise ListingError("Auction listings take bids, not offers", 409)

    # One live offer per buyer per listing: a new offer replaces the pending one.
    existing = db.scalar(
        select(Offer).where(
            Offer.listing_id == listing.id, Offer.buyer_id == buyer.id, Offer.status == OfferStatus.PENDING
        )
    )
    if existing:
        existing.status = OfferStatus.WITHDRAWN

    offer = Offer(listing_id=listing.id, buyer_id=buyer.id, amount=amount, message=message)
    db.add(offer)
    db.flush()
    notify(
        db,
        listing.seller_id,
        NotificationType.OFFER_RECEIVED,
        title=f"New offer: {_fmt_money(amount)} for your {listing.year} {listing.make} {listing.model}",
        body=message or "",
        link="/garage?tab=offers",
        data={"offer_id": offer.id, "listing_id": listing.id},
    )
    db.commit()
    return db.scalar(_offer_query().where(Offer.id == offer.id))  # type: ignore[return-value]


def list_offers(db: Session, user: User, box: Literal["received", "sent"]) -> list[Offer]:
    stmt = _offer_query()
    if box == "received":
        stmt = stmt.join(Listing, Listing.id == Offer.listing_id).where(Listing.seller_id == user.id)
    else:
        stmt = stmt.where(Offer.buyer_id == user.id)
    return list(db.scalars(stmt.order_by(Offer.created_at.desc(), Offer.id.desc()).limit(200)))


def update_offer_status(db: Session, user: User, offer_id: int, status: str) -> Offer:
    offer = db.scalar(_offer_query().where(Offer.id == offer_id))
    if offer is None:
        raise ListingError("Offer not found", 404)
    is_seller = offer.listing.seller_id == user.id
    is_buyer = offer.buyer_id == user.id
    if not (is_seller or is_buyer):
        raise ListingError("Offer not found", 404)
    if offer.status != OfferStatus.PENDING:
        raise ListingError(f"This offer is already {offer.status.value}", 409)

    target = OfferStatus(status)
    if target in (OfferStatus.ACCEPTED, OfferStatus.REJECTED) and not is_seller:
        raise ListingError("Only the seller can accept or reject an offer", 403)
    if target == OfferStatus.WITHDRAWN and not is_buyer:
        raise ListingError("Only the buyer can withdraw an offer", 403)

    offer.status = target
    listing = offer.listing
    if target == OfferStatus.WITHDRAWN:
        notify(db, listing.seller_id, NotificationType.OFFER_UPDATED,
               title=f"An offer on your {listing.make} {listing.model} was withdrawn",
               link="/garage?tab=offers", data={"offer_id": offer.id})
    else:
        verb = "accepted" if target == OfferStatus.ACCEPTED else "declined"
        notify(db, offer.buyer_id, NotificationType.OFFER_UPDATED,
               title=f"Your {_fmt_money(offer.amount)} offer was {verb}",
               body=f"{listing.year} {listing.make} {listing.model}",
               link=f"/cars/{listing.id}", data={"offer_id": offer.id, "listing_id": listing.id})
    db.commit()
    return offer


# ---------------------------------------------------------------- messages
def to_message_read(m: Message) -> MessageRead:
    return MessageRead(
        id=m.id,
        listing_id=m.listing_id,
        listing_title=m.listing.title,
        sender=PublicUser.model_validate(m.sender),
        recipient=PublicUser.model_validate(m.recipient),
        body=m.body,
        read_at=m.read_at,
        created_at=m.created_at,
    )


def _message_query():  # type: ignore[no-untyped-def]
    return select(Message).options(
        selectinload(Message.listing), selectinload(Message.sender), selectinload(Message.recipient)
    )


def _send(db: Session, *, listing: Listing, sender: User, recipient_id: int, body: str) -> Message:
    msg = Message(listing_id=listing.id, sender_id=sender.id, recipient_id=recipient_id, body=body)
    db.add(msg)
    db.flush()
    notify(
        db,
        recipient_id,
        NotificationType.MESSAGE,
        title=f"{sender.full_name} sent you a message",
        body=body[:200],
        link="/garage?tab=messages",
        data={"message_id": msg.id, "listing_id": listing.id},
    )
    db.commit()
    return db.scalar(_message_query().where(Message.id == msg.id))  # type: ignore[return-value]


def contact_seller(db: Session, sender: User, listing: Listing, body: str) -> Message:
    if listing.seller_id == sender.id:
        raise ListingError("This is your own listing", 403)
    if listing.status != ListingStatus.ACTIVE:
        raise ListingError("This listing is no longer available", 409)
    return _send(db, listing=listing, sender=sender, recipient_id=listing.seller_id, body=body)


def reply(db: Session, user: User, message_id: int, body: str) -> Message:
    original = db.scalar(_message_query().where(Message.id == message_id))
    if original is None or user.id not in (original.sender_id, original.recipient_id):
        raise ListingError("Message not found", 404)
    other = original.sender_id if original.recipient_id == user.id else original.recipient_id
    return _send(db, listing=original.listing, sender=user, recipient_id=other, body=body)


def list_messages(db: Session, user: User) -> list[Message]:
    return list(
        db.scalars(
            _message_query()
            .where(or_(Message.sender_id == user.id, Message.recipient_id == user.id))
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(200)
        )
    )


def mark_message_read(db: Session, user: User, message_id: int) -> None:
    msg = db.get(Message, message_id)
    if msg is None or msg.recipient_id != user.id:
        raise ListingError("Message not found", 404)
    if msg.read_at is None:
        msg.read_at = utcnow()
        db.commit()
