"""Listing business logic: search, visibility, CRUD, photos, favorites."""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from typing import Any

from fastapi import UploadFile
from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models import (
    AuctionStatus,
    Favorite,
    Listing,
    ListingImage,
    ListingStatus,
    ListingType,
    ListingView,
    User,
    UserRole,
)
from app.schemas.common import Page
from app.schemas.listing import (
    ImageRead,
    ListingCard,
    ListingCreate,
    ListingDetail,
    ListingFilters,
    ListingUpdate,
    MakeModels,
)
from app.schemas.user import PublicUser
from app.services import price_service
from app.services.images import OUTPUT_EXTENSION, process_upload
from app.services.storage import StoredFile, delete_quietly, get_storage


class ListingError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------- helpers
def _like(term: str) -> str:
    """Escape LIKE wildcards so user input like '100%' is matched literally."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def is_admin(user: User | None) -> bool:
    return user is not None and user.role == UserRole.ADMIN


def can_manage(listing: Listing, user: User | None) -> bool:
    return user is not None and (listing.seller_id == user.id or is_admin(user))


def favorite_ids(db: Session, user: User | None, listing_ids: Iterable[int]) -> set[int]:
    ids = list(listing_ids)
    if user is None or not ids:
        return set()
    return set(
        db.scalars(select(Favorite.listing_id).where(Favorite.user_id == user.id, Favorite.listing_id.in_(ids)))
    )


def to_card(listing: Listing, fav_ids: set[int] | None = None) -> ListingCard:
    images = listing.images
    return ListingCard(
        id=listing.id,
        title=listing.title,
        make=listing.make,
        model=listing.model,
        year=listing.year,
        mileage=listing.mileage,
        fuel_type=listing.fuel_type,
        transmission=listing.transmission,
        body_type=listing.body_type,
        condition=listing.condition,
        location=listing.location,
        price=listing.price,
        listing_type=listing.listing_type,
        status=listing.status,
        cover_image=images[0].url if images else None,
        image_count=len(images),
        views_count=listing.views_count,
        created_at=listing.created_at,
        is_favorite=listing.id in (fav_ids or set()),
        auction_id=_auction_link(listing),
    )


def _auction_link(listing: Listing) -> int | None:
    """Link cards to the auction page while it's an auction, or if it sold at auction."""
    a = listing.auction
    if a is None or a.status == AuctionStatus.CANCELLED:
        return None
    if listing.listing_type == ListingType.AUCTION or a.winner_id is not None:
        return a.id
    return None


def _open_auction(listing: Listing) -> bool:
    a = listing.auction
    return a is not None and a.status in (AuctionStatus.SCHEDULED, AuctionStatus.LIVE)


def to_detail(db: Session, listing: Listing, viewer: User | None) -> ListingDetail:
    fav_count = db.scalar(select(func.count()).where(Favorite.listing_id == listing.id)) or 0
    card = to_card(listing, favorite_ids(db, viewer, [listing.id]))
    return ListingDetail(
        **card.model_dump(),
        color=listing.color,
        description=listing.description,
        features=list(listing.features or []),
        images=[ImageRead.model_validate(i) for i in listing.images],
        seller=PublicUser.model_validate(listing.seller),
        favorites_count=fav_count,
        updated_at=listing.updated_at,
        is_owner=viewer is not None and viewer.id == listing.seller_id,
        price_insight=price_service.insight_for(listing),
    )


# ---------------------------------------------------------------- queries
_SORTS: dict[str, Sequence[Any]] = {
    "newest": (Listing.created_at.desc(),),
    "oldest": (Listing.created_at.asc(),),
    "price_asc": (Listing.price.asc(),),
    "price_desc": (Listing.price.desc(),),
    "year_desc": (Listing.year.desc(),),
    "year_asc": (Listing.year.asc(),),
    "mileage_asc": (Listing.mileage.asc(),),
}


