"""D8 - Renewable forecasting and storage planner endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import AdminUser, DbSession, ForecastViewer
from app.schemas.platform import ForecastEstimateRequest
from app.services import forecast_service

router = APIRouter(prefix="/forecast", tags=["Forecasting & Storage"])


@router.get("/locations", summary="Available sample forecast locations")
def locations(db: DbSession, current_user: ForecastViewer) -> dict:
    return forecast_service.locations(db)


@router.post(
    "/estimate",
    summary="Estimate solar/wind generation and a battery storage recommendation",
)
def estimate(
    payload: ForecastEstimateRequest,
    db: DbSession,
    current_user: ForecastViewer,
) -> dict:
    return forecast_service.estimate(db, current_user, payload.model_dump())


@router.get("/history", summary="Your recent storage recommendations")
def history(db: DbSession, current_user: ForecastViewer) -> dict:
    return forecast_service.history(db, current_user)


@router.post(
    "/refresh-sample",
    summary="Refresh the bundled sample weather forecast (admin)",
)
def refresh(db: DbSession, admin: AdminUser) -> dict:
    return forecast_service.refresh_sample_forecasts(db)
