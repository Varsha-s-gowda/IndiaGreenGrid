"""In-app notification endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DbSession
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", summary="List my notifications")
def list_notifications(
    db: DbSession,
    current_user: CurrentUser,
    unread_only: Annotated[bool, Query()] = False,
    category: Annotated[str | None, Query(max_length=30)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return notification_service.list_notifications(
        db,
        current_user,
        unread_only=unread_only,
        category=category,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", summary="Unread notification count")
def unread_count(db: DbSession, current_user: CurrentUser) -> dict:
    return {"unread_count": notification_service.unread_count(db, current_user)}


@router.post("/read-all", summary="Mark all notifications as read")
def mark_all_read(db: DbSession, current_user: CurrentUser) -> dict:
    return notification_service.mark_all_read(db, current_user)


@router.post("/{notification_id}/read", summary="Mark a notification as read")
def mark_read(notification_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return notification_service.mark_read(db, current_user, notification_id)


@router.post("/{notification_id}/unread", summary="Mark a notification as unread")
def mark_unread(notification_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return notification_service.mark_unread(db, current_user, notification_id)
