"""ORM model, relationship and constraint tests."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (
    Apartment,
    ElectricityTariff,
    OwnershipShare,
    SolarConfiguration,
)


def _apartment(flat: str = "A-101") -> Apartment:
    return Apartment(
        flat_number=flat,
        floor_number=1,
        residents_count=3,
        apartment_category="2BHK",
    )


def test_apartment_ownership_relationship_and_cascade(db):
    apartment = _apartment()
    db.add(apartment)
    db.flush()

    share = OwnershipShare(
        apartment_id=apartment.id,
        contribution_amount=Decimal("250000.00"),
        ownership_percentage=Decimal("12.500"),
    )
    db.add(share)
    db.commit()
    db.refresh(apartment)

    assert apartment.ownership_share is not None
    assert apartment.ownership_share.ownership_percentage == Decimal("12.500")
    assert share.apartment.flat_number == "A-101"

    db.delete(apartment)
    db.commit()
    remaining = db.query(OwnershipShare).filter_by(apartment_id=apartment.id).all()
    assert remaining == []


def test_apartment_flat_numbers_are_unique(db):
    db.add(_apartment("A-101"))
    db.commit()
    db.add(_apartment("A-101"))

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_one_ownership_share_per_apartment(db):
    apartment = _apartment()
    db.add(apartment)
    db.flush()
    db.add_all(
        [
            OwnershipShare(
                apartment_id=apartment.id,
                contribution_amount=Decimal("1000.00"),
                ownership_percentage=Decimal("10.000"),
            ),
            OwnershipShare(
                apartment_id=apartment.id,
                contribution_amount=Decimal("2000.00"),
                ownership_percentage=Decimal("20.000"),
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_ownership_percentage_is_range_checked(db):
    apartment = _apartment()
    db.add(apartment)
    db.flush()
    db.add(
        OwnershipShare(
            apartment_id=apartment.id,
            contribution_amount=Decimal("1000.00"),
            ownership_percentage=Decimal("101.000"),
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_solar_configuration_and_tariff_persist(db):
    db.add(
        SolarConfiguration(
            capacity_kwp=Decimal("25.50"),
            rooftop_area=Decimal("180.00"),
            installation_cost=Decimal("1250000.00"),
        )
    )
    db.add(
        ElectricityTariff(
            price_per_kwh=Decimal("7.2500"),
            effective_from=date(2026, 1, 1),
            effective_to=None,
        )
    )
    db.commit()

    config = db.query(SolarConfiguration).one()
    tariff = db.query(ElectricityTariff).one()
    assert config.capacity_kwp == Decimal("25.50")
    assert tariff.price_per_kwh == Decimal("7.2500")
    assert tariff.effective_to is None


def test_tariff_period_is_validated_by_database(db):
    db.add(
        ElectricityTariff(
            price_per_kwh=Decimal("7.2500"),
            effective_from=date(2026, 6, 1),
            effective_to=date(2026, 5, 1),
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
