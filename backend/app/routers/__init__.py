"""API router composition.

Keeping router registration here (instead of in ``main.py``) lets the app scale
without turning the entry point into a monolith.
"""

from fastapi import APIRouter

from app.routers import (
    admin,
    allocation,
    apartments,
    auth,
    battery,
    billing,
    circular,
    compliance,
    dashboard,
    documents,
    energy,
    finance,
    forecast,
    health,
    impact,
    jobs,
    loans,
    meterguard,
    notifications,
    organisations,
    procurement,
    recycling_requests,
    rpo,
    roofmax,
    simulation,
    solar_calculator,
    solar_requests,
    solarvault,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)

api_router.include_router(dashboard.router)
api_router.include_router(energy.router)
api_router.include_router(rpo.router)
api_router.include_router(solar_calculator.router)
api_router.include_router(jobs.router)
api_router.include_router(finance.router)
api_router.include_router(circular.router)
api_router.include_router(impact.router)
api_router.include_router(forecast.router)
api_router.include_router(admin.router)

api_router.include_router(solar_requests.router)
api_router.include_router(compliance.router)
api_router.include_router(procurement.router)
api_router.include_router(loans.router)
api_router.include_router(recycling_requests.router)
api_router.include_router(organisations.router)
api_router.include_router(notifications.router)
api_router.include_router(documents.router)

api_router.include_router(apartments.router)
api_router.include_router(simulation.router)
api_router.include_router(allocation.router)
api_router.include_router(billing.router)
api_router.include_router(roofmax.router)
api_router.include_router(meterguard.router)
api_router.include_router(solarvault.router)
api_router.include_router(battery.router)

__all__ = ["api_router"]
