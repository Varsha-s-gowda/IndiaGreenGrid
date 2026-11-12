"""Apartment inventory generation and read services."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.apartment import CONSUMPTION_PROFILES, Apartment

APARTMENT_COUNT = 60
DEFAULT_APARTMENT_SEED = 360
FIRST_FLAT_NUMBER = 101

_PROFILE_DISTRIBUTION = (
    ("LOW", 12),
    ("MEDIUM", 20),
    ("HIGH", 10),
    ("WORK_FROM_HOME", 10),
    ("NIGHT_HEAVY", 8),
)

_RESIDENTS_BY_PROFILE = {
    "LOW": (1, 2),
    "MEDIUM": (2, 4),
    "HIGH": (4, 6),
    "WORK_FROM_HOME": (1, 3),
    "NIGHT_HEAVY": (2, 4),
}

_CATEGORY_BY_RESIDENTS = {
    1: "1BHK",
    2: "2BHK",
    3: "2BHK",
    4: "3BHK",
    5: "3BHK",
    6: "4BHK",
}


@dataclass(frozen=True)
class ApartmentSeedResult:
    created: int
    existing: int
    total: int


@dataclass(frozen=True)
class ApartmentListResult:
    items: list[Apartment]
    total: int


def build_apartment_specs(seed: int = DEFAULT_APARTMENT_SEED) -> list[dict[str, object]]:
    """Build a deterministic, reproducible inventory of 60 apartments.

    Flat numbers run from ``A-101`` to ``A-160``.  The first digit of the
    numeric suffix is the floor (1-6) and the final two digits identify the unit
    on that floor.
    """

    if seed < 0:
        raise ValueError("Apartment seed must be non-negative.")

    rng = np.random.default_rng(seed)
    profiles: list[str] = []
    for profile, count in _PROFILE_DISTRIBUTION:
        profiles.extend([profile] * count)
    if len(profiles) != APARTMENT_COUNT:
        raise RuntimeError("Apartment profile distribution must cover 60 flats.")

    shuffled = np.array(profiles, dtype=object)
    rng.shuffle(shuffled)

    specs: list[dict[str, object]] = []
    for index in range(APARTMENT_COUNT):
        suffix = FIRST_FLAT_NUMBER + index
        flat_number = f"A-{suffix}"
        floor_number = 1 + (suffix - FIRST_FLAT_NUMBER) // 10
        profile = str(shuffled[index])
        low, high = _RESIDENTS_BY_PROFILE[profile]
        residents = int(rng.integers(low, high + 1))
        specs.append(
            {
                "flat_number": flat_number,
                "floor_number": floor_number,
                "residents_count": residents,
                "apartment_category": _CATEGORY_BY_RESIDENTS[residents],
                "consumption_profile": profile,
            }
        )
    return specs


def seed_apartments(
    db: Session,
    *,
    seed: int = DEFAULT_APARTMENT_SEED,
) -> ApartmentSeedResult:
    """Insert any missing apartments without touching existing records.

    The script is idempotent: running it repeatedly never creates duplicate flat
    numbers and never overwrites manual edits to existing apartments.
    """

    specs = build_apartment_specs(seed)
    expected_numbers = [str(spec["flat_number"]) for spec in specs]
    existing_numbers = set(
        db.scalars(
            select(Apartment.flat_number).where(
                Apartment.flat_number.in_(expected_numbers)
            )
        ).all()
    )

    created = 0
    for spec in specs:
        if spec["flat_number"] in existing_numbers:
            continue
        db.add(Apartment(**spec))
        created += 1

    if created:
        db.commit()

    total = db.scalar(select(func.count()).select_from(Apartment)) or 0
    return ApartmentSeedResult(
        created=created,
        existing=len(existing_numbers),
        total=total,
    )


def list_apartments(
    db: Session,
    *,
    floor_number: int | None = None,
    apartment_category: str | None = None,
    consumption_profile: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ApartmentListResult:
    filters = []
    if floor_number is not None:
        filters.append(Apartment.floor_number == floor_number)
    if apartment_category:
        filters.append(Apartment.apartment_category == apartment_category)
    if consumption_profile:
        filters.append(Apartment.consumption_profile == consumption_profile.upper())

    stmt = select(Apartment)
    if filters:
        stmt = stmt.where(*filters)

    total_stmt: Select[tuple[int]] = select(func.count()).select_from(Apartment)
    if filters:
        total_stmt = total_stmt.where(*filters)

    total = db.scalar(total_stmt) or 0
    items = list(
        db.scalars(
            stmt.order_by(Apartment.flat_number).limit(limit).offset(offset)
        ).all()
    )
    return ApartmentListResult(items=items, total=total)


def _counts_by(db: Session, column) -> dict[str, int]:
    rows = db.execute(select(column, func.count()).group_by(column)).all()
    return {str(key): int(count) for key, count in rows}


def apartment_summary(db: Session) -> dict[str, object]:
    total = db.scalar(select(func.count()).select_from(Apartment)) or 0
    residents = db.scalar(select(func.coalesce(func.sum(Apartment.residents_count), 0))) or 0
    average = float(residents) / total if total else 0.0

    profile_counts = {profile: 0 for profile in CONSUMPTION_PROFILES}
    profile_counts.update(_counts_by(db, Apartment.consumption_profile))

    return {
        "total_apartments": int(total),
        "total_residents": int(residents),
        "average_residents_per_apartment": round(average, 2),
        "apartments_by_floor": _counts_by(db, Apartment.floor_number),
        "apartments_by_category": _counts_by(db, Apartment.apartment_category),
        "apartments_by_profile": profile_counts,
    }


def profile_distribution(apartments: list[Apartment]) -> dict[str, int]:
    """Small pure helper used by tests and diagnostics."""

    return dict(Counter(apartment.consumption_profile for apartment in apartments))
