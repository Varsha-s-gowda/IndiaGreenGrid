"""Pure billing arithmetic for BillFair.

Every monetary and energy calculation used by the billing and audit services
lives here.  The module has no database or web dependency, which makes the
formulas independently testable.

Definitions implemented by this module
--------------------------------------

``grid_import = max(0, consumption - solar_allocation)``

``grid_charge = sum(grid_import_at_tariff_segment * segment_tariff)``

``solar_credit = sum(solar_allocation_at_credit_segment * segment_credit_rate)``

``net_payable = grid_charge - solar_credit + maintenance + other_charges``

``no_solar_baseline = consumption * tariff + maintenance + other_charges``

``actual_estimated_cost = grid_charge + maintenance + other_charges``

``estimated_savings = no_solar_baseline - actual_estimated_cost``

The last two definitions intentionally exclude the internal society solar
credit from "actual estimated cost".  Savings therefore measure the value of
avoided grid electricity at the applicable tariff, while the solar credit is a
separate internal society benefit applied to the payable amount.  Neither is an
official BESCOM charge or BESCOM credit.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

MONEY_QUANTUM = Decimal("0.01")
ENERGY_QUANTUM = Decimal("0.000001")
RATE_QUANTUM = Decimal("0.0001")
PERCENT_QUANTUM = Decimal("0.001")
ENERGY_TOLERANCE_KWH = Decimal("0.000001")
MONEY_TOLERANCE = Decimal("0.01")


def to_decimal(value: Any) -> Decimal:
    """Convert database/JSON values to Decimal without binary float noise."""

    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money(value: Any) -> Decimal:
    return to_decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def energy(value: Any) -> Decimal:
    return to_decimal(value).quantize(ENERGY_QUANTUM, rounding=ROUND_HALF_UP)


def rate(value: Any) -> Decimal:
    return to_decimal(value).quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP)


def percentage(value: Any) -> Decimal:
    return to_decimal(value).quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)


def decimal_float(value: Decimal | int | float | None) -> float | None:
    if value is None:
        return None
    return float(value)


def safe_percentage(numerator: Any, denominator: Any) -> Decimal:
    denominator_decimal = to_decimal(denominator)
    if denominator_decimal <= 0:
        return Decimal("0.000")
    return percentage(
        (to_decimal(numerator) / denominator_decimal) * Decimal("100")
    )


def calculate_grid_import(consumption_kwh: Any, solar_allocation_kwh: Any) -> Decimal:
    """Return grid import, rejecting an impossible solar allocation."""

    consumption = to_decimal(consumption_kwh)
    solar = to_decimal(solar_allocation_kwh)
    if consumption < 0 or solar < 0:
        raise ValueError("Consumption and solar allocation must be non-negative.")
    if solar > consumption + ENERGY_TOLERANCE_KWH:
        raise ValueError(
            "Solar allocation cannot exceed apartment consumption "
            f"({solar} > {consumption})."
        )
    return energy(max(Decimal("0"), consumption - solar))


def calculate_grid_charge(grid_import_kwh: Any, tariff_per_kwh: Any) -> Decimal:
    return money(to_decimal(grid_import_kwh) * to_decimal(tariff_per_kwh))


def calculate_solar_credit(solar_allocation_kwh: Any, credit_rate_per_kwh: Any) -> Decimal:
    return money(
        to_decimal(solar_allocation_kwh) * to_decimal(credit_rate_per_kwh)
    )


def calculate_net_payable(
    grid_charge: Any,
    solar_credit: Any,
    maintenance_charge: Any,
    other_charges: Any,
) -> Decimal:
    return money(
        to_decimal(grid_charge)
        - to_decimal(solar_credit)
        + to_decimal(maintenance_charge)
        + to_decimal(other_charges)
    )


def calculate_savings(no_solar_baseline_cost: Any, actual_estimated_cost: Any) -> Decimal:
    return money(to_decimal(no_solar_baseline_cost) - to_decimal(actual_estimated_cost))


def days_in_month(day: date) -> int:
    return calendar.monthrange(day.year, day.month)[1]


def daily_prorated_amount(monthly_amount: Any, day: date) -> Decimal:
    """One calendar day's share of a monthly fixed charge."""

    return to_decimal(monthly_amount) / Decimal(days_in_month(day))


