"""FastAPI application factory and entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.database import dispose_db, init_db
from app.routers import api_router

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Starting %s v%s",
        settings.app_name,
        settings.app_version,
        extra={"environment": settings.app_env},
    )

    if settings.auto_create_tables:
        logger.info("Ensuring database tables exist")
        init_db()
        logger.info("Database schema ready")

    yield

    dispose_db()
    logger.info("Application stopped and database connections released")


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=settings.app_description,
        lifespan=lifespan,
        debug=settings.debug,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        swagger_ui_parameters={"persistAuthorization": True, "displayRequestDuration": True},
        contact={
            "name": "India Green Grid",
            "email": "admin@solarequity.com",
        },
        license_info={"name": "Proprietary"},
        openapi_tags=[
            {"name": "Health", "description": "Liveness and database readiness checks."},
            {"name": "Authentication", "description": "Registration, JWT login, profile and current user."},
            {"name": "National Dashboard", "description": "Role-aware national overview (PS1 D9)."},
            {"name": "National Energy", "description": "Installed capacity and generation dashboard (PS1 D1)."},
            {"name": "RPO Compliance", "description": "Renewable purchase obligation tracking 2025-2030 (PS1 D2)."},
            {"name": "Rooftop Solar Calculator", "description": "Rooftop capacity, subsidy, ROI and CO2 estimates (PS1 D3)."},
            {"name": "Green Jobs", "description": "Renewable energy job portal (PS1 D4)."},
            {"name": "Green Finance", "description": "Green finance aggregator and comparison (PS1 D5)."},
            {"name": "Circular Economy", "description": "Solar panel, e-waste and battery recycling tracker (PS1 D6)."},
            {"name": "Environmental Impact", "description": "Avoided emissions, regional impact and air quality (PS1 D7)."},
            {"name": "Forecasting & Storage", "description": "Estimated renewable generation and battery planner (PS1 D8)."},
            {"name": "Admin Portal", "description": "Users, data freshness, content and platform activity."},
            {"name": "Apartments", "description": "Community Solar Management - apartment inventory."},
            {
                "name": "Simulation",
                "description": (
                    "SolarTwin synthetic generation, consumption and energy-balance engine."
                ),
            },
            {
                "name": "Allocation",
                "description": (
                    "Fair-share solar allocation, method comparison and "
                    "fairness analytics."
                ),
            },
            {"name": "Billing", "description": "Community Solar Management - transparent billing."},
            {"name": "RoofMax", "description": "Community Solar Management - rooftop optimisation."},
            {"name": "MeterGuard", "description": "Meter integrity checks (planned)."},
            {
                "name": "SolarVault",
                "description": (
                    "Battery storage simulation, state-of-charge dispatch and "
                    "with-versus-without storage comparison."
                ),
            },
            {"name": "Battery", "description": "Legacy battery status endpoint."},
        ],
    )

    application.add_middleware(RequestContextMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    register_exception_handlers(application)
    application.include_router(api_router, prefix=settings.api_prefix)

    @application.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    return application


app = create_app()
