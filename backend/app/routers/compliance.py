"""Monthly RPO compliance filing endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.ecosystem import ComplianceRecordCreate, ComplianceReview
from app.services import compliance_service

router = APIRouter(prefix="/compliance", tags=["RPO Compliance Workflow"])


@router.get("/records", summary="List monthly compliance records in your scope")
def list_records(
    db: DbSession,
    current_user: CurrentUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=30)] = None,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return compliance_service.list_records(
        db,
        current_user,
        status=status_filter,
        year=year,
        month=month,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/summary", summary="Compliance trend and totals")
def summary(db: DbSession, current_user: CurrentUser) -> dict:
    return compliance_service.summary(db, current_user)


@router.post(
    "/records",
    status_code=status.HTTP_201_CREATED,
    summary="Create a monthly compliance draft",
)
def create_record(
    payload: ComplianceRecordCreate, db: DbSession, current_user: CurrentUser
) -> dict:
    return compliance_service.create_record(db, current_user, payload)


@router.put("/records/{record_id}", summary="Update a compliance draft")
def update_record(
    record_id: int,
    payload: ComplianceRecordCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return compliance_service.update_record(db, current_user, record_id, payload)


@router.post("/records/{record_id}/submit", summary="Submit a compliance filing")
def submit_record(record_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return compliance_service.submit_record(db, current_user, record_id)


@router.post("/records/{record_id}/review", summary="Administrator reviews a filing")
def review_record(
    record_id: int,
    payload: ComplianceReview,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return compliance_service.review_record(db, current_user, record_id, payload)
