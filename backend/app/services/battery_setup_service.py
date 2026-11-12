"""Documented default battery assumptions for SolarVault.

These are *configuration inputs*, not measurements and not a recommendation.
They are stored in PostgreSQL and can be replaced by an administrator through
``PUT /api/solarvault/configuration``.  The seed is created once and never
overwrites edits.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.battery import BatteryConfiguration

DEFAULT_CONFIGURATION_NAME = "Society battery plan (seeded default)"
DEFAULT_CAPACITY_KWH = Decimal("10.000")
DEFAULT_MAX_CHARGE_KW = Decimal("5.000")
DEFAULT_MAX_DISCHARGE_KW = Decimal("5.000")
DEFAULT_CHARGE_EFFICIENCY_PCT = Decimal("95.000")
DEFAULT_DISCHARGE_EFFICIENCY_PCT = Decimal("95.000")
DEFAULT_INITIAL_SOC_PCT = Decimal("20.000")
DEFAULT_MIN_SOC_PCT = Decimal("10.000")
DEFAULT_MAX_SOC_PCT = Decimal("95.000")

DEFAULT_NOTES = (
    "Seeded storage assumptions for a society battery. Capacity, power limits "
    "and efficiencies are planning inputs, not measured equipment performance. "
    "Replace them with the datasheet values of the proposed battery and inverter."
)


@dataclass(frozen=True)
class BatteryConfigurationSeedResult:
    created: bool
    configuration_id: int | None
    total: int


def get_active_battery_configuration(db: Session) -> BatteryConfiguration | None:
    return db.scalar(
        select(BatteryConfiguration)
        .where(BatteryConfiguration.is_active.is_(True))
        .order_by(BatteryConfiguration.id.desc())
    )


def seed_default_battery_configuration(
    db: Session,
) -> BatteryConfigurationSeedResult:
    """Create the documented default configuration once; never overwrite edits."""

    existing_active = get_active_battery_configuration(db)
    total = len(db.scalars(select(BatteryConfiguration.id)).all())
    if existing_active is not None:
        return BatteryConfigurationSeedResult(
            created=False,
            configuration_id=existing_active.id,
            total=total,
        )

    configuration = BatteryConfiguration(
        name=DEFAULT_CONFIGURATION_NAME,
        capacity_kwh=DEFAULT_CAPACITY_KWH,
        max_charge_kw=DEFAULT_MAX_CHARGE_KW,
        max_discharge_kw=DEFAULT_MAX_DISCHARGE_KW,
        charge_efficiency_pct=DEFAULT_CHARGE_EFFICIENCY_PCT,
        discharge_efficiency_pct=DEFAULT_DISCHARGE_EFFICIENCY_PCT,
        initial_soc_pct=DEFAULT_INITIAL_SOC_PCT,
        min_soc_pct=DEFAULT_MIN_SOC_PCT,
        max_soc_pct=DEFAULT_MAX_SOC_PCT,
        is_active=True,
        notes=DEFAULT_NOTES,
    )
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return BatteryConfigurationSeedResult(
        created=True,
        configuration_id=configuration.id,
        total=total + 1,
    )
