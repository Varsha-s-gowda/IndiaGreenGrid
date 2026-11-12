"""Audit-log helper shared by every platform module."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.green_grid import AuditLog
from app.models.user import User


def record_audit(
    db: Session,
    user: User | None,
    *,
    action: str,
    module: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    description: str = "",
    details: dict[str, Any] | None = None,
    commit: bool = True,
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else "system",
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        details=details,
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()
    return entry
