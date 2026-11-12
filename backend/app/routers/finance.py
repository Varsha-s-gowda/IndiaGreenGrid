"""D5 - Green finance aggregator endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession, FinanceViewer
from app.schemas.platform import FinanceSchemeCreate, FinanceSchemeUpdate
from app.services import finance_service

router = APIRouter(prefix="/finance", tags=["Green Finance"])


@router.get("/schemes", summary="List green loans, bonds, subsidies and schemes")
def list_schemes(
    db: DbSession,
    current_user: FinanceViewer,
    search: Annotated[str | None, Query(max_length=120)] = None,
    scheme_type: Annotated[str | None, Query(max_length=40)] = None,
    category: Annotated[str | None, Query(max_length=60)] = None,
    verification_status: Annotated[str | None, Query(max_length=40)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 9,
) -> dict:
    return finance_service.list_schemes(
        db,
        search=search,
        scheme_type=scheme_type,
        category=category,
        verification_status=verification_status,
        page=page,
        page_size=page_size,
    )


@router.get("/compare", summary="Compare 2-4 finance schemes")
def compare(
    ids: Annotated[str, Query(description="Comma-separated scheme ids")],
    db: DbSession,
    current_user: FinanceViewer,
) -> dict:
    try:
        parsed = [int(item) for item in ids.split(",") if item.strip()]
    except ValueError as exc:
        from app.core.exceptions import BadRequestError

        raise BadRequestError("ids must be a comma-separated list of integers.") from exc
    return finance_service.compare(db, parsed)


@router.get("/admin/all", summary="All finance schemes (admin)")
def admin_all(db: DbSession, admin: AdminUser) -> dict:
    return finance_service.admin_schemes(db)


@router.post("/schemes", status_code=201, summary="Create a finance scheme (admin)")
def create_scheme(
    payload: FinanceSchemeCreate, db: DbSession, admin: AdminUser
) -> dict:
    data = payload.model_dump()
    for field in ("application_url", "source_url"):
        if data.get(field) is not None:
            data[field] = str(data[field])
    return finance_service.create_scheme(db, admin, data)


@router.patch("/schemes/{scheme_id}", summary="Update a finance scheme (admin)")
def update_scheme(
    scheme_id: int, payload: FinanceSchemeUpdate, db: DbSession, admin: AdminUser
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    for field in ("application_url", "source_url"):
        if data.get(field) is not None:
            data[field] = str(data[field])
    return finance_service.update_scheme(db, admin, scheme_id, data)


@router.get("/schemes/{scheme_id}", summary="Finance scheme details")
def get_scheme(scheme_id: int, db: DbSession, current_user: FinanceViewer) -> dict:
    return finance_service.get_scheme(db, scheme_id)
