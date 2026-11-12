"""Shared helpers for the ecosystem services."""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError
from app.models.ecosystem import Notification, OrganisationProfile
from app.models.user import ORGANISATION_ROLES, User, UserRole


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_reference(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


def user_brief(user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "organization": user.organization,
        "verification_status": user.verification_status,
    }


def get_organisation(db: Session, user: User) -> OrganisationProfile | None:
    return db.scalar(
        select(OrganisationProfile).where(OrganisationProfile.owner_id == user.id)
    )


def require_organisation(
    db: Session, user: User, *, require_verified: bool = True
) -> OrganisationProfile:
    profile = get_organisation(db, user)
    if profile is None:
        raise ForbiddenError(
            "Complete your organisation profile before using this feature."
        )
    if profile.is_suspended:
        raise ForbiddenError("This organisation is suspended. Contact an administrator.")
    if require_verified and profile.verification_status != "VERIFIED":
        raise ForbiddenError(
            "Your organisation must be verified before performing this action.",
            details={"verification_status": profile.verification_status},
        )
    return profile


def is_organisation_role(user: User) -> bool:
    return user.role in ORGANISATION_ROLES


def notify(
    db: Session,
    user_id: int | None,
    *,
    title: str,
    message: str = "",
    category: str = "SYSTEM",
    link: str = "",
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Notification | None:
    if not user_id:
        return None
    entry = Notification(
        user_id=user_id,
        title=title,
        message=message,
        category=category,
        link=link,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(entry)
    return entry


def notify_many(
    db: Session,
    user_ids: Iterable[int | None],
    *,
    title: str,
    message: str = "",
    category: str = "SYSTEM",
    link: str = "",
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> None:
    seen: set[int] = set()
    for user_id in user_ids:
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        notify(
            db,
            user_id,
            title=title,
            message=message,
            category=category,
            link=link,
            entity_type=entity_type,
            entity_id=entity_id,
        )


def admin_ids(db: Session) -> list[int]:
    return list(
        db.scalars(select(User.id).where(User.role == UserRole.ADMIN)).all()
    )


def paginate(stmt, db: Session, *, page: int, page_size: int) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)) if total else 1,
    }


def get_or_404(db: Session, model, entity_id: int, label: str):
    from app.core.exceptions import NotFoundError

    entity = db.get(model, entity_id)
    if entity is None:
        raise NotFoundError(f"{label} was not found.")
    return entity


def status_transition(current: str, target: str, allowed: dict[str, set[str]]) -> None:
    if target not in allowed.get(current, set()):
        raise BadRequestError(
            f"Cannot move from {current} to {target}.",
            details={"current_status": current, "allowed_next": sorted(allowed.get(current, set()))},
        )
