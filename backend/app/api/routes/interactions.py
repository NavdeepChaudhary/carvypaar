"""/api/offers, /api/messages and /api/notifications for the signed-in user."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models import User
from app.schemas.interaction import (
    MessageCreate,
    MessageRead,
    NotificationList,
    NotificationRead,
    OfferRead,
    OfferStatusUpdate,
)
from app.services import interaction_service as svc
from app.services import notification_service

offers = APIRouter(prefix="/offers", tags=["offers"])
messages = APIRouter(prefix="/messages", tags=["messages"])
notifications = APIRouter(prefix="/notifications", tags=["notifications"])


# ---------------------------------------------------------------- offers
@offers.get("", response_model=list[OfferRead])
def list_offers(
    box: Literal["received", "sent"] = "received",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OfferRead]:
    """`received`: offers on my listings. `sent`: offers I made."""
    return [svc.to_offer_read(o) for o in svc.list_offers(db, user, box)]


@offers.patch("/{offer_id}", response_model=OfferRead)
def update_offer(
    offer_id: int, payload: OfferStatusUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> OfferRead:
    return svc.to_offer_read(svc.update_offer_status(db, user, offer_id, payload.status))


# ---------------------------------------------------------------- messages
@messages.get("", response_model=list[MessageRead])
def list_messages(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MessageRead]:
    return [svc.to_message_read(m) for m in svc.list_messages(db, user)]


@messages.post("/{message_id}/reply", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def reply(
    request: Request,
    message_id: int,
    payload: MessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageRead:
    return svc.to_message_read(svc.reply(db, user, message_id, payload.body))


@messages.post("/{message_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def read_message(message_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    svc.mark_message_read(db, user, message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- notifications
@notifications.get("", response_model=NotificationList)
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationList:
    items, unread = notification_service.list_for_user(db, user.id, unread_only=unread_only, limit=limit)
    return NotificationList(items=[NotificationRead.model_validate(n) for n in items], unread_count=unread)


@notifications.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    notification_service.mark_all_read(db, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@notifications.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def read_one(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    if not notification_service.mark_read(db, user.id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
