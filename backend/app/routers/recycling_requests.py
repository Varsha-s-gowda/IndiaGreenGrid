"""Citizen recycling pickup and recycler processing endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.ecosystem import (
    CollectionUpdate,
    PickupSchedule,
    ProcessingUpdate,
    RecyclingDecision,
    RecyclingRequestCreate,
)
from app.services import recycling_request_service

router = APIRouter(prefix="/recycling-requests", tags=["Recycling Workflow"])


@router.get("/categories", summary="Supported recycling categories")
def categories(current_user: CurrentUser) -> dict:
    return {"items": recycling_request_service.recycled_category_options()}


@router.get("", summary="List recycling pickup requests in your scope")
def list_requests(
    db: DbSession,
    current_user: CurrentUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=30)] = None,
    waste_category: Annotated[str | None, Query(max_length=40)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return recycling_request_service.list_requests(
        db,
        current_user,
        status=status_filter,
        waste_category=waste_category,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Request an e-waste, battery or solar-panel pickup",
)
def create_request(
    payload: RecyclingRequestCreate, db: DbSession, current_user: CurrentUser
) -> dict:
    return recycling_request_service.create_request(db, current_user, payload)


@router.get("/analytics", summary="Recycler collection and recovery analytics")
def analytics(db: DbSession, current_user: CurrentUser) -> dict:
    return recycling_request_service.recycler_analytics(db, current_user)


@router.get("/{request_id}", summary="Recycling request detail with timeline")
def request_detail(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return recycling_request_service.get_detail(db, current_user, request_id)


@router.post("/{request_id}/accept", summary="Recycler accepts a pickup request")
def accept_request(
    request_id: int,
    payload: RecyclingDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.accept_request(db, current_user, request_id, payload.note)


@router.post("/{request_id}/reject", summary="Recycler rejects a pickup request")
def reject_request(
    request_id: int,
    payload: RecyclingDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.reject_request(db, current_user, request_id, payload.note)


@router.post("/{request_id}/schedule", summary="Schedule a pickup")
def schedule_pickup(
    request_id: int,
    payload: PickupSchedule,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.schedule_pickup(db, current_user, request_id, payload)


@router.post("/{request_id}/collect", summary="Record collected weight")
def record_collection(
    request_id: int,
    payload: CollectionUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.record_collection(db, current_user, request_id, payload)


@router.post("/{request_id}/process", summary="Record processing and recovered materials")
def record_processing(
    request_id: int,
    payload: ProcessingUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.record_processing(db, current_user, request_id, payload)


@router.post("/{request_id}/complete", summary="Complete processing and issue a certificate")
def complete_request(
    request_id: int,
    payload: RecyclingDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.complete_request(db, current_user, request_id, payload.note)


@router.post("/{request_id}/cancel", summary="Citizen cancels a pickup request")
def cancel_request(
    request_id: int,
    payload: RecyclingDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return recycling_request_service.cancel_request(db, current_user, request_id, payload.note)
