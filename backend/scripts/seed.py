"""Seed the platform.

Creates the core demo accounts, 60-flat community solar data, and the India
Green Grid sample datasets (national energy statistics, RPO, jobs, finance,
recyclers, impact, forecasts).

Usage (from the backend directory):
    python scripts/seed.py

Passwords are read from DEMO_ADMIN_PASSWORD and DEMO_RESIDENT_PASSWORD. In
development only, documented fallbacks are used when those variables are absent.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import inspect  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.services.allocation_setup_service import (  # noqa: E402
    seed_allocation_foundation,
)
from app.services.apartment_service import seed_apartments  # noqa: E402
from app.services.billing_setup_service import (  # noqa: E402
    seed_default_billing_configuration,
)
from app.services.battery_setup_service import (  # noqa: E402
    seed_default_battery_configuration,
)
from app.services.roofmax_setup_service import (  # noqa: E402
    seed_default_roof_configuration,
)
from app.services.platform_seed_service import seed_platform_data  # noqa: E402
from app.services.seed_service import seed_demo_users, seed_stakeholder_users  # noqa: E402


def main() -> int:
    configure_logging(settings.log_level)

    tables = set(inspect(engine).get_table_names())
    if "users" not in tables or "apartments" not in tables:
        print(
            "Database schema is missing. Run 'alembic upgrade head' first.",
            file=sys.stderr,
        )
        return 1

    with SessionLocal() as db:
        results = seed_demo_users(db)
        stakeholder_results = seed_stakeholder_users(db)
        apartments = seed_apartments(db)

    with SessionLocal() as db:
        foundation = seed_allocation_foundation(db)

    with SessionLocal() as db:
        billing_configuration = seed_default_billing_configuration(db)

    with SessionLocal() as db:
        roof_configuration = seed_default_roof_configuration(db)

    with SessionLocal() as db:
        battery_configuration = seed_default_battery_configuration(db)

    with SessionLocal() as db:
        platform = seed_platform_data(db)

    print("Demo account seed complete:")
    for result in results:
        state = "created" if result.created else "already exists"
        print(f"  - {result.email} ({result.role.value}): {state}")
    print("Stakeholder demo account seed complete:")
    for result in stakeholder_results:
        state = "created" if result.created else "already exists"
        print(f"  - {result.email} ({result.role.value}): {state}")

    print(
        "Apartment seed complete: "
        f"{apartments.created} created, {apartments.existing} already existed, "
        f"{apartments.total} total."
    )
    print(
        "Ownership seed complete: "
        f"{foundation.ownership.created} created, "
        f"{foundation.ownership.existing} already existed, "
        f"{foundation.ownership.total} total, "
        f"{foundation.ownership.total_percentage}% total."
    )
    print(
        "Default electricity tariff: "
        f"{'created' if foundation.tariff_created else 'already exists'}."
    )
    print(
        "Default billing configuration: "
        f"{'created' if billing_configuration.created else 'already exists'} "
        f"(id={billing_configuration.configuration_id}, "
        f"{billing_configuration.total} total)."
    )
    print(
        "Default RoofMax configuration: "
        f"{'created' if roof_configuration.created else 'already exists'} "
        f"(id={roof_configuration.configuration_id}, "
        f"{roof_configuration.total} total)."
    )
    print(
        "Default SolarVault configuration: "
        f"{'created' if battery_configuration.created else 'already exists'} "
        f"(id={battery_configuration.configuration_id}, "
        f"{battery_configuration.total} total)."
    )
    for email, state in foundation.residents_linked.items():
        print(f"Resident link {email}: {state}.")

    print("India Green Grid platform seed complete:")
    print(
        f"  - Stakeholder demo accounts: {platform.accounts_created} created, "
        f"{platform.accounts_existing} already existed."
    )
    print(
        f"  - Sample jobs: {platform.jobs} created; "
        f"finance schemes: {platform.finance_schemes} created; "
        f"recyclers: {platform.recyclers} created."
    )
    print(
        f"  - RPO targets: {platform.rpo_targets} created; "
        f"recycling transactions: {platform.recycling_transactions} created; "
        f"solar calculations: {platform.solar_calculations} created."
    )
    print(
        "  - Public datasets were ingested as clearly-labelled SAMPLE data "
        "(see Admin > Data sources)."
    )

    password_source = (
        "DEMO_* environment variables"
        if settings.demo_admin_password and settings.demo_resident_password
        else "development fallback values (set DEMO_* variables to override)"
    )
    print(f"Passwords: {password_source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
