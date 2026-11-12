"""Documented default assumptions for RoofMax.

These are *configuration inputs*, not measurements and not a recommendation.
They are stored in PostgreSQL and can be replaced by an administrator through
``PUT /api/roofmax/configuration``.  The seed is created once and never
overwrites edits.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.roofmax import RoofConfiguration

DEFAULT_CONFIGURATION_NAME = "Society rooftop plan (seeded default)"
DEFAULT_LOCATION = "Bengaluru, Karnataka"
DEFAULT_USABLE_ROOF_AREA_M2 = Decimal("650.00")
DEFAULT_PANEL_LENGTH_M = Decimal("2.278")
DEFAULT_PANEL_WIDTH_M = Decimal("1.134")
DEFAULT_PANEL_CAPACITY_WP = Decimal("550.00")
DEFAULT_PANEL_EFFICIENCY_PCT = Decimal("21.300")
DEFAULT_PERFORMANCE_RATIO_PCT = Decimal("88.000")
DEFAULT_SYSTEM_LOSS_PCT = Decimal("10.000")
DEFAULT_SOLAR_IRRADIATION_KWH_M2_DAY = Decimal("5.400")
DEFAULT_INSTALLATION_COST_PER_KWP = Decimal("52000.00")
DEFAULT_MAINTENANCE_COST_PER_KWP_YEAR = Decimal("1200.00")
DEFAULT_TARIFF_ESCALATION_PCT = Decimal("4.000")
DEFAULT_MAINTENANCE_ESCALATION_PCT = Decimal("5.000")
DEFAULT_SCENARIO_YIELD_VARIATION_PCT = Decimal("12.000")
DEFAULT_SCENARIO_TARIFF_VARIATION_PCT = Decimal("10.000")
DEFAULT_SCENARIO_COST_VARIATION_PCT = Decimal("10.000")
DEFAULT_SHORT_HORIZON_YEARS = 10
DEFAULT_LONG_HORIZON_YEARS = 20

DEFAULT_NOTES = (
    "Seeded planning assumptions for a Bengaluru society rooftop. Irradiation "
    "is a location-based planning value, not a weather forecast. Adjust panel "
    "specifications, costs and tariff assumptions to match quotations and the "
    "society's actual tariff."
)


@dataclass(frozen=True)
class RoofConfigurationSeedResult:
    created: bool
    configuration_id: int | None
    total: int


def seed_default_roof_configuration(db: Session) -> RoofConfigurationSeedResult:
    """Create the documented default configuration once; never overwrite edits."""

    existing_active = db.scalar(
        select(RoofConfiguration)
        .where(RoofConfiguration.is_active.is_(True))
        .order_by(RoofConfiguration.id.desc())
    )
    total = len(
        db.scalars(select(RoofConfiguration.id)).all()
    )
    if existing_active is not None:
        return RoofConfigurationSeedResult(
            created=False,
            configuration_id=existing_active.id,
            total=total,
        )

    configuration = RoofConfiguration(
        name=DEFAULT_CONFIGURATION_NAME,
        location=DEFAULT_LOCATION,
        usable_roof_area_m2=DEFAULT_USABLE_ROOF_AREA_M2,
        panel_length_m=DEFAULT_PANEL_LENGTH_M,
        panel_width_m=DEFAULT_PANEL_WIDTH_M,
        panel_capacity_wp=DEFAULT_PANEL_CAPACITY_WP,
        panel_efficiency_pct=DEFAULT_PANEL_EFFICIENCY_PCT,
        performance_ratio_pct=DEFAULT_PERFORMANCE_RATIO_PCT,
        system_loss_pct=DEFAULT_SYSTEM_LOSS_PCT,
        solar_irradiation_kwh_m2_day=DEFAULT_SOLAR_IRRADIATION_KWH_M2_DAY,
        installation_cost_per_kwp=DEFAULT_INSTALLATION_COST_PER_KWP,
        maintenance_cost_per_kwp_year=DEFAULT_MAINTENANCE_COST_PER_KWP_YEAR,
        tariff_override_per_kwh=None,
        tariff_escalation_pct=DEFAULT_TARIFF_ESCALATION_PCT,
        maintenance_escalation_pct=DEFAULT_MAINTENANCE_ESCALATION_PCT,
        conservative_yield_variation_pct=DEFAULT_SCENARIO_YIELD_VARIATION_PCT,
        conservative_tariff_variation_pct=DEFAULT_SCENARIO_TARIFF_VARIATION_PCT,
        conservative_cost_variation_pct=DEFAULT_SCENARIO_COST_VARIATION_PCT,
        optimistic_yield_variation_pct=DEFAULT_SCENARIO_YIELD_VARIATION_PCT,
        optimistic_tariff_variation_pct=DEFAULT_SCENARIO_TARIFF_VARIATION_PCT,
        optimistic_cost_variation_pct=DEFAULT_SCENARIO_COST_VARIATION_PCT,
        short_horizon_years=DEFAULT_SHORT_HORIZON_YEARS,
        long_horizon_years=DEFAULT_LONG_HORIZON_YEARS,
        is_active=True,
        notes=DEFAULT_NOTES,
    )
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return RoofConfigurationSeedResult(
        created=True,
        configuration_id=configuration.id,
        total=total + 1,
    )
