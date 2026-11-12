"""Deterministic setup data required by the fair-allocation module.

The SolarTwin dataset stores consumption and generation, but it intentionally
does not invent financial or legal data.  Part 3 therefore needs two explicitly
documented reference datasets:

* **Ownership shares** - a contribution-based share per flat, derived from the
  apartment category.  Percentages are normalised to exactly 100.000 % and the
  records are never overwritten once an administrator edits them.
* **Electricity tariff** - a single default revision used only to express an
  allocated solar benefit as an *estimated* credit in rupees.

Both are configuration, not simulated measurements.  Allocation always reads
the current rows from PostgreSQL.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.apartment import Apartment
from app.models.electricity_tariff import ElectricityTariff
from app.models.ownership_share import OwnershipShare
from app.models.user import User

CONTRIBUTION_BY_CATEGORY: dict[str, Decimal] = {
    "1BHK": Decimal("250000.00"),
    "2BHK": Decimal("350000.00"),
    "3BHK": Decimal("475000.00"),
    "4BHK": Decimal("600000.00"),
}
DEFAULT_CATEGORY_CONTRIBUTION = Decimal("300000.00")
PERCENTAGE_QUANTUM = Decimal("0.001")

DEFAULT_TARIFF_PRICE_PER_KWH = Decimal("7.5000")
DEFAULT_TARIFF_EFFECTIVE_FROM = date(2025, 1, 1)


@dataclass(frozen=True)
class OwnershipSeedResult:
    created: int
    existing: int
    total: int
    total_percentage: Decimal


@dataclass(frozen=True)
class SetupSeedResult:
    ownership: OwnershipSeedResult
    tariff_created: bool
    residents_linked: dict[str, str]


def calculate_ownership_percentages(
    apartments: list[Apartment],
) -> list[tuple[Apartment, Decimal, Decimal]]:
    """Return ``(apartment, contribution, percentage)`` with an exact 100 % sum.

    Percentages are rounded to three decimals.  Any rounding residual is applied
    to the largest contributor so the ledger validates without hiding the
    residual in an unrelated record.
    """

    if not apartments:
        return []

    contributions = [
        (
            apartment,
            CONTRIBUTION_BY_CATEGORY.get(
                apartment.apartment_category, DEFAULT_CATEGORY_CONTRIBUTION
            ),
        )
        for apartment in apartments
    ]
    total_contribution = sum(
        (contribution for _, contribution in contributions), Decimal("0")
    )
    if total_contribution <= 0:
        raise ValueError("Total ownership contribution must be positive.")

    rows: list[tuple[Apartment, Decimal, Decimal]] = []
    for apartment, contribution in contributions:
        raw = (contribution / total_contribution) * Decimal("100")
        percentage = raw.quantize(PERCENTAGE_QUANTUM, rounding=ROUND_HALF_UP)
        rows.append((apartment, contribution, percentage))

    residual = Decimal("100.000") - sum(
        (percentage for _, _, percentage in rows), Decimal("0")
    )
    if residual != 0:
        largest_index = max(
            range(len(rows)), key=lambda index: rows[index][1]
        )
        apartment, contribution, percentage = rows[largest_index]
        rows[largest_index] = (
            apartment,
            contribution,
            (percentage + residual).quantize(PERCENTAGE_QUANTUM),
        )

    return rows


def seed_ownership_shares(db: Session) -> OwnershipSeedResult:
    """Create missing ownership rows without modifying existing records."""

    apartments = list(db.scalars(select(Apartment).order_by(Apartment.id)).all())
    if not apartments:
        raise ValueError("Seed apartments before ownership shares.")

    existing_ids = set(
        db.scalars(select(OwnershipShare.apartment_id)).all()
    )
    created = 0
    for apartment, contribution, percentage in calculate_ownership_percentages(
        apartments
    ):
        if apartment.id in existing_ids:
            continue
        db.add(
            OwnershipShare(
                apartment_id=apartment.id,
                contribution_amount=contribution,
                ownership_percentage=percentage,
            )
        )
        created += 1

    if created:
        db.commit()

    total = int(db.scalar(select(func.count()).select_from(OwnershipShare)) or 0)
    total_percentage = db.scalar(
        select(func.coalesce(func.sum(OwnershipShare.ownership_percentage), 0))
    )
    return OwnershipSeedResult(
        created=created,
        existing=len(existing_ids),
        total=total,
        total_percentage=Decimal(str(total_percentage or 0)).quantize(
            PERCENTAGE_QUANTUM
        ),
    )


def seed_default_tariff(db: Session) -> bool:
    """Create the documented default tariff revision when none exists."""

    existing = db.scalar(select(ElectricityTariff.id).limit(1))
    if existing is not None:
        return False

    db.add(
        ElectricityTariff(
            price_per_kwh=DEFAULT_TARIFF_PRICE_PER_KWH,
            effective_from=DEFAULT_TARIFF_EFFECTIVE_FROM,
            effective_to=None,
        )
    )
    db.commit()
    return True


def link_demo_residents(db: Session) -> dict[str, str]:
    """Attach the two demo residents to A-101 and A-102 when unlinked.

    A user with an existing apartment assignment is never changed, so an
    administrator's manual or future self-service assignment is preserved.
    """

    links = {
        settings.demo_resident_1_email.lower(): "A-101",
        settings.demo_resident_2_email.lower(): "A-102",
    }
    result: dict[str, str] = {}
    changed = False

    for email, flat_number in links.items():
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            result[email] = "user not present"
            continue
        if user.apartment_id is not None:
            result[email] = "already linked"
            continue

        apartment = db.scalar(
            select(Apartment).where(Apartment.flat_number == flat_number)
        )
        if apartment is None:
            result[email] = f"{flat_number} not present"
            continue

        user.apartment_id = apartment.id
        changed = True
        result[email] = f"linked to {flat_number}"

    if changed:
        db.commit()
    return result


def seed_allocation_foundation(db: Session) -> SetupSeedResult:
    apartments = list(db.scalars(select(Apartment).order_by(Apartment.id)).all())
    if not apartments:
        raise ValueError("Seed the apartment inventory before allocation setup.")
    ownership = seed_ownership_shares(db)
    tariff_created = seed_default_tariff(db)
    residents = link_demo_residents(db)
    return SetupSeedResult(
        ownership=ownership,
        tariff_created=tariff_created,
        residents_linked=residents,
    )
