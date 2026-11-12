"""Fairness analytics for saved and preview allocation results.

Jain's Fairness Index is calculated on **solar coverage percentage** for
apartments with positive demand:

    J(x) = (sum(x_i) ** 2) / (n * sum(x_i ** 2))

Coverage is scale-free, so it answers the fairness question that matters to a
resident ("what share of my consumption was covered by solar?") rather than the
question "who received the most kWh?", which naturally favours large households.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

EPSILON = 1e-9


@dataclass(frozen=True)
class ApartmentBenefit:
    apartment_id: int
    flat_number: str
    consumption_kwh: float
    allocation_kwh: float
    grid_import_kwh: float
    estimated_credit: float
    ownership_percentage: float = 0.0


def safe_percentage(numerator: float, denominator: float) -> float:
    """Return a 0-100 percentage without dividing by zero."""

    numerator_value = float(numerator)
    denominator_value = float(denominator)
    if denominator_value <= EPSILON or numerator_value <= 0:
        return 0.0
    return round(min(100.0, (numerator_value / denominator_value) * 100.0), 4)


def jain_index(values: Iterable[float]) -> float | None:
    """Calculate Jain's index for a non-empty set of non-negative values.

    Returns ``None`` when the index is mathematically undefined (no values or
    all values are zero), instead of inventing a perfect fairness score.
    """

    samples = [max(0.0, float(value)) for value in values]
    if not samples:
        return None
    total = sum(samples)
    sum_squares = sum(value * value for value in samples)
    if sum_squares <= EPSILON:
        return None
    return round((total * total) / (len(samples) * sum_squares), 6)


def population_variance(values: Iterable[float]) -> float:
    samples = [float(value) for value in values]
    if not samples:
        return 0.0
    mean = sum(samples) / len(samples)
    return sum((value - mean) ** 2 for value in samples) / len(samples)


def _distribution(coverage_values: list[float]) -> list[dict[str, Any]]:
    buckets = (
        ("No solar", 0.0, 0.0),
        ("Above 0-25%", 0.000001, 25.0),
        ("Above 25-50%", 25.000001, 50.0),
        ("Above 50-75%", 50.000001, 75.0),
        ("Above 75-100%", 75.000001, 99.999999),
        ("Fully covered", 100.0, 100.0),
    )
    result: list[dict[str, Any]] = []
    total = len(coverage_values) or 1
    for label, lower, upper in buckets:
        count = sum(1 for value in coverage_values if lower <= value <= upper)
        result.append(
            {
                "label": label,
                "lower_percentage": lower,
                "upper_percentage": upper,
                "count": count,
                "share_percentage": round((count / total) * 100.0, 2),
            }
        )
    return result


def _benefit_rows(benefits: list[ApartmentBenefit]) -> list[dict[str, Any]]:
    return [
        {
            "apartment_id": benefit.apartment_id,
            "flat_number": benefit.flat_number,
            "consumption_kwh": round(benefit.consumption_kwh, 4),
            "solar_allocation_kwh": round(benefit.allocation_kwh, 6),
            "grid_import_kwh": round(benefit.grid_import_kwh, 6),
            "solar_coverage_percentage": safe_percentage(
                benefit.allocation_kwh, benefit.consumption_kwh
            ),
            "estimated_solar_credit": round(benefit.estimated_credit, 2),
            "ownership_percentage": round(benefit.ownership_percentage, 3),
        }
        for benefit in benefits
    ]


FAIRNESS_CONCEPTS = [
    {
        "key": "equal_allocation",
        "title": "Equal allocation",
        "explanation": (
            "Every eligible apartment initially receives the same amount of "
            "energy. Demand caps then redirect unused energy to flats that "
            "still need it."
        ),
    },
    {
        "key": "equal_coverage",
        "title": "Equal solar coverage",
        "explanation": (
            "Fairness is measured as the percentage of each flat's consumption "
            "covered by solar. Two flats with different demand can receive "
            "different kWh while achieving the same coverage."
        ),
    },
    {
        "key": "contribution_benefit",
        "title": "Contribution-based benefit",
        "explanation": (
            "Ownership allocation distributes energy in proportion to recorded "
            "capital contributions, so financial benefit follows ownership "
            "rather than household size."
        ),
    },
]


def calculate_fairness(
    benefits: Iterable[ApartmentBenefit | Mapping[str, Any]],
    *,
    tariff_price_per_kwh: float = 0.0,
) -> dict[str, Any]:
    """Return the complete fairness report for one method.

    Only apartments with positive consumption contribute to the primary Jain
    index, averages and distribution.  Zero-demand flats are still counted in
    totals and receive a zero estimated credit.
    """

    rows: list[ApartmentBenefit] = []
    for item in benefits:
        if isinstance(item, ApartmentBenefit):
            rows.append(item)
        else:
            rows.append(
                ApartmentBenefit(
                    apartment_id=int(item["apartment_id"]),
                    flat_number=str(item.get("flat_number") or item["apartment_id"]),
                    consumption_kwh=float(item.get("consumption_kwh", 0.0)),
                    allocation_kwh=float(
                        item.get("allocation_kwh")
                        or item.get("solar_allocation_kwh")
                        or 0.0
                    ),
                    grid_import_kwh=float(item.get("grid_import_kwh", 0.0)),
                    estimated_credit=float(
                        item.get("estimated_credit")
                        or item.get("estimated_solar_credit")
                        or 0.0
                    ),
                    ownership_percentage=float(
                        item.get("ownership_percentage", 0.0)
                    ),
                )
            )

    positive = [row for row in rows if row.consumption_kwh > EPSILON]
    coverages = [
        safe_percentage(row.allocation_kwh, row.consumption_kwh) for row in positive
    ]
    allocations = [row.allocation_kwh for row in positive]
    credits = [row.estimated_credit for row in rows]

    total_consumption = sum(row.consumption_kwh for row in rows)
    total_allocation = sum(row.allocation_kwh for row in rows)
    total_grid = sum(row.grid_import_kwh for row in rows)
    total_credit = sum(credits)

    jain = jain_index(coverages)
    average_coverage = round(sum(coverages) / len(coverages), 4) if coverages else 0.0

    ordered = sorted(
        positive,
        key=lambda row: (
            safe_percentage(row.allocation_kwh, row.consumption_kwh),
            row.allocation_kwh,
        ),
    )
    lowest = _benefit_rows(ordered[:5])
    highest = _benefit_rows(list(reversed(ordered[-5:])))

    credit_ordered = sorted(rows, key=lambda row: row.estimated_credit)
    top_earners = _benefit_rows(list(reversed(credit_ordered[-5:])))
    zero_credit = [row.flat_number for row in rows if row.estimated_credit <= 0.005]

    reason: str | None = None
    if not positive:
        reason = "No apartment has positive demand in this period."
    elif jain is None:
        reason = "No solar energy was allocated to apartments with positive demand."

    return {
        "jain_index": jain,
        "jain_index_applicable": jain is not None,
        "jain_index_reason": reason,
        "metric": "solar_coverage_percentage",
        "metric_definition": (
            "Jain's index over solar coverage percentage for apartments with "
            "positive demand."
        ),
        "tariff_price_per_kwh": round(float(tariff_price_per_kwh), 4),
        "apartment_count": len(rows),
        "positive_demand_apartments": len(positive),
        "total_consumption_kwh": round(total_consumption, 4),
        "total_solar_allocation_kwh": round(total_allocation, 6),
        "total_grid_import_kwh": round(total_grid, 6),
        "overall_coverage_percentage": safe_percentage(
            total_allocation, total_consumption
        ),
        "average_coverage_percentage": average_coverage,
        "minimum_coverage_percentage": round(min(coverages), 4) if coverages else 0.0,
        "maximum_coverage_percentage": round(max(coverages), 4) if coverages else 0.0,
        "coverage_variance": round(population_variance(coverages), 4),
        "coverage_standard_deviation": round(
            population_variance(coverages) ** 0.5, 4
        ),
        "allocation_variance_kwh": round(population_variance(allocations), 6),
        "coverage_distribution": _distribution(coverages),
        "highest_benefited_apartments": highest,
        "lowest_benefited_apartments": lowest,
        "savings_distribution": {
            "total_estimated_credit": round(total_credit, 2),
            "average_credit": round(total_credit / len(rows), 2) if rows else 0.0,
            "minimum_credit": round(min(credits), 2) if credits else 0.0,
            "maximum_credit": round(max(credits), 2) if credits else 0.0,
            "credit_variance": round(population_variance(credits), 2),
            "top_earners": top_earners,
            "zero_credit_apartments": zero_credit,
        },
        "concepts": FAIRNESS_CONCEPTS,
        "interpretation": (
            "A higher Jain index means coverage percentages are more evenly "
            "distributed among apartments with demand. The index does not "
            "declare a universally fairest method: equal coverage, equal kWh and "
            "ownership-weighted benefit answer different fairness questions."
        ),
        "caveats": [
            "Coverage is calculated only for apartments with positive demand.",
            "Estimated credits use the stored electricity tariff and are not bills.",
            "Zero-demand apartments are reported separately and do not distort "
            "the coverage index.",
        ],
    }
