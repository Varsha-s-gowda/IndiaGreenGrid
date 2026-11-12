"""SolarTwin simulation API.

Generation endpoints are administrator controls.  Read endpoints are available
to any authenticated resident and are backed entirely by stored PostgreSQL
readings.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import (
    AdminUser,
    CurrentUser,
    DbSession,
    SimulationViewer,
)
from app.core.exceptions import BadRequestError
from app.schemas.common import MessageResponse, ModuleStatusResponse
from app.schemas.simulation import (
    CommonConsumptionListResponse,
    DailyBalanceResponse,
    HourlyBalanceResponse,
    MeterReadingListResponse,
    MonthlyBalanceResponse,
    SimulationGenerateRequest,
    SimulationGenerationResponse,
    SimulationRunListResponse,
    SimulationRunStatus,
    SimulationSummaryResponse,
    SolarGenerationListResponse,
)
from app.services import energy_balance, simulation_service
from app.services.module_service import module_status

router = APIRouter(prefix="/simulation", tags=["Simulation"])


def _config_from_payload(payload: SimulationGenerateRequest) -> simulation_service.SimulationConfig:
    start_date = payload.start_date or (
        date.today() - timedelta(days=payload.days - 1)
    )
    return simulation_service.SimulationConfig(
        capacity_kwp=payload.capacity_kwp,
        start_date=start_date,
        days=payload.days,
        seed=payload.seed,
    )


def _generation_response(db, result: simulation_service.GenerationResult) -> SimulationGenerationResponse:
    return SimulationGenerationResponse(
        run=simulation_service.run_status(db, result.run),
        solar_created=result.solar_created,
        meter_created=result.meter_created,
        common_created=result.common_created,
        reused=result.reused,
        message=result.message,
    )


def _validate_dates(date_from: date | None, date_to: date | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise BadRequestError("date_from must be on or before date_to.")


@router.get(
    "/status",
    response_model=ModuleStatusResponse,
    summary="Simulation module status (legacy placeholder contract)",
)
def status(current_user: CurrentUser) -> ModuleStatusResponse:
    return module_status("simulation")


@router.get(
    "/admin/status",
    response_model=ModuleStatusResponse,
    summary="Simulation admin controls status (ADMIN only)",
)
def admin_status(admin: AdminUser) -> ModuleStatusResponse:
    return module_status("simulation", admin=True)


@router.get(
    "/runs",
    response_model=SimulationRunListResponse,
    summary="View simulation generation runs and their status",
)
def list_runs(
    db: DbSession,
    current_user: SimulationViewer,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SimulationRunListResponse:
    page = simulation_service.list_runs(db, limit=limit, offset=offset)
    return SimulationRunListResponse(
        total=page.total,
        items=[simulation_service.run_status(db, run) for run in page.items],
    )


@router.get(
    "/runs/{run_id}",
    response_model=SimulationRunStatus,
    summary="Generation status for one simulation run",
)
def run_status(
    run_id: int,
    db: DbSession,
    current_user: SimulationViewer,
):
    run = simulation_service.get_run(db, run_id)
    return simulation_service.run_status(db, run)


@router.post(
    "/generate",
    response_model=SimulationGenerationResponse,
    summary="Generate a complete 30-day simulation (ADMIN only)",
)
def generate_simulation(
    payload: SimulationGenerateRequest,
    db: DbSession,
    admin: AdminUser,
) -> SimulationGenerationResponse:
    try:
        result = simulation_service.generate_full_simulation(
            db,
            _config_from_payload(payload),
            regenerate=payload.regenerate,
        )
    except ValueError as exc:
        raise BadRequestError(str(exc)) from exc
    return _generation_response(db, result)


@router.post(
    "/generate-solar",
    response_model=SimulationGenerationResponse,
    summary="Generate only solar generation (ADMIN only)",
)
def generate_solar(
    payload: SimulationGenerateRequest,
    db: DbSession,
    admin: AdminUser,
) -> SimulationGenerationResponse:
    try:
        result = simulation_service.generate_solar(
            db,
            _config_from_payload(payload),
            run_id=payload.run_id,
            regenerate=payload.regenerate,
        )
    except ValueError as exc:
        raise BadRequestError(str(exc)) from exc
    return _generation_response(db, result)


@router.post(
    "/generate-consumption",
    response_model=SimulationGenerationResponse,
    summary="Generate apartment and common-area consumption (ADMIN only)",
)
def generate_consumption(
    payload: SimulationGenerateRequest,
    db: DbSession,
    admin: AdminUser,
) -> SimulationGenerationResponse:
    try:
        result = simulation_service.generate_consumption(
            db,
            _config_from_payload(payload),
            run_id=payload.run_id,
            regenerate=payload.regenerate,
            include_common=payload.include_common,
        )
    except ValueError as exc:
        raise BadRequestError(str(exc)) from exc
    return _generation_response(db, result)


@router.delete(
    "/runs/{run_id}",
    response_model=MessageResponse,
    summary="Delete a simulation run and all of its readings (ADMIN only)",
)
def delete_run(
    run_id: int,
    db: DbSession,
    admin: AdminUser,
) -> MessageResponse:
    simulation_service.delete_run(db, run_id)
    return MessageResponse(message=f"Simulation run {run_id} deleted.")


@router.get(
    "/solar-generation",
    response_model=SolarGenerationListResponse,
    summary="Hourly solar generation with date filters",
)
def solar_generation(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 1000,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SolarGenerationListResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    page = simulation_service.list_solar_generation(
        db,
        run.id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return SolarGenerationListResponse(
        run_id=run.id,
        total=page.total,
        limit=limit,
        offset=offset,
        items=page.items,
    )


@router.get(
    "/consumption",
    response_model=MeterReadingListResponse,
    summary="Hourly apartment consumption with apartment and date filters",
)
def consumption(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    apartment_id: Annotated[int | None, Query(ge=1)] = None,
    flat_number: Annotated[str | None, Query(max_length=20)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 1000,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MeterReadingListResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    page = simulation_service.list_meter_readings(
        db,
        run.id,
        apartment_id=apartment_id,
        flat_number=flat_number,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return MeterReadingListResponse(
        run_id=run.id,
        total=page.total,
        limit=limit,
        offset=offset,
        items=page.items,
    )


@router.get(
    "/common-consumption",
    response_model=CommonConsumptionListResponse,
    summary="Hourly common-area consumption by category and date",
)
def common_consumption(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 1000,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CommonConsumptionListResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    try:
        page = simulation_service.list_common_consumption(
            db,
            run.id,
            category=category,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise BadRequestError(str(exc)) from exc
    return CommonConsumptionListResponse(
        run_id=run.id,
        total=page.total,
        limit=limit,
        offset=offset,
        items=page.items,
    )


@router.get(
    "/summary",
    response_model=SimulationSummaryResponse,
    summary="Energy-balance summary for the selected run and date range",
)
def simulation_summary(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> SimulationSummaryResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    status_payload = simulation_service.run_status(db, run)
    frame = energy_balance.load_balance_frame(
        db, run.id, date_from=date_from, date_to=date_to
    )
    totals = energy_balance.summarise_balance(frame)
    return SimulationSummaryResponse(
        run=status_payload,
        date_from=date_from,
        date_to=date_to,
        energy_balance=totals,
        record_counts={
            "solar_records": status_payload["solar_records"],
            "meter_records": status_payload["meter_records"],
            "common_records": status_payload["common_records"],
        },
        common_by_category=simulation_service.common_category_totals(
            db, run.id, date_from=date_from, date_to=date_to
        ),
    )


@router.get(
    "/hourly",
    response_model=HourlyBalanceResponse,
    summary="Hourly energy balance for the selected run",
)
def hourly_balance(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> HourlyBalanceResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    frame = energy_balance.load_balance_frame(
        db, run.id, date_from=date_from, date_to=date_to
    )
    items = energy_balance.balance_points(frame)
    return HourlyBalanceResponse(
        run_id=run.id,
        granularity="hourly",
        count=len(items),
        items=items,
    )


@router.get(
    "/daily",
    response_model=DailyBalanceResponse,
    summary="Daily energy balance for the selected run",
)
def daily_balance(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> DailyBalanceResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    frame = energy_balance.load_balance_frame(
        db, run.id, date_from=date_from, date_to=date_to
    )
    items = energy_balance.grouped_balance(frame, "daily")
    return DailyBalanceResponse(
        run_id=run.id,
        granularity="daily",
        count=len(items),
        items=items,
    )


@router.get(
    "/monthly",
    response_model=MonthlyBalanceResponse,
    summary="Monthly energy balance for the selected run",
)
def monthly_balance(
    db: DbSession,
    current_user: SimulationViewer,
    run_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> MonthlyBalanceResponse:
    _validate_dates(date_from, date_to)
    run = simulation_service.resolve_run(db, run_id)
    frame = energy_balance.load_balance_frame(
        db, run.id, date_from=date_from, date_to=date_to
    )
    items = energy_balance.grouped_balance(frame, "monthly")
    return MonthlyBalanceResponse(
        run_id=run.id,
        granularity="monthly",
        count=len(items),
        items=items,
    )
