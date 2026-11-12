"""PostgreSQL-backed in-app notifications."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.ecosystem import Notification
from app.models.user import User
from app.services.ecosystem_common import paginate


def serialise(notification: Notification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "title": notification.title,
        "message": notification.message,
        "category": notification.category,
        "link": notification.link,
        "entity_type": notification.entity_type,
        "entity_id": notification.entity_id,
        "is_read": notification.is_read,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def list_notifications(
    db: Session,
    user: User,
    *,
    unread_only: bool = False,
    category: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    if category:
        stmt = stmt.where(Notification.category == category)
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise(item) for item in result["items"]]
    result["unread_count"] = unread_count(db, user)
    return result


def unread_count(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id,
                Notification.is_read.is_(False),
            )
        )
        or 0
    )


def mark_read(db: Session, user: User, notification_id: int) -> dict[str, Any]:
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if notification is None:
        raise NotFoundError("Notification was not found.")
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)
    return serialise(notification)


def mark_unread(db: Session, user: User, notification_id: int) -> dict[str, Any]:
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if notification is None:
        raise NotFoundError("Notification was not found.")
    notification.is_read = False
    notification.read_at = None
    db.commit()
    db.refresh(notification)
    return serialise(notification)


def mark_all_read(db: Session, user: User) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    rows = db.scalars(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    ).all()
    for notification in rows:
        notification.is_read = True
        notification.read_at = now
    db.commit()
    return {"updated": len(rows), "unread_count": 0}
