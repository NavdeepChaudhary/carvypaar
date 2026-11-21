"""Create, query and push in-app notifications.

`notify()` only adds to the session; the caller commits, so a notification is
saved in the same transaction as the event that caused it. Once that commit
succeeds, an `after_commit` hook pushes it to the user's open WebSockets. Rolled-back
notifications are never pushed.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import event, func, select, update
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.models import Notification, NotificationType
from app.realtime import hub
from app.schemas.interaction import NotificationRead

_PENDING_KEY = "pending_notifications"


def notify(
    db: Session,
    user_id: int,
    type_: NotificationType,
    title: str,
    body: str = "",
    link: str | None = None,
    data: dict[str, Any] | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        type=type_,
        title=title[:200],
        body=body,
        link=link,
        data=data or {},
        is_read=False,
        created_at=utcnow(),  # set in Python so the push payload is complete without a reload
    )
    db.add(n)
    db.info.setdefault(_PENDING_KEY, []).append(n)
    return n


@event.listens_for(Session, "after_commit")
def _push_after_commit(session: Session) -> None:
    pending: list[Notification] | None = session.info.pop(_PENDING_KEY, None)
    for n in pending or []:
        payload = NotificationRead.model_validate(n).model_dump(mode="json")
        hub.publish_user(n.user_id, {"type": "notification", "notification": payload})


@event.listens_for(Session, "after_rollback")
def _discard_after_rollback(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)


def list_for_user(db: Session, user_id: int, *, unread_only: bool, limit: int) -> tuple[list[Notification], int]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    items = list(db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)))
    unread = db.scalar(
        select(func.count()).where(Notification.user_id == user_id, Notification.is_read.is_(False))
    ) or 0
    return items, unread


def mark_read(db: Session, user_id: int, notification_id: int) -> bool:
    result = db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(is_read=True)
    )
    db.commit()
    return result.rowcount > 0


def mark_all_read(db: Session, user_id: int) -> None:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
