"""Shared fixtures for BillFair billing integration tests."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select

from app.models.allocation import AllocationRun
from app.models.user import User, UserRole
from app.services import allocation_service
from app.services.billing_setup_service import seed_default_billing_configuration
from tests.allocation_helpers import START_DATE, create_run, setup_world
from tests.helpers import create_user


def create_admin(db, email: str = "billing.admin@example.com") -> User:
    return create_user(db, email=email, role=UserRole.ADMIN)


def setup_billing_world(
    db,
    *,
    days: int = 2,
    start: date = START_DATE,
    solar_per_hour: float = 24.0,
    demand: float = 1.0,
    with_configuration: bool = True,
    method: str = "OWNERSHIP_BASED",
):
    """Create real allocations and billing rules for end-to-end billing tests."""

    apartments = setup_world(db)
    admin = create_admin(db)
    simulation_run = create_run(
        db,
        apartments,
        start=start,
        days=days,
        solar_per_hour=solar_per_hour,
        demand=demand,
    )
    result = allocation_service.calculate(
        db,
        actor=admin,
        simulation_run_id=simulation_run.id,
        date_from=None,
        date_to=None,
        method=method,
        save=True,
    )
    allocation_run = db.get(AllocationRun, result["run_id"])
    assert allocation_run is not None
    if with_configuration:
        seed_default_billing_configuration(db)
    return apartments, admin, simulation_run, allocation_run
