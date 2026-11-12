"""Green loan product and application endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.ecosystem import (
    LoanApplicationCreate,
    LoanDecision,
    LoanProductCreate,
    LoanProductUpdate,
)
from app.services import loan_service

router = APIRouter(tags=["Green Finance Workflow"])


@router.get("/loan-products", summary="Browse the green loan marketplace")
def list_products(
    db: DbSession,
    current_user: CurrentUser,
    mine: Annotated[bool, Query()] = False,
    search: Annotated[str | None, Query(max_length=120)] = None,
    active_only: Annotated[bool, Query()] = True,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return loan_service.list_products(
        db,
        current_user,
        mine=mine,
        search=search,
        active_only=active_only,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/loan-products",
    status_code=status.HTTP_201_CREATED,
    summary="Create a green loan product",
)
def create_product(
    payload: LoanProductCreate, db: DbSession, current_user: CurrentUser
) -> dict:
    return loan_service.create_product(db, current_user, payload)


@router.put("/loan-products/{product_id}", summary="Edit a green loan product")
def update_product(
    product_id: int,
    payload: LoanProductUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return loan_service.update_product(db, current_user, product_id, payload)


@router.get("/loan-applications", summary="List loan applications in your scope")
def list_applications(
    db: DbSession,
    current_user: CurrentUser,
    status_filter: Annotated[str | None, Query(alias="status", max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    return loan_service.list_applications(
        db,
        current_user,
        status=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/loan-applications",
    status_code=status.HTTP_201_CREATED,
    summary="Apply for a green loan",
)
def create_application(
    payload: LoanApplicationCreate, db: DbSession, current_user: CurrentUser
) -> dict:
    return loan_service.create_application(db, current_user, payload)


@router.get("/loan-applications/{application_id}", summary="Loan application detail")
def application_detail(
    application_id: int, db: DbSession, current_user: CurrentUser
) -> dict:
    return loan_service.get_application(db, current_user, application_id)


@router.post(
    "/loan-applications/{application_id}/decision",
    summary="Financial institution updates the application decision",
)
def decide_application(
    application_id: int,
    payload: LoanDecision,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    return loan_service.decide_application(db, current_user, application_id, payload)


@router.post(
    "/loan-applications/{application_id}/resubmit",
    summary="Applicant resubmits requested documents",
)
def resubmit_application(
    application_id: int, db: DbSession, current_user: CurrentUser
) -> dict:
    return loan_service.resubmit_application(db, current_user, application_id)


@router.post(
    "/loan-applications/{application_id}/withdraw",
    summary="Applicant withdraws an application",
)
def withdraw_application(
    application_id: int, db: DbSession, current_user: CurrentUser
) -> dict:
    return loan_service.withdraw_application(db, current_user, application_id)


@router.get("/loan-applications/summary/financier", summary="Institution loan pipeline summary")
def institution_summary(db: DbSession, current_user: CurrentUser) -> dict:
    return loan_service.institution_summary(db, current_user)
