"""Generate the default SolarTwin dataset (50 kWp, 30 days).

Usage (from the backend directory, after ``alembic upgrade head``):
    python scripts/generate_simulation.py

The command is idempotent: an identical completed simulation is reused instead
of inserting duplicate readings. Use the API with ``regenerate=true`` to replace
an existing run.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import inspect  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.services import energy_balance, simulation_service  # noqa: E402


def main() -> int:
    configure_logging(settings.log_level)

    tables = set(inspect(engine).get_table_names())
    required = {
        "apartments",
        "simulation_runs",
        "solar_generation",
        "meter_readings",
        "common_consumption",
    }
    if not required.issubset(tables):
        print(
            "Database schema is missing simulation tables. "
            "Run 'alembic upgrade head' first.",
            file=sys.stderr,
        )
        return 1

    days = simulation_service.DEFAULT_SIMULATION_DAYS
    start_date = date.today() - timedelta(days=days - 1)
    config = simulation_service.SimulationConfig(
        capacity_kwp=simulation_service.DEFAULT_CAPACITY_KWP,
        start_date=start_date,
        days=days,
        seed=simulation_service.DEFAULT_SIMULATION_SEED,
    )

    with SessionLocal() as db:
        result = simulation_service.generate_full_simulation(db, config)
        status = simulation_service.run_status(db, result.run)
        frame = energy_balance.load_balance_frame(db, result.run.id)
        totals = energy_balance.summarise_balance(frame)
        common_totals = simulation_service.common_category_totals(db, result.run.id)

    state = "reused existing run" if result.reused else "generated new run"
    print(f"SolarTwin simulation {result.run.id}: {state}")
    print(f"  Period: {config.start_date} .. {config.end_date} ({days} days)")
    print(f"  Capacity: {config.capacity_kwp} kWp, seed: {config.seed}")
    print(
        "  Records: "
        f"solar={status['solar_records']}, "
        f"apartment={status['meter_records']}, "
        f"common={status['common_records']}"
    )
    print(f"  Solar generated: {totals['total_solar_generation_kwh']} kWh")
    print(f"  Apartment demand: {totals['total_apartment_consumption_kwh']} kWh")
    print(f"  Common-area demand: {totals['total_common_consumption_kwh']} kWh")
    print(f"  Building demand: {totals['total_building_demand_kwh']} kWh")
    print(f"  Grid import: {totals['grid_import_kwh']} kWh")
    print(f"  Surplus solar: {totals['surplus_solar_kwh']} kWh")
    print(f"  Solar utilization: {totals['solar_utilization_percentage']}%")
    print(f"  Conservation: {totals['conservation_ok']}")
    print(f"  Common by category: {common_totals}")
    return 0 if totals["conservation_ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