def _apply_filters(stmt: Select[Any], f: ListingFilters) -> Select[Any]:
    if f.q:
        for term in f.q.split()[:6]:  # every term must match title, make or model
            pattern = _like(term)
            stmt = stmt.where(
                or_(
                    Listing.title.ilike(pattern, escape="\\"),
                    Listing.make.ilike(pattern, escape="\\"),
                    Listing.model.ilike(pattern, escape="\\"),
                )
            )
    if f.make:
        stmt = stmt.where(func.lower(Listing.make) == f.make.lower())
    if f.model:
        stmt = stmt.where(func.lower(Listing.model) == f.model.lower())
    if f.location:
        stmt = stmt.where(Listing.location.ilike(_like(f.location), escape="\\"))
    if f.min_price is not None:
        stmt = stmt.where(Listing.price >= f.min_price)
    if f.max_price is not None:
        stmt = stmt.where(Listing.price <= f.max_price)
    if f.min_year is not None:
        stmt = stmt.where(Listing.year >= f.min_year)
    if f.max_year is not None:
        stmt = stmt.where(Listing.year <= f.max_year)
    if f.max_mileage is not None:
        stmt = stmt.where(Listing.mileage <= f.max_mileage)
    for column, value in (
        (Listing.fuel_type, f.fuel_type),
        (Listing.transmission, f.transmission),
        (Listing.body_type, f.body_type),
        (Listing.condition, f.condition),
        (Listing.listing_type, f.listing_type),
    ):
        if value is not None:
            stmt = stmt.where(column == value)
    if f.seller_id is not None:
        stmt = stmt.where(Listing.seller_id == f.seller_id)
    return stmt


def search_listings(db: Session, f: ListingFilters, viewer: User | None) -> Page[ListingCard]:
    base = _apply_filters(select(Listing).where(Listing.status == ListingStatus.ACTIVE), f)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = list(
        db.scalars(
            base.options(selectinload(Listing.images), selectinload(Listing.auction))
            .order_by(*_SORTS[f.sort], Listing.id.desc())  # id tiebreaker keeps pages stable
            .offset((f.page - 1) * f.page_size)
            .limit(f.page_size)
        )
    )
    favs = favorite_ids(db, viewer, (r.id for r in rows))
    return Page[ListingCard](
        items=price_service.annotate_cards([to_card(r, favs) for r in rows], rows),
        total=total,
        page=f.page,
        page_size=f.page_size,
        pages=max(1, math.ceil(total / f.page_size)),
    )


def makes_and_models(db: Session) -> list[MakeModels]:
    """Distinct makes -> models among active listings, merged case-insensitively."""
    rows = db.execute(
        select(Listing.make, Listing.model, func.count())
        .where(Listing.status == ListingStatus.ACTIVE)
        .group_by(Listing.make, Listing.model)
    ).all()
    grouped: dict[str, dict[str, Any]] = {}
    for make, model, count in rows:
        entry = grouped.setdefault(make.lower(), {"make": make, "count": 0, "models": {}})
        entry["count"] += count
        entry["models"].setdefault(model.lower(), model)
    return sorted(
        (MakeModels(make=e["make"], count=e["count"], models=sorted(e["models"].values(), key=str.lower))
         for e in grouped.values()),
        key=lambda m: m.make.lower(),
    )


def get_listing(db: Session, listing_id: int) -> Listing | None:
    return db.scalar(
        select(Listing)
        .where(Listing.id == listing_id)
        .options(selectinload(Listing.images), selectinload(Listing.seller), selectinload(Listing.auction))
    )


def get_visible_listing(db: Session, listing_id: int, viewer: User | None) -> Listing:
    """Active listings are public; others only to their owner or an admin (404 otherwise,
    so hidden listings can't be probed)."""
    listing = get_listing(db, listing_id)
    if listing is None or (listing.status != ListingStatus.ACTIVE and not can_manage(listing, viewer)):
        raise ListingError("Listing not found", 404)
    return listing


