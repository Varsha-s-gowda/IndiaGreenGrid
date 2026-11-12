"""National platform dashboard endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, DbSession
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["National Dashboard"])


@router.get(
    "/overview",
    summary="Role-aware national renewable energy dashboard",
)
def overview(db: DbSession, current_user: CurrentUser) -> dict:
    return dashboard_service.overview(db, current_user)
