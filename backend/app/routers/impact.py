"""D7 - Environmental impact endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import DbSession, ImpactViewer
from app.services import impact_service

router = APIRouter(prefix="/impact", tags=["Environmental Impact"])


@router.get("/overview", summary="Avoided emissions, regional comparison and air quality")
def overview(db: DbSession, current_user: ImpactViewer) -> dict:
    return impact_service.overview(db)