def get_managed_listing(db: Session, listing_id: int, user: User) -> Listing:
    listing = get_listing(db, listing_id)
    if listing is None:
        raise ListingError("Listing not found", 404)
    if not can_manage(listing, user):
        raise ListingError("You can only manage your own listings", 403)
    return listing


def record_view(db: Session, listing: Listing, viewer: User | None, device_id: str) -> bool:
    """Count a view once per device (the seller's own views never count). Returns True if
    this device hadn't viewed the listing before, i.e. the counter went up."""
    if viewer is not None and viewer.id == listing.seller_id:
        return False
    db.add(ListingView(listing_id=listing.id, device_id=device_id))
    try:
        db.flush()
    except IntegrityError:  # this device already counted (unique listing_id + device_id)
        db.rollback()  # nothing else is pending in this request's transaction
        return False
    # Atomic SQL increment (no lost updates under concurrency). SQLAlchemy's
    # session synchronisation also bumps the in-memory `listing.views_count`.
    db.execute(update(Listing).where(Listing.id == listing.id).values(views_count=Listing.views_count + 1))
    db.commit()
    return True


def user_listings(db: Session, user: User) -> list[ListingCard]:
    rows = db.scalars(
        select(Listing)
        .where(Listing.seller_id == user.id)
        .options(selectinload(Listing.images), selectinload(Listing.auction))
        .order_by(Listing.created_at.desc(), Listing.id.desc())
        .limit(200)
    )
    rows = list(rows)
    return price_service.annotate_cards([to_card(r) for r in rows], rows)


def user_favorites(db: Session, user: User) -> list[ListingCard]:
    rows = db.scalars(
        select(Listing)
        .join(Favorite, Favorite.listing_id == Listing.id)
        .where(Favorite.user_id == user.id)
        .options(selectinload(Listing.images), selectinload(Listing.auction))
        .order_by(Favorite.created_at.desc(), Favorite.id.desc())
        .limit(200)
    )
    rows = list(rows)
    return price_service.annotate_cards([to_card(r, {r.id}) for r in rows], rows)  # all favorites


# ---------------------------------------------------------------- writes
def create_listing(db: Session, seller: User, data: ListingCreate) -> Listing:
    status = (
        ListingStatus.PENDING
        if settings.REQUIRE_LISTING_APPROVAL and not is_admin(seller)
        else ListingStatus.ACTIVE
    )
    listing = Listing(seller_id=seller.id, status=status, **data.model_dump())
    db.add(listing)
    db.commit()
    return get_listing(db, listing.id)  # type: ignore[return-value]


# Owner-driven status transitions. Pending/rejected listings can't be activated by
# their owner, so the approval flow can't be bypassed.
_OWNER_TRANSITIONS: dict[ListingStatus, set[ListingStatus]] = {
    ListingStatus.ACTIVE: {ListingStatus.INACTIVE, ListingStatus.SOLD},
    ListingStatus.INACTIVE: {ListingStatus.ACTIVE, ListingStatus.SOLD},
    ListingStatus.SOLD: {ListingStatus.ACTIVE, ListingStatus.INACTIVE},
    ListingStatus.PENDING: {ListingStatus.INACTIVE},
    ListingStatus.REJECTED: set(),
}


