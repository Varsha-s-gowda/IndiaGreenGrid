"""Administrator portal endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession
from app.models.green_grid import DataSource
from app.schemas.platform import AdminUserUpdate
from app.services import admin_service
from app.services.ingestion.service import (
    data_freshness_snapshot,
    ensure_data_sources,
    ingestion_runs,
    ingest_all,
    ingest_source,
)
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/admin", tags=["Admin Portal"])


@router.get("/overview", summary="Platform-wide administrator overview")
def overview(db: DbSession, admin: AdminUser) -> dict:
    return admin_service.overview(db)


@router.get("/users", summary="Manage user accounts and stakeholder roles")
def users(
    db: DbSession,
    admin: AdminUser,
    search: Annotated[str | None, Query(max_length=120)] = None,
    role: Annotated[str | None, Query(max_length=40)] = None,
    is_active: Annotated[bool | None, Query()] = None,
    verification_status: Annotated[str | None, Query(max_length=20)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return admin_service.list_users(
        db,
        search=search,
        role=role,
        is_active=is_active,
        verification_status=verification_status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/approvals",
    summary="Organisational accounts awaiting verification",
)
def approvals(db: DbSession, admin: AdminUser) -> dict:
    return admin_service.pending_approvals(db)


@router.patch("/users/{user_id}", summary="Update a user's role or status")
def update_user(
    user_id: int, payload: AdminUserUpdate, db: DbSession, admin: AdminUser
) -> dict:
    return admin_service.update_user(
        db, admin, user_id, payload.model_dump(exclude_unset=True)
    )


@router.get("/data-sources", summary="Data sources and freshness indicators")
def data_sources(db: DbSession, admin: AdminUser) -> dict:
    ensure_data_sources(db)
    db.commit()
    return {"items": data_freshness_snapshot(db)}


@router.post("/data-sources/{source_id}/refresh", summary="Re-run one ingestion provider")
def refresh_source(source_id: int, db: DbSession, admin: AdminUser) -> dict:
    source = db.get(DataSource, source_id)
    if source is None:
        raise NotFoundError("Data source not found.")
    return ingest_source(db, source)


@router.post("/data-sources/refresh-all", summary="Refresh every configured source")
def refresh_all(db: DbSession, admin: AdminUser) -> dict:
    results = ingest_all(db)
    return {
        "items": results,
        "items_after": data_freshness_snapshot(db),
        "message": (
            "Configured sample sources were refreshed. Unavailable sources were "
            "left unchanged and are labelled accordingly."
        ),
    }


@router.get("/ingestion-runs", summary="Ingestion attempt history")
def ingestion_history(
    db: DbSession,
    admin: AdminUser,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> dict:
    return ingestion_runs(db, limit=limit)


@router.get("/activity", summary="Recent platform audit activity")
def activity(
    db: DbSession,
    admin: AdminUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    return admin_service.activity_feed(db, limit=limit)


@router.get("/module-usage", summary="Module usage statistics")
def module_usage(
    db: DbSession,
    admin: AdminUser,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> dict:
    return {
        "items": admin_service.module_usage(db, days=days),
        "window_days": days,
    }
