"""D6 - Circular economy tracker endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, CircularViewer, DbSession
from app.schemas.platform import (
    RecyclerCreate,
    RecyclerUpdate,
    RecyclingTransactionCreate,
    RecyclingTransactionUpdate,
)
from app.services import circular_service

router = APIRouter(prefix="/circular", tags=["Circular Economy"])


@router.get("/summary", summary="Waste and recycling summary")
def summary(db: DbSession, current_user: CircularViewer) -> dict:
    return circular_service.summary(db, current_user)


@router.get("/recyclers", summary="Recycler directory")
def recyclers(
    db: DbSession,
    current_user: CircularViewer,
    search: Annotated[str | None, Query(max_length=120)] = None,
    state: Annotated[str | None, Query(max_length=80)] = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
) -> dict:
    return circular_service.list_recyclers(
        db, search=search, state=state, category=category
    )


@router.post("/recyclers", status_code=201, summary="Add a recycler (admin)")
def create_recycler(
    payload: RecyclerCreate, db: DbSession, admin: AdminUser
) -> dict:
    return circular_service.create_recycler(db, admin, payload.model_dump())


@router.patch("/recyclers/{recycler_id}", summary="Update a recycler (admin)")
def update_recycler(
    recycler_id: int, payload: RecyclerUpdate, db: DbSession, admin: AdminUser
) -> dict:
    return circular_service.update_recycler(
        db, admin, recycler_id, payload.model_dump(exclude_unset=True)
    )


@router.get("/transactions", summary="Traceability records in your scope")
def transactions(
    db: DbSession,
    current_user: CircularViewer,
    status: Annotated[str | None, Query(max_length=30)] = None,
    waste_category: Annotated[str | None, Query(max_length=50)] = None,
    verification_status: Annotated[str | None, Query(max_length=30)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> dict:
    return circular_service.list_transactions(
        db,
        current_user,
        status=status,
        waste_category=waste_category,
        verification_status=verification_status,
        limit=limit,
    )


@router.get(
    "/transactions/{transaction_id}",
    summary="Transaction detail with append-only traceability events",
)
def transaction_detail(
    transaction_id: int, db: DbSession, current_user: CircularViewer
) -> dict:
    return circular_service.get_transaction(db, current_user, transaction_id)


@router.post(
    "/transactions",
    status_code=201,
    summary="Log a recycling transaction and generate a traceability code",
)
def create_transaction(
    payload: RecyclingTransactionCreate,
    db: DbSession,
    current_user: CircularViewer,
) -> dict:
    return circular_service.create_transaction(
        db, current_user, payload.model_dump()
    )


@router.patch(
    "/transactions/{transaction_id}",
    summary="Update recycling status or cancel your own transaction",
)
def update_transaction(
    transaction_id: int,
    payload: RecyclingTransactionUpdate,
    db: DbSession,
    current_user: CircularViewer,
) -> dict:
    return circular_service.update_transaction(
        db, current_user, transaction_id, payload.model_dump(exclude_unset=True)
    )