def update_listing(db: Session, listing: Listing, data: ListingUpdate, actor: User) -> Listing:
    payload = data.model_dump(exclude_unset=True)
    new_status = payload.pop("status", None)
    changes = {k: v for k, v in payload.items() if v is not None}  # explicit nulls are ignored

    # While an auction is scheduled/live, price and availability belong to the auction.
    if _open_auction(listing) and not is_admin(actor):
        if "price" in changes and changes["price"] != listing.price:
            raise ListingError("The price is set by the auction. Cancel the auction to change it.", 409)
        if new_status is not None and ListingStatus(new_status) != listing.status:
            raise ListingError("This car is in an auction. Cancel the auction first.", 409)

    if new_status is not None:
        target = ListingStatus(new_status)
        if target != listing.status:
            if not is_admin(actor) and target not in _OWNER_TRANSITIONS[listing.status]:
                raise ListingError(f"Can't change a {listing.status.value} listing to {target.value}", 409)
            listing.status = target

    for field, value in changes.items():
        setattr(listing, field, value)

    # Editing a rejected listing re-submits it for review.
    if changes and listing.status == ListingStatus.REJECTED and not is_admin(actor):
        listing.status = ListingStatus.PENDING

    db.commit()
    return get_listing(db, listing.id)  # type: ignore[return-value]


def delete_listing(db: Session, listing: Listing, actor: User | None = None) -> None:
    if _open_auction(listing) and listing.auction.bid_count > 0 and not is_admin(actor):  # type: ignore[union-attr]
        raise ListingError("This car has live bids and can't be deleted", 409)
    keys = [img.storage_key for img in listing.images]
    db.delete(listing)
    db.commit()
    for key in keys:  # remove files only after the DB commit succeeds
        delete_quietly(key)


def add_images(db: Session, listing: Listing, uploads: list[UploadFile]) -> list[ListingImage]:
    if not uploads:
        raise ListingError("Choose at least one image")
    remaining = settings.MAX_IMAGES_PER_LISTING - len(listing.images)
    if len(uploads) > remaining:
        raise ListingError(
            f"A listing can have at most {settings.MAX_IMAGES_PER_LISTING} photos "
            f"({max(remaining, 0)} more allowed)"
        )

    # Validate everything first so a bad file doesn't leave a half-uploaded set.
    processed = [process_upload(u) for u in uploads]

    storage = get_storage()
    saved: list[StoredFile] = []
    try:
        next_pos = max((i.position for i in listing.images), default=-1) + 1
        new_images: list[ListingImage] = []
        for offset, data in enumerate(processed):
            stored = storage.save(data, extension=OUTPUT_EXTENSION, folder=f"listings/{listing.id}")
            saved.append(stored)
            img = ListingImage(listing_id=listing.id, url=stored.url, storage_key=stored.key, position=next_pos + offset)
            db.add(img)
            new_images.append(img)
        db.commit()
    except Exception:
        db.rollback()
        for s in saved:
            delete_quietly(s.key)
        raise
    db.refresh(listing)
    return new_images


def delete_image(db: Session, listing: Listing, image_id: int) -> None:
    image = next((i for i in listing.images if i.id == image_id), None)
    if image is None:
        raise ListingError("Image not found", 404)
    key = image.storage_key
    listing.images.remove(image)
    for pos, img in enumerate(listing.images):  # keep positions contiguous
        img.position = pos
    db.commit()
    delete_quietly(key)


def reorder_images(db: Session, listing: Listing, image_ids: list[int]) -> list[ListingImage]:
    current = {i.id: i for i in listing.images}
    if sorted(image_ids) != sorted(current):
        raise ListingError("image_ids must list every photo of this listing exactly once")
    for pos, image_id in enumerate(image_ids):
        current[image_id].position = pos
    db.commit()
    db.expire(listing, ["images"])
    return list(listing.images)


def add_favorite(db: Session, user: User, listing: Listing) -> None:
    exists = db.scalar(select(Favorite.id).where(Favorite.user_id == user.id, Favorite.listing_id == listing.id))
    if exists:
        return
    db.add(Favorite(user_id=user.id, listing_id=listing.id))
    try:
        db.commit()
    except IntegrityError:  # concurrent double-click: already favorited
        db.rollback()


def remove_favorite(db: Session, user: User, listing_id: int) -> None:
    fav = db.scalar(select(Favorite).where(Favorite.user_id == user.id, Favorite.listing_id == listing_id))
    if fav:
        db.delete(fav)
        db.commit()
