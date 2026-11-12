"""Fair solar allocation API.

Allocation calculations run entirely in Python.  Administrators can preview,
save and compare runs; residents can read only their own apartment's records.
The legacy ``/status`` endpoint is retained unchanged for Parts 1 and 2.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, AllocationViewer, DbSession
from app.core.exceptions import BadRequestError
from app.schemas.allocation import (
    AllocationCalculateRequest,
    AllocationComparisonRequest,
    AllocationComparisonResponse,
    AllocationFairnessResponse,
    AllocationRecordListResponse,
    AllocationResultResponse,
    AllocationRunListResponse,
    ApartmentAllocationResponse,
)
from app.schemas.common import ModuleStatusResponse
from app.services import allocation_service
from app.services.module_service import module_status

router = APIRouter(prefix="/allocation", tags=["Allocation"])

ComparisonSource = Literal["auto", "preview", "saved"]


def _parse_run_ids(value: str | None) -> list[int] | None:
    if not value:
        return None
    parts = [part.strip() for part in value.split(",") if part.strip()]
    try:
        run_ids = [int(part) for part in parts]
    except ValueError as exc:
        raise BadRequestError(
            "allocation_run_ids must be a comma-separated list of integers."
        ) from exc
    if not run_ids:
        return None
    return run_ids


def _parse_ownership_overrides(value: str | None) -> dict[str, float] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise BadRequestError(
            "ownership_overrides must be a JSON object of flat/ID to percentage."
        ) from exc
    if not isinstance(parsed, dict):
        raise BadRequestError("ownership_overrides must be a JSON object.")
    return parsed


def _validate_dates(date_from: date | None, date_to: date | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise BadRequestError("date_from must be on or before date_to.")


@router.get(
    "/status",
    response_model=ModuleStatusResponse,
    summary="Allocation module status (legacy placeholder contract)",
)
def status(current_user: AllocationViewer) -> ModuleStatusResponse:
    return module_status("allocation")


@router.post(
    "/calculate",
    response_model=AllocationResultResponse,
    summary="Preview or save a fair solar allocation (ADMIN only)",
)
def calculate(
    payload: AllocationCalculateRequest,
    db: DbSession,
    admin: AdminUser,
) -> AllocationResultResponse:
    result = allocation_service.calculate(
        db,
        actor=admin,
        simulation_run_id=payload.simulation_run_id,
        date_from=payload.date_from,
        date_to=payload.date_to,
        method=payload.method,
        save=payload.save,
        solar_multiplier=payload.solar_multiplier,
        demand_multiplier=payload.demand_multiplier,
        ownership_overrides=payload.ownership_overrides,
        hypothetical=payload.hypothetical,
        allow_incomplete=payload.allow_incomplete,
        incomplete_policy=payload.incomplete_policy,
    )
    return AllocationResultResponse(**result)


@router.get(
    "/compare",
    response_model=AllocationComparisonResponse,
    summary="Compare all three methods on identical inputs (ADMIN only)",
)
def compare(
    db: DbSession,
    admin: AdminUser,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    allocation_run_ids: str | None = Query(
        default=None,
        description="Comma-separated saved allocation run IDs to compare.",
    ),
    source: ComparisonSource = "auto",
    solar_multiplier: Annotated[float, Query(ge=0, le=10)] = 1.0,
    demand_multiplier: Annotated[float, Query(ge=0, le=10)] = 1.0,
    ownership_overrides: str | None = Query(
        default=None,
        description="Optional JSON object of flat/ID to hypothetical percentage.",
    ),
    hypothetical: bool = False,
    allow_incomplete: bool = False,
    incomplete_policy: str | None = None,
) -> AllocationComparisonResponse:
    _validate_dates(date_from, date_to)
    if (
        simulation_run_id is not None
        and simulation_id is not None
        and simulation_run_id != simulation_id
    ):
        raise BadRequestError(
            "simulation_run_id and simulation_id must refer to the same run."
        )
    result = allocation_service.compare(
        db,
        simulation_run_id=simulation_run_id or simulation_id,
        date_from=date_from,
        date_to=date_to,
        allocation_run_ids=_parse_run_ids(allocation_run_ids),
        source=source,
        solar_multiplier=solar_multiplier,
        demand_multiplier=demand_multiplier,
        ownership_overrides=_parse_ownership_overrides(ownership_overrides),
        hypothetical=hypothetical,
        allow_incomplete=allow_incomplete,
        incomplete_policy=incomplete_policy,
    )
    return AllocationComparisonResponse(**result)


@router.post(
    "/compare",
    response_model=AllocationComparisonResponse,
    summary="What-if comparison of all three methods (ADMIN only, preview)",
)
def compare_scenario(
    payload: AllocationComparisonRequest,
    db: DbSession,
    admin: AdminUser,
) -> AllocationComparisonResponse:
    result = allocation_service.compare(
        db,
        simulation_run_id=payload.simulation_run_id,
        date_from=payload.date_from,
        date_to=payload.date_to,
        source="preview",
        solar_multiplier=payload.solar_multiplier,
        demand_multiplier=payload.demand_multiplier,
        ownership_overrides=payload.ownership_overrides,
        hypothetical=payload.hypothetical,
        allow_incomplete=payload.allow_incomplete,
        incomplete_policy=payload.incomplete_policy,
    )
    return AllocationComparisonResponse(**result)


@router.get(
    "/runs",
    response_model=AllocationRunListResponse,
    summary="List saved allocation runs (ADMIN only)",
)
def list_runs(
    db: DbSession,
    admin: AdminUser,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    method: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AllocationRunListResponse:
    _validate_dates(date_from, date_to)
    result = allocation_service.list_runs(
        db,
        simulation_run_id=simulation_run_id,
        method=method,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return AllocationRunListResponse(**result)


@router.get(
    "/runs/{run_id}",
    response_model=AllocationResultResponse,
    summary="Inspect one saved allocation run with apartment summaries (ADMIN only)",
)
def run_detail(
    run_id: int,
    db: DbSession,
    admin: AdminUser,
) -> AllocationResultResponse:
    return AllocationResultResponse(**allocation_service.get_run_detail(db, run_id))


@router.get(
    "/fairness",
    response_model=AllocationFairnessResponse,
    summary="Jain index and distribution metrics (ADMIN only)",
)
def fairness(
    db: DbSession,
    admin: AdminUser,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    method: str | None = None,
    allow_incomplete: bool = False,
) -> AllocationFairnessResponse:
    _validate_dates(date_from, date_to)
    if (
        simulation_run_id is not None
        and simulation_id is not None
        and simulation_run_id != simulation_id
    ):
        raise BadRequestError(
            "simulation_run_id and simulation_id must refer to the same run."
        )
    result = allocation_service.fairness(
        db,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id or simulation_id,
        date_from=date_from,
        date_to=date_to,
        method=method,
        allow_incomplete=allow_incomplete,
    )
    return AllocationFairnessResponse(**result)


def _records_endpoint(
    *,
    granularity: str,
    db: DbSession,
    current_user,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    simulation_id: int | None,
    method: str | None,
    flat_id: str | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
    allow_incomplete: bool,
) -> AllocationRecordListResponse:
    _validate_dates(date_from, date_to)
    if (
        simulation_run_id is not None
        and simulation_id is not None
        and simulation_run_id != simulation_id
    ):
        raise BadRequestError(
            "simulation_run_id and simulation_id must refer to the same run."
        )
    result = allocation_service.get_records(
        db,
        actor=current_user,
        granularity=granularity,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id or simulation_id,
        method=method,
        flat_ref=flat_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        allow_incomplete=allow_incomplete,
    )
    return AllocationRecordListResponse(**result)


@router.get(
    "/hourly",
    response_model=AllocationRecordListResponse,
    summary="Hourly allocation records (residents are scoped to their flat)",
)
def hourly(
    db: DbSession,
    current_user: AllocationViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    method: str | None = None,
    flat_id: str | None = Query(default=None, max_length=20),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=20_000)] = 2_000,
    offset: Annotated[int, Query(ge=0)] = 0,
    allow_incomplete: bool = False,
) -> AllocationRecordListResponse:
    return _records_endpoint(
        granularity="hourly",
        db=db,
        current_user=current_user,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        simulation_id=simulation_id,
        method=method,
        flat_id=flat_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        allow_incomplete=allow_incomplete,
    )


@router.get(
    "/daily",
    response_model=AllocationRecordListResponse,
    summary="Daily allocation totals (residents are scoped to their flat)",
)
def daily(
    db: DbSession,
    current_user: AllocationViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    method: str | None = None,
    flat_id: str | None = Query(default=None, max_length=20),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=20_000)] = 1_000,
    offset: Annotated[int, Query(ge=0)] = 0,
    allow_incomplete: bool = False,
) -> AllocationRecordListResponse:
    return _records_endpoint(
        granularity="daily",
        db=db,
        current_user=current_user,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        simulation_id=simulation_id,
        method=method,
        flat_id=flat_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        allow_incomplete=allow_incomplete,
    )


@router.get(
    "/monthly",
    response_model=AllocationRecordListResponse,
    summary="Monthly allocation totals (residents are scoped to their flat)",
)
def monthly(
    db: DbSession,
    current_user: AllocationViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    method: str | None = None,
    flat_id: str | None = Query(default=None, max_length=20),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=20_000)] = 1_000,
    offset: Annotated[int, Query(ge=0)] = 0,
    allow_incomplete: bool = False,
) -> AllocationRecordListResponse:
    return _records_endpoint(
        granularity="monthly",
        db=db,
        current_user=current_user,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        simulation_id=simulation_id,
        method=method,
        flat_id=flat_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        allow_incomplete=allow_incomplete,
    )


@router.get(
    "/{flat_id}",
    response_model=ApartmentAllocationResponse,
    summary="Apartment allocation detail (residents only for their own flat)",
)
def apartment_allocation(
    flat_id: str,
    db: DbSession,
    current_user: AllocationViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_id: Annotated[int | None, Query(ge=1)] = None,
    method: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    allow_incomplete: bool = False,
) -> ApartmentAllocationResponse:
    _validate_dates(date_from, date_to)
    if (
        simulation_run_id is not None
        and simulation_id is not None
        and simulation_run_id != simulation_id
    ):
        raise BadRequestError(
            "simulation_run_id and simulation_id must refer to the same run."
        )
    result = allocation_service.get_apartment_allocation(
        db,
        actor=current_user,
        flat_ref=flat_id,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id or simulation_id,
        method=method,
        date_from=date_from,
        date_to=date_to,
        allow_incomplete=allow_incomplete,
    )
    return ApartmentAllocationResponse(**result)
