"""Rooftop solar request, quotation and installation endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.ecosystem import (
    InstallationProgressUpdate,
    InspectionSchedule,
    QuotationWithdraw,
    SolarInstallationRequestCreate,
    SolarQuotationCreate,
    SolarRequestDecision,
)
from app.services import solar_request_service as solar_service

router = APIRouter(tags=["Solar Installation Workflow"])


@router.get("/installers", summary="Browse verified solar installers")
def installers(
    db: DbSession,
    current_user: CurrentUser,
    search: Annotated[str | None, Query(max_length=120)] = None,
    state: Annotated[str | None, Query(max_length=80)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return solar_service.installer_directory(
        db, search=search, state=state, page=page, page_size=page_size
    )


@router.get("/solar-requests", summary="List solar installation requests in your scope")
def list_requests(
    db: DbSession,
    current_user: CurrentUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=40)] = None,
    state: Annotated[str | None, Query(max_length=80)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return solar_service.list_requests(
        db,
        current_user,
        status=status_filter,
        state=state,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/solar-requests",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a rooftop solar installation request",
)
def create_request(
    payload: SolarInstallationRequestCreate, db: DbSession, current_user: CurrentUser
) -> dict:
    return solar_service.create_request(db, current_user, payload)


@router.get("/solar-requests/{request_id}", summary="Solar request detail with quotations")
def request_detail(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return solar_service.get_request_detail(db, current_user, request_id)


@router.post("/solar-requests/{request_id}/accept", summary="Installer accepts a request")
def accept_request(
    request_id: int,
    payload: SolarRequestDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.accept_request(db, current_user, request_id, payload.note)


@router.post("/solar-requests/{request_id}/reject", summary="Installer rejects a request")
def reject_request(
    request_id: int,
    payload: SolarRequestDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.reject_request(db, current_user, request_id, payload.note)


@router.post(
    "/solar-requests/{request_id}/schedule-inspection",
    summary="Schedule a site inspection",
)
def schedule_inspection(
    request_id: int,
    payload: InspectionSchedule,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.schedule_inspection(db, current_user, request_id, payload)


@router.post(
    "/solar-requests/{request_id}/quotations",
    status_code=status.HTTP_201_CREATED,
    summary="Submit an installation quotation",
)
def submit_quotation(
    request_id: int,
    payload: SolarQuotationCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.submit_quotation(db, current_user, request_id, payload)


@router.get("/solar-requests/{request_id}/quotations", summary="List quotations for a request")
def list_quotations(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return {"items": solar_service.list_quotations(db, current_user, request_id)}


@router.post("/solar-requests/{request_id}/cancel", summary="Citizen cancels a request")
def cancel_request(
    request_id: int,
    payload: SolarRequestDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.cancel_request(db, current_user, request_id, payload.note)


@router.post(
    "/solar-requests/{request_id}/progress",
    summary="Installer updates installation progress",
)
def update_progress(
    request_id: int,
    payload: InstallationProgressUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.update_installation(db, current_user, request_id, payload)


@router.post("/solar-quotations/{quotation_id}/accept", summary="Citizen accepts a quotation")
def accept_quotation(quotation_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return solar_service.accept_quotation(db, current_user, quotation_id)


@router.post("/solar-quotations/{quotation_id}/reject", summary="Citizen rejects a quotation")
def reject_quotation(
    quotation_id: int,
    payload: SolarRequestDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.reject_quotation(db, current_user, quotation_id, payload.note)


@router.post("/solar-quotations/{quotation_id}/withdraw", summary="Installer withdraws a quotation")
def withdraw_quotation(
    quotation_id: int,
    payload: QuotationWithdraw,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return solar_service.withdraw_quotation(db, current_user, quotation_id, payload.note)


@router.get("/solar-installations", summary="List active and completed installations")
def installations(
    db: DbSession,
    current_user: CurrentUser,
    completed: Annotated[bool | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return solar_service.list_installations(
        db, current_user, completed=completed, page=page, page_size=page_size
    )
