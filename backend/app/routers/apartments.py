"""Apartment inventory endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import (
    ApartmentSummaryViewer,
    ApartmentViewer,
    DbSession,
)
from app.schemas.apartment import ApartmentListResponse, ApartmentSummaryResponse
from app.services import apartment_service

router = APIRouter(prefix="/apartments", tags=["Apartments"])


@router.get(
    "",
    response_model=ApartmentListResponse,
    summary="List apartments with optional filters",
)
def list_apartments(
    db: DbSession,
    current_user: ApartmentViewer,
    floor_number: Annotated[int | None, Query(ge=0)] = None,
    apartment_category: Annotated[str | None, Query(max_length=50)] = None,
    consumption_profile: Annotated[str | None, Query(max_length=30)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApartmentListResponse:
    result = apartment_service.list_apartments(
        db,
        floor_number=floor_number,
        apartment_category=apartment_category,
        consumption_profile=consumption_profile,
        limit=limit,
        offset=offset,
    )
    return ApartmentListResponse(
        total=result.total,
        limit=limit,
        offset=offset,
        items=result.items,
    )


@router.get(
    "/summary",
    response_model=ApartmentSummaryResponse,
    summary="Society-level apartment and household profile summary",
)
def apartment_summary(
    db: DbSession,
    current_user: ApartmentSummaryViewer,
) -> ApartmentSummaryResponse:
    return ApartmentSummaryResponse(**apartment_service.apartment_summary(db))
