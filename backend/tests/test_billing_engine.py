"""Pure unit tests for the BillFair billing arithmetic."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services import billing_engine as engine


def test_grid_import_and_charges_follow_documented_formulas():
    grid = engine.calculate_grid_import(Decimal("100.000000"), Decimal("40.000000"))
    assert grid == Decimal("60.000000")
    assert engine.calculate_grid_charge(grid, Decimal("7.5000")) == Decimal("450.00")
    assert engine.calculate_solar_credit(
        Decimal("40.000000"), Decimal("4.0000")
    ) == Decimal("160.00")
    assert engine.calculate_net_payable(
        Decimal("450.00"), Decimal("160.00"), Decimal("500.00"), Decimal("20.00")
    ) == Decimal("810.00")


def test_savings_measure_avoided_grid_electricity_not_internal_credit():
    baseline = engine.money(
        engine.calculate_grid_charge(Decimal("100"), Decimal("7.5"))
        + Decimal("500")
        + Decimal("0")
    )
    actual = engine.money(
        engine.calculate_grid_charge(Decimal("60"), Decimal("7.5"))
        + Decimal("500")
        + Decimal("0")
    )
    savings = engine.calculate_savings(baseline, actual)
    assert baseline == Decimal("1250.00")
    assert actual == Decimal("950.00")
    assert savings == Decimal("300.00")


def test_grid_import_rejects_allocation_above_consumption():
    with pytest.raises(ValueError):
        engine.calculate_grid_import(Decimal("10"), Decimal("11"))


def test_monthly_charge_prorates_by_calendar_day_across_months():
    amount = engine.prorate_monthly_charge(
        Decimal("500.00"), date(2026, 10, 12), date(2026, 11, 10)
    )
    expected = (Decimal("500") / Decimal(31) * 20) + (
        Decimal("500") / Decimal(30) * 10
    )
    assert amount == engine.money(expected)
    assert engine.prorate_monthly_charge(
        Decimal("500.00"), date(2026, 11, 1), date(2026, 11, 30)
    ) == Decimal("500.00")


def test_tariff_change_splits_segments_and_preserves_totals():
    segments = [
        engine.ChargeSegment(
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
            tariff_id=1,
            tariff_price_per_kwh=Decimal("7.5000"),
            config_id=1,
            solar_credit_rate_per_kwh=Decimal("4.0000"),
            consumption_kwh=Decimal("100.000000"),
            solar_allocation_kwh=Decimal("40.000000"),
            hour_count=360,
        ),
        engine.ChargeSegment(
            start_date=date(2026, 3, 16),
            end_date=date(2026, 3, 31),
            tariff_id=2,
            tariff_price_per_kwh=Decimal("8.2500"),
            config_id=1,
            solar_credit_rate_per_kwh=Decimal("4.0000"),
            consumption_kwh=Decimal("100.000000"),
            solar_allocation_kwh=Decimal("20.000000"),
            hour_count=384,
        ),
    ]
    result = engine.calculate_bill(
        segments,
        maintenance_charge=Decimal("500.00"),
        other_charges=Decimal("0.00"),
        other_charges_description="No other society charges",
    )
    assert result.consumption_kwh == Decimal("200.000000")
    assert result.solar_allocation_kwh == Decimal("60.000000")
    assert result.grid_import_kwh == Decimal("140.000000")
    assert result.grid_charge == engine.money(
        Decimal("60") * Decimal("7.5") + Decimal("80") * Decimal("8.25")
    )
    assert result.solar_credit == Decimal("240.00")
    assert result.maintenance_charge == Decimal("500.00")
    assert result.net_payable == engine.money(
        result.grid_charge - result.solar_credit + Decimal("500")
    )
    assert len(result.tariff_snapshot) == 2
    assert engine.line_item_total(result.line_items) == result.net_payable


def test_zero_consumption_has_zero_coverage_and_no_division_error():
    result = engine.calculate_bill(
        [
            engine.ChargeSegment(
                start_date=date(2026, 3, 1),
                end_date=date(2026, 3, 31),
                tariff_id=1,
                tariff_price_per_kwh=Decimal("7.5000"),
                config_id=1,
                solar_credit_rate_per_kwh=Decimal("4.0000"),
                consumption_kwh=Decimal("0"),
                solar_allocation_kwh=Decimal("0"),
                hour_count=0,
            )
        ],
        maintenance_charge=Decimal("500"),
        other_charges=Decimal("0"),
        other_charges_description=None,
    )
    assert result.solar_coverage_percentage == Decimal("0.000")
    assert result.net_payable == Decimal("500.00")
    assert result.estimated_savings == Decimal("0.00")
