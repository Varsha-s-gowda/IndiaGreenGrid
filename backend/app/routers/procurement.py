"""Renewable procurement marketplace endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.ecosystem import (
    ProcurementAward,
    ProcurementRequestCreate,
    ProcurementRequestUpdate,
    QuotationWithdraw,
    SupplierQuotationCreate,
)
from app.services import procurement_service

router = APIRouter(prefix="/procurement", tags=["Procurement Marketplace"])


@router.get("/requests", summary="List procurement requests in your scope")
def list_requests(
    db: DbSession,
    current_user: CurrentUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=30)] = None,
    energy_type: Annotated[str | None, Query(max_length=20)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return procurement_service.list_requests(
        db,
        current_user,
        status=status_filter,
        energy_type=energy_type,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    summary="Create a procurement request",
)
def create_request(
    payload: ProcurementRequestCreate, db: DbSession, current_user: CurrentUser
) -> dict:
    return procurement_service.create_request(db, current_user, payload)


@router.get("/requests/{request_id}", summary="Procurement request with quotations")
def request_detail(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return procurement_service.get_request(db, current_user, request_id)


@router.put("/requests/{request_id}", summary="Update a procurement request")
def update_request(
    request_id: int,
    payload: ProcurementRequestUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return procurement_service.update_request(db, current_user, request_id, payload)


@router.post("/requests/{request_id}/publish", summary="Publish a procurement request")
def publish_request(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return procurement_service.publish_request(db, current_user, request_id)


@router.post("/requests/{request_id}/close", summary="Close a procurement request")
def close_request(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return procurement_service.close_request(db, current_user, request_id)


@router.post("/requests/{request_id}/cancel", summary="Cancel a procurement request")
def cancel_request(request_id: int, db: DbSession, current_user: CurrentUser) -> dict:
    return procurement_service.cancel_request(db, current_user, request_id)


@router.post(
    "/requests/{request_id}/quotations",
    status_code=status.HTTP_201_CREATED,
    summary="Supplier submits a quotation",
)
def submit_quotation(
    request_id: int,
    payload: SupplierQuotationCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return procurement_service.submit_quotation(db, current_user, request_id, payload)


@router.post("/requests/{request_id}/award", summary="DISCOM awards a quotation")
def award(
    request_id: int,
    payload: ProcurementAward,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return procurement_service.award_quotation(db, current_user, request_id, payload)


@router.get("/quotations", summary="List supplier quotations")
def my_quotations(
    db: DbSession,
    current_user: CurrentUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=20)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return procurement_service.list_my_quotations(
        db, current_user, status=status_filter, page=page, page_size=page_size
    )


@router.post("/quotations/{quotation_id}/withdraw", summary="Withdraw a supplier quotation")
def withdraw_quotation(
    quotation_id: int,
    payload: QuotationWithdraw,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return procurement_service.withdraw_quotation(db, current_user, quotation_id, payload.note)
