"""/api/listings: search, CRUD, photos and favorites.

Service-layer errors (ListingError, ImageValidationError) are converted to
JSON responses by handlers registered in app.main.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user, require_roles
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.common import Page
from app.schemas.interaction import MessageCreate, MessageRead, OfferCreate, OfferRead
from app.schemas.listing import (
    ImageOrder,
    ImageRead,
    ListingCard,
    ListingCreate,
    ListingDetail,
    ListingFilters,
    ListingUpdate,
    MakeModels,
)
from app.services import interaction_service as interactions
from app.services import listing_service as svc

router = APIRouter(prefix="/listings", tags=["listings"])

require_seller = require_roles(UserRole.SELLER, UserRole.ADMIN)


# ---------------------------------------------------------------- read
@router.get("", response_model=Page[ListingCard])
def search(
    filters: Annotated[ListingFilters, Query()],
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> Page[ListingCard]:
    """Public search over active listings with filters, sorting and pagination."""
    return svc.search_listings(db, filters, viewer)


@router.get("/makes", response_model=list[MakeModels])
def makes(db: Session = Depends(get_db)) -> list[MakeModels]:
    """Makes and their models among active listings (feeds filter dropdowns)."""
    return svc.makes_and_models(db)


@router.get("/{listing_id}", response_model=ListingDetail)
def detail(
    listing_id: int, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)
) -> ListingDetail:
    listing = svc.get_visible_listing(db, listing_id, viewer)
    svc.record_view(db, listing, viewer)
    return svc.to_detail(db, listing, viewer)


# ---------------------------------------------------------------- write
@router.post("", response_model=ListingDetail, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
def create(
    request: Request, payload: ListingCreate, user: User = Depends(require_seller), db: Session = Depends(get_db)
) -> ListingDetail:
    """Sellers (and admins) create a listing. Upload photos with POST /{id}/images."""
    listing = svc.create_listing(db, user, payload)
    return svc.to_detail(db, listing, user)


@router.patch("/{listing_id}", response_model=ListingDetail)
def update(
    listing_id: int, payload: ListingUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ListingDetail:
    listing = svc.get_managed_listing(db, listing_id, user)
    listing = svc.update_listing(db, listing, payload, user)
    return svc.to_detail(db, listing, user)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(listing_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.delete_listing(db, svc.get_managed_listing(db, listing_id, user), user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- photos
@router.post("/{listing_id}/images", response_model=list[ImageRead], status_code=status.HTTP_201_CREATED)
@limiter.limit("30/hour")
def upload_images(
    request: Request,
    listing_id: int,
    files: list[UploadFile] = File(..., description="Up to 10 JPEG/PNG/WebP images in total"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ImageRead]:
    listing = svc.get_managed_listing(db, listing_id, user)
    svc.add_images(db, listing, files)
    return [ImageRead.model_validate(i) for i in listing.images]


@router.put("/{listing_id}/images/order", response_model=list[ImageRead])
def reorder_images(
    listing_id: int, payload: ImageOrder, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ImageRead]:
    listing = svc.get_managed_listing(db, listing_id, user)
    return [ImageRead.model_validate(i) for i in svc.reorder_images(db, listing, payload.image_ids)]


@router.delete("/{listing_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    listing_id: int, image_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    svc.delete_image(db, svc.get_managed_listing(db, listing_id, user), image_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- favorites
@router.post("/{listing_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def favorite(listing_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.add_favorite(db, user, svc.get_visible_listing(db, listing_id, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{listing_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def unfavorite(listing_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.remove_favorite(db, user, listing_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- buyer actions
@router.post("/{listing_id}/offers", response_model=OfferRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def make_offer(
    request: Request,
    listing_id: int,
    payload: OfferCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OfferRead:
    listing = svc.get_visible_listing(db, listing_id, user)
    offer = interactions.make_offer(db, user, listing, payload.amount, payload.message)
    return interactions.to_offer_read(offer)


@router.post("/{listing_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def contact_seller(
    request: Request,
    listing_id: int,
    payload: MessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageRead:
    listing = svc.get_visible_listing(db, listing_id, user)
    return interactions.to_message_read(interactions.contact_seller(db, user, listing, payload.body))
