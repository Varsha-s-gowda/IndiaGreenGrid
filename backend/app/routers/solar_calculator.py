"""D3 - Rooftop solar ROI and subsidy calculator endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import DbSession, SolarCalculatorViewer
from app.schemas.platform import SolarCalculationRequest
from app.services import solar_calculator_service

router = APIRouter(prefix="/solar", tags=["Rooftop Solar Calculator"])


@router.get("/state-options", summary="Indicative state assumptions for the calculator")
def state_options(current_user: SolarCalculatorViewer) -> dict:
    return {
        "items": solar_calculator_service.state_options(),
        "customer_types": [
            {"value": key, "label": value["label"]}
            for key, value in solar_calculator_service.CUSTOMER_TYPES.items()
        ],
        "note": (
            "Indicative planning assumptions. Verify irradiance, DISCOM tariff "
            "and subsidy eligibility independently."
        ),
    }


@router.post("/calculate", summary="Estimate capacity, cost, subsidy, savings and payback")
def calculate(
    payload: SolarCalculationRequest,
    db: DbSession,
    current_user: SolarCalculatorViewer,
) -> dict:
    return solar_calculator_service.calculate(
        db, current_user, payload.model_dump()
    )


@router.get("/calculations", summary="Your saved rooftop calculations")
def calculations(
    db: DbSession,
    current_user: SolarCalculatorViewer,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict:
    return solar_calculator_service.history(db, current_user, limit=limit)