def prorate_monthly_charge(monthly_amount: Any, start: date, end: date) -> Decimal:
    """Prorate a monthly charge over an inclusive date range.

    Each calendar day contributes ``monthly_amount / days_in_that_month``.  A
    full month therefore yields exactly the configured monthly amount.
    """

    if end < start:
        raise ValueError("end must be on or after start.")
    total = Decimal("0")
    cursor = start
    while cursor <= end:
        total += daily_prorated_amount(monthly_amount, cursor)
        cursor = cursor + timedelta(days=1)
    return money(total)


@dataclass(frozen=True)
class ChargeSegment:
    """Consumption, allocation and rates for a consecutive run of days."""

    start_date: date
    end_date: date
    tariff_id: int | None
    tariff_price_per_kwh: Decimal
    config_id: int | None
    solar_credit_rate_per_kwh: Decimal
    consumption_kwh: Decimal
    solar_allocation_kwh: Decimal
    hour_count: int


@dataclass(frozen=True)
class LineItemDraft:
    charge_type: str
    description: str
    quantity: Decimal
    unit: str
    rate: Decimal
    amount: Decimal
    sort_order: int


@dataclass
class BillCalculation:
    consumption_kwh: Decimal
    solar_allocation_kwh: Decimal
    grid_import_kwh: Decimal
    solar_coverage_percentage: Decimal
    tariff_price_per_kwh: Decimal
    solar_credit_rate_per_kwh: Decimal
    grid_charge: Decimal
    solar_credit: Decimal
    maintenance_charge: Decimal
    other_charges: Decimal
    net_payable: Decimal
    no_solar_baseline_cost: Decimal
    actual_estimated_cost: Decimal
    estimated_savings: Decimal
    hour_count: int
    tariff_snapshot: list[dict[str, Any]] = field(default_factory=list)
    charge_snapshot: dict[str, Any] = field(default_factory=dict)
    line_items: list[LineItemDraft] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "consumption_kwh": decimal_float(self.consumption_kwh),
            "solar_allocation_kwh": decimal_float(self.solar_allocation_kwh),
            "grid_import_kwh": decimal_float(self.grid_import_kwh),
            "solar_coverage_percentage": decimal_float(
                self.solar_coverage_percentage
            ),
            "tariff_price_per_kwh": decimal_float(self.tariff_price_per_kwh),
            "solar_credit_rate_per_kwh": decimal_float(
                self.solar_credit_rate_per_kwh
            ),
            "grid_charge": decimal_float(self.grid_charge),
            "solar_credit": decimal_float(self.solar_credit),
            "maintenance_charge": decimal_float(self.maintenance_charge),
            "other_charges": decimal_float(self.other_charges),
            "net_payable": decimal_float(self.net_payable),
            "no_solar_baseline_cost": decimal_float(
                self.no_solar_baseline_cost
            ),
            "actual_estimated_cost": decimal_float(self.actual_estimated_cost),
            "estimated_savings": decimal_float(self.estimated_savings),
            "hour_count": self.hour_count,
            "tariff_snapshot": self.tariff_snapshot,
            "charge_snapshot": self.charge_snapshot,
            "line_items": [
                {
                    "charge_type": item.charge_type,
                    "description": item.description,
                    "quantity": decimal_float(item.quantity),
                    "unit": item.unit,
                    "rate": decimal_float(item.rate),
                    "amount": decimal_float(item.amount),
                    "sort_order": item.sort_order,
                }
                for item in self.line_items
            ],
        }


