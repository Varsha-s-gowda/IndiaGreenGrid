"""D1 - National renewable energy dashboard endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import DbSession, NationalAnalyticsViewer
from app.services import energy_service

router = APIRouter(prefix="/energy", tags=["National Energy"])


@router.get("/overview", summary="Installed capacity, generation and renewable share")
def overview(
    db: DbSession,
    current_user: NationalAnalyticsViewer,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
) -> dict:
    return energy_service.energy_overview(db, year=year)


@router.get("/sources/{source_code}/history", summary="Capacity and generation history for one source")
def source_history(
    source_code: str,
    db: DbSession,
    current_user: NationalAnalyticsViewer,
) -> dict:
    return {
        "source_code": source_code.upper(),
        "items": energy_service.energy_source_history(db, source_code),
    }
