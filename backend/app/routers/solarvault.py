"""SolarVault battery storage API.

All battery physics, energy accounting and savings calculations live in
:mod:`app.services.battery_engine`; this router validates requests, enforces
roles and serialises stored results.  Administrators configure, simulate and
publish.  Residents can read only published simulations.

The legacy ``/battery/status`` endpoint is retained for the Parts 1-5 module
registry.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession, SolarVaultViewer
from app.schemas.common import ModuleStatusResponse
from app.schemas.solarvault import (
    BatteryConfigurationUpdate,
    CompareResponse,
    ConfigurationResponse,
    HistoryResponse,
    HourlyResponse,
    SimulateRequest,
    SimulateResponse,
    SimulationDetailResponse,
    SummaryResponse,
)
from app.services import solarvault_service
from app.services.module_service import module_status

router = APIRouter(prefix="/solarvault", tags=["SolarVault"])


@router.get(
    "/status",
    response_model=ModuleStatusResponse,
    summary="SolarVault module status",
)
def status(current_user: SolarVaultViewer) -> ModuleStatusResponse:
    return module_status("battery")


@router.get(
    "/configuration",
    response_model=ConfigurationResponse,
    summary="Current active battery configuration",
)
def get_configuration(
    db: DbSession,
    current_user: SolarVaultViewer,
) -> ConfigurationResponse:
    result = solarvault_service.configuration_response(db)
    return ConfigurationResponse(**result)


@router.put(
    "/configuration",
    response_model=ConfigurationResponse,
    summary="Update battery parameters (ADMIN only)",
)
def update_configuration(
    payload: BatteryConfigurationUpdate,
    db: DbSession,
    admin: AdminUser,
) -> ConfigurationResponse:
    result = solarvault_service.update_configuration(
        db, admin, payload.model_dump(exclude_unset=True)
    )
    return ConfigurationResponse(**result)


@router.post(
    "/simulate",
    response_model=SimulateResponse,
    summary="Run an hourly battery simulation (ADMIN only)",
)
def simulate(
    payload: SimulateRequest,
    db: DbSession,
    admin: AdminUser,
) -> SimulateResponse:
    result = solarvault_service.simulate(
        db,
        admin,
        simulation_run_id=payload.simulation_run_id,
        configuration_id=payload.configuration_id,
        save=payload.save,
        publish=payload.publish,
        notes=payload.notes,
        overrides=(
            payload.overrides.model_dump(exclude_unset=True)
            if payload.overrides is not None
            else None
        ),
    )
    return SimulateResponse(**result)


@router.get(
    "/summary",
    response_model=SummaryResponse,
    summary="Latest simulation summary and battery overview",
)
def summary(
    db: DbSession,
    current_user: SolarVaultViewer,
) -> SummaryResponse:
    result = solarvault_service.summary(db, current_user)
    return SummaryResponse(**result)


@router.get(
    "/hourly",
    response_model=HourlyResponse,
    summary="Hourly battery records for a simulation",
)
def hourly(
    db: DbSession,
    current_user: SolarVaultViewer,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 2000,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> HourlyResponse:
    result = solarvault_service.hourly(
        db,
        current_user,
        simulation_id=simulation_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return HourlyResponse(**result)


@router.get(
    "/history",
    response_model=HistoryResponse,
    summary="Previous simulations visible to the current role",
)
def history(
    db: DbSession,
    current_user: SolarVaultViewer,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> HistoryResponse:
    result = solarvault_service.history(
        db,
        current_user,
        limit=limit,
        offset=offset,
        simulation_run_id=simulation_run_id,
    )
    return HistoryResponse(**result)


@router.get(
    "/compare",
    response_model=CompareResponse,
    summary="With-battery versus no-battery comparison",
)
def compare(
    db: DbSession,
    current_user: SolarVaultViewer,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
) -> CompareResponse:
    result = solarvault_service.compare(
        db, current_user, simulation_id=simulation_id
    )
    return CompareResponse(**result)


@router.get(
    "/simulations/{simulation_id}",
    response_model=SimulationDetailResponse,
    summary="Full stored simulation with hourly records",
)
def simulation_detail(
    simulation_id: int,
    db: DbSession,
    current_user: SolarVaultViewer,
) -> SimulationDetailResponse:
    result = solarvault_service.detail(db, current_user, simulation_id)
    return SimulationDetailResponse(**result)
