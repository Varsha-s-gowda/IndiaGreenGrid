"""Health and readiness endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import settings
from app.core.dependencies import DbSession
from app.schemas.common import DatabaseHealthResponse, HealthResponse
from app.services.health_service import check_database

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Application health")
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        timestamp=datetime.now(timezone.utc),
    )


@router.get(
    "/health/database",
    response_model=DatabaseHealthResponse,
    summary="Database connectivity health",
)
def database_health(db: DbSession) -> DatabaseHealthResponse:
    return check_database(db)
