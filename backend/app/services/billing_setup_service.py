"""Documented default billing rules for BillFair.

Like the Part 3 ownership ledger and default tariff, these are *configuration*
inputs, not simulated measurements.  They are stored in PostgreSQL and can be
replaced by an administrator through ``POST /api/billing/config``.  Billing and
auditing always read the effective rows from the database.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import BillingConfiguration

DEFAULT_SOLAR_CREDIT_RATE_PER_KWH = Decimal("4.0000")
DEFAULT_MAINTENANCE_CHARGE = Decimal("500.00")
DEFAULT_OTHER_CHARGES = Decimal("0.00")
DEFAULT_OTHER_CHARGES_DESCRIPTION = "No other society charges"
DEFAULT_CONFIGURATION_NAME = "Society billing rules (seeded default)"
DEFAULT_CONFIGURATION_EFFECTIVE_FROM = date(2025, 1, 1)


@dataclass(frozen=True)
class BillingConfigSeedResult:
    created: bool
    configuration_id: int | None
    total: int


def seed_default_billing_configuration(db: Session) -> BillingConfigSeedResult:
    """Create the documented default rules once; never overwrite edits."""

    existing = db.scalar(
        select(BillingConfiguration)
        .order_by(BillingConfiguration.effective_from.desc())
        .limit(1)
    )
    if existing is not None:
        count = len(db.scalars(select(BillingConfiguration.id)).all())
        return BillingConfigSeedResult(
            created=False, configuration_id=existing.id, total=count
        )

    configuration = BillingConfiguration(
        name=DEFAULT_CONFIGURATION_NAME,
        solar_credit_rate_per_kwh=DEFAULT_SOLAR_CREDIT_RATE_PER_KWH,
        maintenance_charge=DEFAULT_MAINTENANCE_CHARGE,
        other_charges=DEFAULT_OTHER_CHARGES,
        other_charges_description=DEFAULT_OTHER_CHARGES_DESCRIPTION,
        effective_from=DEFAULT_CONFIGURATION_EFFECTIVE_FROM,
        effective_to=None,
    )
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return BillingConfigSeedResult(
        created=True, configuration_id=configuration.id, total=1
    )