def calculate_bill(
    segments: list[ChargeSegment],
    *,
    maintenance_charge: Any,
    other_charges: Any,
    other_charges_description: str | None,
) -> BillCalculation:
    """Apply all billing formulas to the supplied rate segments."""

    if not segments:
        raise ValueError("At least one billing segment is required.")

    maintenance = money(maintenance_charge)
    other = money(other_charges)

    total_consumption = Decimal("0")
    total_solar = Decimal("0")
    total_grid = Decimal("0")
    total_grid_charge = Decimal("0")
    total_solar_credit = Decimal("0")
    total_baseline_energy = Decimal("0")
    total_hours = 0
    line_items: list[LineItemDraft] = []
    tariff_snapshot: list[dict[str, Any]] = []
    sort_order = 0

    for segment in segments:
        consumption = energy(segment.consumption_kwh)
        solar = energy(segment.solar_allocation_kwh)
        grid_import = calculate_grid_import(consumption, solar)
        tariff_price = rate(segment.tariff_price_per_kwh)
        credit_rate = rate(segment.solar_credit_rate_per_kwh)

        segment_grid_charge = calculate_grid_charge(grid_import, tariff_price)
        segment_solar_credit = calculate_solar_credit(solar, credit_rate)
        segment_baseline = calculate_grid_charge(consumption, tariff_price)

        total_consumption += consumption
        total_solar += solar
        total_grid += grid_import
        total_grid_charge += segment_grid_charge
        total_solar_credit += segment_solar_credit
        total_baseline_energy += segment_baseline
        total_hours += int(segment.hour_count)

        label = (
            f"{segment.start_date.isoformat()} to {segment.end_date.isoformat()}"
        )
        line_items.append(
            LineItemDraft(
                charge_type="GRID_CHARGE",
                description=(
                    f"Grid import at Rs {tariff_price}/kWh ({label})"
                ),
                quantity=grid_import,
                unit="kWh",
                rate=tariff_price,
                amount=segment_grid_charge,
                sort_order=sort_order,
            )
        )
        sort_order += 1

        if solar > 0:
            line_items.append(
                LineItemDraft(
                    charge_type="SOLAR_CREDIT",
                    description=(
                        "Internal society solar credit at "
                        f"Rs {credit_rate}/kWh ({label})"
                    ),
                    quantity=solar,
                    unit="kWh",
                    rate=credit_rate,
                    amount=-segment_solar_credit,
                    sort_order=sort_order,
                )
            )
            sort_order += 1

        tariff_snapshot.append(
            {
                "start_date": segment.start_date.isoformat(),
                "end_date": segment.end_date.isoformat(),
                "tariff_id": segment.tariff_id,
                "tariff_price_per_kwh": float(tariff_price),
                "config_id": segment.config_id,
                "solar_credit_rate_per_kwh": float(credit_rate),
                "consumption_kwh": float(consumption),
                "solar_allocation_kwh": float(solar),
                "grid_import_kwh": float(grid_import),
                "grid_charge": float(segment_grid_charge),
                "solar_credit": float(segment_solar_credit),
                "hour_count": int(segment.hour_count),
            }
        )

    line_items.append(
        LineItemDraft(
            charge_type="MAINTENANCE",
            description="Monthly maintenance charge (prorated by calendar day)",
            quantity=Decimal("1"),
            unit="statement",
            rate=maintenance,
            amount=maintenance,
            sort_order=sort_order,
        )
    )
    sort_order += 1
    line_items.append(
        LineItemDraft(
            charge_type="OTHER_CHARGE",
            description=other_charges_description or "Other society charges",
            quantity=Decimal("1"),
            unit="statement",
            rate=other,
            amount=other,
            sort_order=sort_order,
        )
    )

    grid_charge = money(total_grid_charge)
    solar_credit = money(total_solar_credit)
    net_payable = calculate_net_payable(
        grid_charge, solar_credit, maintenance, other
    )
    baseline = money(total_baseline_energy + maintenance + other)
    actual = money(grid_charge + maintenance + other)
    savings = calculate_savings(baseline, actual)

    weighted_tariff = (
        rate(total_baseline_energy / total_consumption)
        if total_consumption > 0
        else Decimal("0.0000")
    )
    weighted_credit_rate = (
        rate(solar_credit / total_solar)
        if total_solar > 0
        else Decimal("0.0000")
    )

    return BillCalculation(
        consumption_kwh=energy(total_consumption),
        solar_allocation_kwh=energy(total_solar),
        grid_import_kwh=energy(total_grid),
        solar_coverage_percentage=safe_percentage(total_solar, total_consumption),
        tariff_price_per_kwh=weighted_tariff,
        solar_credit_rate_per_kwh=weighted_credit_rate,
        grid_charge=grid_charge,
        solar_credit=solar_credit,
        maintenance_charge=maintenance,
        other_charges=other,
        net_payable=net_payable,
        no_solar_baseline_cost=baseline,
        actual_estimated_cost=actual,
        estimated_savings=savings,
        hour_count=total_hours,
        tariff_snapshot=tariff_snapshot,
        charge_snapshot={
            "maintenance_charge": float(maintenance),
            "other_charges": float(other),
            "other_charges_description": other_charges_description,
            "weighted_tariff_per_kwh": float(weighted_tariff),
            "weighted_solar_credit_rate_per_kwh": float(weighted_credit_rate),
        },
        line_items=line_items,
    )


def line_item_total(line_items: list[LineItemDraft] | list[Any]) -> Decimal:
    total = Decimal("0")
    for item in line_items:
        total += to_decimal(
            item.amount if hasattr(item, "amount") else item.get("amount", 0)
        )
    return money(total)


def values_match(left: Any, right: Any, tolerance: Any) -> bool:
    return abs(to_decimal(left) - to_decimal(right)) <= to_decimal(tolerance)
