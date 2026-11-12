"""RoofMax rooftop capacity planning API.

All capacity, generation and financial mathematics lives in
:mod:`app.services.solar_optimization`; this router validates requests, enforces
roles and serialises stored results.  Administrators update assumptions and
generate analyses.  Residents can read only published recommendations.

The legacy ``/status`` endpoint is retained for the Parts 1-4 module registry.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession, RoofMaxViewer
from app.schemas.common import ModuleStatusResponse
from app.schemas.roofmax import (
    AnalysisDetailResponse,
    AnalysisHistoryResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    ConfigurationResponse,
    RecommendationResponse,
    RoofConfigurationUpdate,
    ScenariosResponse,
)
from app.services import roofmax_service
from app.services.module_service import module_status

router = APIRouter(prefix="/roofmax", tags=["RoofMax"])


@router.get(
    "/status",
    response_model=ModuleStatusResponse,
    summary="RoofMax module status (legacy placeholder contract)",
)
def status(current_user: RoofMaxViewer) -> ModuleStatusResponse:
    return module_status("roofmax")


@router.get(
    "/configuration",
    response_model=ConfigurationResponse,
    summary="Current active roof and financial assumptions",
)
def get_configuration(
    db: DbSession,
    current_user: RoofMaxViewer,
) -> ConfigurationResponse:
    result = roofmax_service.configuration_response(db, current_user)
    return ConfigurationResponse(**result)


@router.put(
    "/configuration",
    response_model=ConfigurationResponse,
    summary="Update roof and financial assumptions (ADMIN only)",
)
def update_configuration(
    payload: RoofConfigurationUpdate,
    db: DbSession,
    admin: AdminUser,
) -> ConfigurationResponse:
    result = roofmax_service.update_configuration(
        db,
        admin,
        payload.model_dump(exclude_unset=True),
    )
    return ConfigurationResponse(**result)


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Generate a rooftop capacity analysis (ADMIN only)",
)
def analyze(
    payload: AnalyzeRequest,
    db: DbSession,
    admin: AdminUser,
) -> AnalyzeResponse:
    result = roofmax_service.analyze(
        db,
        admin,
        simulation_run_id=payload.simulation_run_id,
        configuration_id=payload.configuration_id,
        publish=payload.publish,
        notes=payload.notes,
    )
    return AnalyzeResponse(**result)


@router.get(
    "/recommendation",
    response_model=RecommendationResponse,
    summary="Latest recommendation (residents must be published)",
)
def recommendation(
    db: DbSession,
    current_user: RoofMaxViewer,
) -> RecommendationResponse:
    result = roofmax_service.recommendation(db, current_user)
    return RecommendationResponse(**result)


@router.get(
    "/scenarios",
    response_model=ScenariosResponse,
    summary="Conservative, standard and optimistic capacity comparison",
)
def scenarios(
    db: DbSession,
    current_user: RoofMaxViewer,
    analysis_id: Annotated[int | None, Query(ge=1)] = None,
) -> ScenariosResponse:
    result = roofmax_service.scenarios(
        db, current_user, analysis_id=analysis_id
    )
    return ScenariosResponse(**result)


@router.get(
    "/history",
    response_model=AnalysisHistoryResponse,
    summary="Previous analyses visible to the current role",
)
def history(
    db: DbSession,
    current_user: RoofMaxViewer,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AnalysisHistoryResponse:
    result = roofmax_service.history(
        db,
        current_user,
        limit=limit,
        offset=offset,
        simulation_run_id=simulation_run_id,
    )
    return AnalysisHistoryResponse(**result)


@router.get(
    "/analysis/{analysis_id}",
    response_model=AnalysisDetailResponse,
    summary="Full stored analysis with demand profile and scenarios",
)
def analysis_detail(
    analysis_id: int,
    db: DbSession,
    current_user: RoofMaxViewer,
) -> AnalysisDetailResponse:
    result = roofmax_service.analysis_detail(db, current_user, analysis_id)
    return AnalysisDetailResponse(**result)
