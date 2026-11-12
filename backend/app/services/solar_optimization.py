"""RoofMax solar-capacity and financial optimisation engine.

This module is deliberately free of database and HTTP concerns.  Every number
shown by the RoofMax API and dashboard is produced here from the stored demand
summary and the administrator's :class:`PlanningAssumptions`.

Calculation model
-----------------
Panel geometry::

    panel_area_m2        = panel_length_m * panel_width_m
    max_panel_count      = floor(usable_roof_area_m2 / panel_area_m2)
    max_installable_kwp  = max_panel_count * panel_capacity_wp / 1000

Specific yield (kWh per kWp per average day)::

    specific_yield = irradiation_kwh_m2_day
                     * performance_ratio_pct / 100
                     * (1 - system_loss_pct / 100)

Required capacity to cover average daily demand::

    required_kwp = average_daily_demand_kwh / specific_yield

Generation for a candidate capacity::

    daily_generation   = capacity_kwp * specific_yield * yield_factor
    annual_generation  = daily_generation * 365

Energy balance is annual and uses the same no-export rule as SolarTwin: solar
first serves building demand, any remainder is surplus.  Surplus is assumed to
earn no credit, which is intentionally conservative for Indian society
installations without a net-metering/export agreement.

Financial model::

    installation_cost   = capacity_kwp * installation_cost_per_kwp * cost_factor
    annual_savings      = self_consumed_kwh * tariff * tariff_factor
    annual_maintenance  = capacity_kwp * maintenance_cost_per_kwp_year
    net_annual_savings  = annual_savings - annual_maintenance
    payback_years       = installation_cost / net_annual_savings   (if > 0)
    horizon_benefit(N)  = sum over y=1..N of
                          savings*(1+tariff_escalation)^(y-1)
                          - maintenance*(1+maintenance_escalation)^(y-1)
    roi_pct             = (horizon_benefit - installation_cost)
                          / installation_cost * 100

All results are estimates under stated assumptions, not guaranteed savings.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

STANDARD_CAPACITY_OPTIONS_KWP: tuple[float, ...] = (10.0, 20.0, 30.0, 40.0, 50.0)

FEASIBILITY_TOLERANCE_KWP = 0.01
OPTIMISER_TOLERANCE = 0.01

ASSUMPTION_NOTES: tuple[str, ...] = (
    "Generation is estimated from a single location-based irradiation value and "
    "is not a weather simulation or a guaranteed yield.",
    "Annual generation is distributed uniformly; seasonal and weather variation "
    "is not modelled in the capacity estimate.",
    "Solar is assumed to serve building demand first. Surplus generation is not "
    "credited with an export tariff, so only self-consumed energy creates savings.",
    "Financial returns use the configured tariff, escalation and maintenance "
    "assumptions. Actual tariffs, prices, incentives and degradation may differ.",
    "Panel degradation, inverter replacement, taxes, subsidies and financing "
    "costs are not included unless explicitly configured.",
)


def _round(value: float, digits: int) -> float:
    return round(float(value), digits)


def _safe_div(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


@dataclass(frozen=True)
class PlanningAssumptions:
    """Administrator-controlled inputs for one optimisation run."""

    usable_roof_area_m2: float
    panel_length_m: float
    panel_width_m: float
    panel_capacity_wp: float
    panel_efficiency_pct: float
    performance_ratio_pct: float
    system_loss_pct: float
    solar_irradiation_kwh_m2_day: float
    installation_cost_per_kwp: float
    maintenance_cost_per_kwp_year: float
    tariff_price_per_kwh: float
    tariff_escalation_pct: float = 0.0
    maintenance_escalation_pct: float = 0.0
    short_horizon_years: int = 10
    long_horizon_years: int = 20
    conservative_yield_variation_pct: float = 0.0
    conservative_tariff_variation_pct: float = 0.0
    conservative_cost_variation_pct: float = 0.0
    optimistic_yield_variation_pct: float = 0.0
    optimistic_tariff_variation_pct: float = 0.0
    optimistic_cost_variation_pct: float = 0.0

    @property
    def panel_area_m2(self) -> float:
        return self.panel_length_m * self.panel_width_m

    @property
    def panel_capacity_kwp(self) -> float:
        return self.panel_capacity_wp / 1000.0

    @property
    def specific_daily_yield_kwh_per_kwp(self) -> float:
        return (
            self.solar_irradiation_kwh_m2_day
            * (self.performance_ratio_pct / 100.0)
            * (1.0 - self.system_loss_pct / 100.0)
        )

    def max_panels(self) -> int:
        if self.panel_area_m2 <= 0:
            return 0
        return max(0, int(math.floor(self.usable_roof_area_m2 / self.panel_area_m2)))

    def max_capacity_kwp(self) -> float:
        return self.max_panels() * self.panel_capacity_kwp

    def as_dict(self) -> dict[str, Any]:
        return {
            "usable_roof_area_m2": _round(self.usable_roof_area_m2, 2),
            "panel_length_m": _round(self.panel_length_m, 3),
            "panel_width_m": _round(self.panel_width_m, 3),
            "panel_area_m2": _round(self.panel_area_m2, 3),
            "panel_capacity_wp": _round(self.panel_capacity_wp, 2),
            "panel_capacity_kwp": _round(self.panel_capacity_kwp, 3),
            "panel_efficiency_pct": _round(self.panel_efficiency_pct, 3),
            "performance_ratio_pct": _round(self.performance_ratio_pct, 3),
            "system_loss_pct": _round(self.system_loss_pct, 3),
            "solar_irradiation_kwh_m2_day": _round(
                self.solar_irradiation_kwh_m2_day, 3
            ),
            "specific_daily_yield_kwh_per_kwp": _round(
                self.specific_daily_yield_kwh_per_kwp, 4
            ),
            "installation_cost_per_kwp": _round(self.installation_cost_per_kwp, 2),
            "maintenance_cost_per_kwp_year": _round(
                self.maintenance_cost_per_kwp_year, 2
            ),
            "tariff_price_per_kwh": _round(self.tariff_price_per_kwh, 4),
            "tariff_escalation_pct": _round(self.tariff_escalation_pct, 3),
            "maintenance_escalation_pct": _round(
                self.maintenance_escalation_pct, 3
            ),
            "short_horizon_years": self.short_horizon_years,
            "long_horizon_years": self.long_horizon_years,
            "conservative_yield_variation_pct": _round(
                self.conservative_yield_variation_pct, 3
            ),
            "conservative_tariff_variation_pct": _round(
                self.conservative_tariff_variation_pct, 3
            ),
            "conservative_cost_variation_pct": _round(
                self.conservative_cost_variation_pct, 3
            ),
            "optimistic_yield_variation_pct": _round(
                self.optimistic_yield_variation_pct, 3
            ),
            "optimistic_tariff_variation_pct": _round(
                self.optimistic_tariff_variation_pct, 3
            ),
            "optimistic_cost_variation_pct": _round(
                self.optimistic_cost_variation_pct, 3
            ),
        }


@dataclass(frozen=True)
class ScenarioFactors:
    scenario_type: str
    yield_factor: float = 1.0
    tariff_factor: float = 1.0
    cost_factor: float = 1.0

    def as_dict(self) -> dict[str, float]:
        return {
            "yield_factor": _round(self.yield_factor, 4),
            "tariff_factor": _round(self.tariff_factor, 4),
            "cost_factor": _round(self.cost_factor, 4),
        }


@dataclass(frozen=True)
class CapacityEvaluation:
    capacity_kwp: float
    panel_count: int
    option_label: str
    is_feasible: bool
    constraint_note: str | None
    daily_generation_kwh: float
    monthly_generation_kwh: float
    annual_generation_kwh: float
    self_consumed_kwh: float
    demand_coverage_percentage: float
    surplus_kwh: float
    grid_dependency_kwh: float
    grid_dependency_percentage: float
    installation_cost: float
    annual_savings: float
    annual_maintenance_cost: float
    net_annual_savings: float
    payback_period_years: float | None
    ten_year_benefit: float
    twenty_year_benefit: float
    roi_percentage: float
    cost_per_kwp: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "capacity_kwp": _round(self.capacity_kwp, 3),
            "panel_count": self.panel_count,
            "option_label": self.option_label,
            "is_feasible": self.is_feasible,
            "constraint_note": self.constraint_note,
            "daily_generation_kwh": _round(self.daily_generation_kwh, 4),
            "monthly_generation_kwh": _round(self.monthly_generation_kwh, 4),
            "annual_generation_kwh": _round(self.annual_generation_kwh, 4),
            "self_consumed_kwh": _round(self.self_consumed_kwh, 4),
            "demand_coverage_percentage": _round(
                self.demand_coverage_percentage, 3
            ),
            "surplus_kwh": _round(self.surplus_kwh, 4),
            "grid_dependency_kwh": _round(self.grid_dependency_kwh, 4),
            "grid_dependency_percentage": _round(
                self.grid_dependency_percentage, 3
            ),
            "installation_cost": _round(self.installation_cost, 2),
            "annual_savings": _round(self.annual_savings, 2),
            "annual_maintenance_cost": _round(
                self.annual_maintenance_cost, 2
            ),
            "net_annual_savings": _round(self.net_annual_savings, 2),
            "payback_period_years": (
                _round(self.payback_period_years, 3)
                if self.payback_period_years is not None
                else None
            ),
            "ten_year_benefit": _round(self.ten_year_benefit, 2),
            "twenty_year_benefit": _round(self.twenty_year_benefit, 2),
            "roi_percentage": _round(self.roi_percentage, 3),
            "cost_per_kwp": _round(self.cost_per_kwp, 2),
        }


@dataclass(frozen=True)
class ProjectEvaluation:
    required_capacity_kwp: float
    max_installable_capacity_kwp: float
    max_panel_count: int
    recommended_capacity_kwp: float
    recommended_panel_count: int
    recommended: CapacityEvaluation
    recommendation_reason: str
    scenario_factors: dict[str, dict[str, float]]
    scenarios: dict[str, list[CapacityEvaluation]] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "required_capacity_kwp": _round(self.required_capacity_kwp, 3),
            "max_installable_capacity_kwp": _round(
                self.max_installable_capacity_kwp, 3
            ),
            "max_panel_count": self.max_panel_count,
            "recommended_capacity_kwp": _round(
                self.recommended_capacity_kwp, 3
            ),
            "recommended_panel_count": self.recommended_panel_count,
            "recommended": self.recommended.as_dict(),
            "recommendation_reason": self.recommendation_reason,
            "scenario_factors": self.scenario_factors,
            "scenarios": {
                scenario_type: [row.as_dict() for row in rows]
                for scenario_type, rows in self.scenarios.items()
            },
        }


def panel_area_m2(assumptions: PlanningAssumptions) -> float:
    return assumptions.panel_area_m2


def max_installable_capacity(
    assumptions: PlanningAssumptions,
) -> tuple[int, float]:
    """Return the maximum panel count and kWp that fit on the usable roof."""

    count = assumptions.max_panels()
    return count, count * assumptions.panel_capacity_kwp


def required_capacity_kwp(
    average_daily_demand_kwh: float,
    assumptions: PlanningAssumptions,
) -> float:
    """Capacity needed to cover average daily demand from average daily yield."""

    if average_daily_demand_kwh <= 0:
        return 0.0
    yield_per_kwp = assumptions.specific_daily_yield_kwh_per_kwp
    return _safe_div(average_daily_demand_kwh, yield_per_kwp)


def daily_generation_kwh(
    capacity_kwp: float,
    assumptions: PlanningAssumptions,
    *,
    yield_factor: float = 1.0,
) -> float:
    return (
        capacity_kwp
        * assumptions.specific_daily_yield_kwh_per_kwp
        * yield_factor
    )


def annual_generation_kwh(
    capacity_kwp: float,
    assumptions: PlanningAssumptions,
    *,
    yield_factor: float = 1.0,
) -> float:
    return daily_generation_kwh(
        capacity_kwp, assumptions, yield_factor=yield_factor
    ) * 365.0


def scenario_factors(
    scenario_type: str, assumptions: PlanningAssumptions
) -> ScenarioFactors:
    if scenario_type == "CONSERVATIVE":
        return ScenarioFactors(
            scenario_type=scenario_type,
            yield_factor=1.0 - assumptions.conservative_yield_variation_pct / 100.0,
            tariff_factor=1.0
            - assumptions.conservative_tariff_variation_pct / 100.0,
            cost_factor=1.0 + assumptions.conservative_cost_variation_pct / 100.0,
        )
    if scenario_type == "OPTIMISTIC":
        return ScenarioFactors(
            scenario_type=scenario_type,
            yield_factor=1.0 + assumptions.optimistic_yield_variation_pct / 100.0,
            tariff_factor=1.0
            + assumptions.optimistic_tariff_variation_pct / 100.0,
            cost_factor=1.0 - assumptions.optimistic_cost_variation_pct / 100.0,
        )
    return ScenarioFactors(scenario_type="STANDARD")


def horizon_benefit(
    annual_savings: float,
    annual_maintenance_cost: float,
    *,
    years: int,
    tariff_escalation_pct: float,
    maintenance_escalation_pct: float,
) -> float:
    """Cumulative net savings over ``years`` with annual escalation."""

    if years <= 0:
        return 0.0
    tariff_rate = tariff_escalation_pct / 100.0
    maintenance_rate = maintenance_escalation_pct / 100.0
    total = 0.0
    for year in range(years):
        total += annual_savings * ((1.0 + tariff_rate) ** year)
        total -= annual_maintenance_cost * ((1.0 + maintenance_rate) ** year)
    return total


def evaluate_capacity(
    capacity_kwp: float,
    annual_demand_kwh: float,
    assumptions: PlanningAssumptions,
    *,
    factors: ScenarioFactors | None = None,
    max_capacity_kwp: float | None = None,
    panel_count: int | None = None,
    option_label: str | None = None,
) -> CapacityEvaluation:
    """Evaluate one capacity option under one assumption scenario."""

    factors = factors or ScenarioFactors(scenario_type="STANDARD")
    if max_capacity_kwp is None:
        max_capacity_kwp = assumptions.max_capacity_kwp()
    if panel_count is None:
        panel_count = int(
            math.ceil(capacity_kwp / assumptions.panel_capacity_kwp)
        ) if assumptions.panel_capacity_kwp > 0 else 0

    feasible = capacity_kwp <= max_capacity_kwp + FEASIBILITY_TOLERANCE_KWP
    constraint_note: str | None = None
    if not feasible:
        excess = capacity_kwp - max_capacity_kwp
        constraint_note = (
            f"Exceeds the roof limit of {max_capacity_kwp:.1f} kWp "
            f"by {excess:.1f} kWp; this option cannot be installed."
        )

    daily = daily_generation_kwh(
        capacity_kwp, assumptions, yield_factor=factors.yield_factor
    )
    monthly = daily * (365.0 / 12.0)
    annual = daily * 365.0

    self_consumed = min(annual, max(annual_demand_kwh, 0.0))
    surplus = max(0.0, annual - max(annual_demand_kwh, 0.0))
    grid_dependency = max(0.0, max(annual_demand_kwh, 0.0) - annual)

    tariff = assumptions.tariff_price_per_kwh * factors.tariff_factor
    annual_savings = self_consumed * tariff
    annual_maintenance = (
        capacity_kwp * assumptions.maintenance_cost_per_kwp_year
    )
    net_annual_savings = annual_savings - annual_maintenance
    installation = (
        capacity_kwp
        * assumptions.installation_cost_per_kwp
        * factors.cost_factor
    )
    payback = (
        installation / net_annual_savings
        if net_annual_savings > 0
        else None
    )
    short_benefit = horizon_benefit(
        annual_savings,
        annual_maintenance,
        years=assumptions.short_horizon_years,
        tariff_escalation_pct=assumptions.tariff_escalation_pct,
        maintenance_escalation_pct=assumptions.maintenance_escalation_pct,
    )
    long_benefit = horizon_benefit(
        annual_savings,
        annual_maintenance,
        years=assumptions.long_horizon_years,
        tariff_escalation_pct=assumptions.tariff_escalation_pct,
        maintenance_escalation_pct=assumptions.maintenance_escalation_pct,
    )
    roi = (
        (long_benefit - installation) / installation * 100.0
        if installation > 0
        else 0.0
    )

    if option_label is None:
        option_label = _capacity_label(capacity_kwp)

    return CapacityEvaluation(
        capacity_kwp=max(0.0, capacity_kwp),
        panel_count=panel_count,
        option_label=option_label,
        is_feasible=feasible,
        constraint_note=constraint_note,
        daily_generation_kwh=daily,
        monthly_generation_kwh=monthly,
        annual_generation_kwh=annual,
        self_consumed_kwh=self_consumed,
        demand_coverage_percentage=_safe_div(self_consumed, annual_demand_kwh) * 100.0,
        surplus_kwh=surplus,
        grid_dependency_kwh=grid_dependency,
        grid_dependency_percentage=_safe_div(grid_dependency, annual_demand_kwh) * 100.0,
        installation_cost=installation,
        annual_savings=annual_savings,
        annual_maintenance_cost=annual_maintenance,
        net_annual_savings=net_annual_savings,
        payback_period_years=payback,
        ten_year_benefit=short_benefit,
        twenty_year_benefit=long_benefit,
        roi_percentage=roi,
        cost_per_kwp=_safe_div(installation, capacity_kwp),
    )


def _capacity_label(capacity_kwp: float) -> str:
    if abs(capacity_kwp - round(capacity_kwp)) < 0.05:
        return f"{round(capacity_kwp):.0f} kWp"
    return f"{capacity_kwp:.1f} kWp"


def _panel_capacity_label(
    panel_count: int, capacity_kwp: float
) -> str:
    return f"Optimized {capacity_kwp:.1f} kWp ({panel_count} panels)"


def _optimise_standard_capacity(
    assumptions: PlanningAssumptions,
    annual_demand_kwh: float,
    max_panel_count: int,
) -> tuple[CapacityEvaluation, list[CapacityEvaluation]]:
    """Scan the discrete panel layout and pick the best long-term net gain.

    Surplus generation earns no credit, so the financial objective naturally
    stops near the annual demand instead of overbuilding the roof.  When no
    capacity produces positive net annual savings, the household still needs a
    plan: the algorithm then falls back to the capacity that covers the most
    demand within the roof limit.
    """

    if max_panel_count <= 0:
        empty = evaluate_capacity(
            0.0,
            annual_demand_kwh,
            assumptions,
            panel_count=0,
            option_label="No feasible capacity",
        )
        return empty, []

    candidates: list[CapacityEvaluation] = []
    for count in range(1, max_panel_count + 1):
        capacity = count * assumptions.panel_capacity_kwp
        evaluation = evaluate_capacity(
            capacity,
            annual_demand_kwh,
            assumptions,
            panel_count=count,
            option_label=_panel_capacity_label(count, capacity),
        )
        candidates.append(evaluation)

    def _score(row: CapacityEvaluation) -> tuple[float, float, float]:
        net_gain = row.twenty_year_benefit - row.installation_cost
        return (net_gain, row.self_consumed_kwh, -row.capacity_kwp)

    best = max(candidates, key=_score)
    if best.net_annual_savings <= 0:
        best = max(
            candidates,
            key=lambda row: (
                row.self_consumed_kwh,
                -row.surplus_kwh,
                -row.capacity_kwp,
            ),
        )
    return best, candidates


def build_recommendation_reason(
    recommended: CapacityEvaluation,
    required_kwp: float,
    max_capacity_kwp: float,
) -> str:
    coverage = recommended.demand_coverage_percentage
    parts: list[str] = []
    if max_capacity_kwp <= 0:
        return (
            "No panel fits inside the configured usable roof area. Increase the "
            "usable area or reduce the panel dimensions before planning a system."
        )

    if required_kwp > max_capacity_kwp + FEASIBILITY_TOLERANCE_KWP:
        parts.append(
            f"The roof can host at most {max_capacity_kwp:.1f} kWp, below the "
            f"{required_kwp:.1f} kWp needed to cover average demand. The "
            "recommendation uses the largest feasible capacity."
        )
    else:
        parts.append(
            f"{recommended.capacity_kwp:.1f} kWp is the best feasible capacity "
            f"under the current assumptions and covers about {coverage:.1f}% of "
            "annual building demand."
        )

    if recommended.surplus_kwh > 0:
        parts.append(
            f"Estimated surplus is {recommended.surplus_kwh:,.1f} kWh per year; "
            "without an export credit this surplus does not add savings."
        )
    else:
        parts.append(
            f"Estimated grid dependency remains "
            f"{recommended.grid_dependency_kwh:,.1f} kWh per year."
        )

    if recommended.net_annual_savings <= 0:
        parts.append(
            "Net annual savings are not positive under these assumptions. "
            "Review installation cost, tariff and maintenance before investing."
        )
    elif recommended.payback_period_years is not None:
        parts.append(
            f"Estimated simple payback is "
            f"{recommended.payback_period_years:.1f} years."
        )

    parts.append(
        "This is an engineering and financial estimate, not a guaranteed "
        "saving or exact real-world generation figure."
    )
    return " ".join(parts)


def optimize_project(
    assumptions: PlanningAssumptions,
    annual_demand_kwh: float,
    *,
    standard_options_kwp: Sequence[float] = STANDARD_CAPACITY_OPTIONS_KWP,
) -> ProjectEvaluation:
    """Build the recommendation and the conservative/standard/optimistic rows."""

    max_panel_count, max_capacity_kwp = max_installable_capacity(assumptions)
    average_daily_demand = annual_demand_kwh / 365.0 if annual_demand_kwh > 0 else 0.0
    required_kwp = required_capacity_kwp(average_daily_demand, assumptions)

    if annual_demand_kwh <= 0 or max_panel_count <= 0:
        best = evaluate_capacity(
            0.0,
            max(0.0, annual_demand_kwh),
            assumptions,
            panel_count=0,
            option_label="No feasible capacity",
        )
    else:
        best, _all_candidates = _optimise_standard_capacity(
            assumptions, annual_demand_kwh, max_panel_count
        )

    scenario_rows: dict[str, list[CapacityEvaluation]] = {}
    scenario_factor_payload: dict[str, dict[str, float]] = {}

    for scenario_type in ("CONSERVATIVE", "STANDARD", "OPTIMISTIC"):
        factors = scenario_factors(scenario_type, assumptions)
        scenario_factor_payload[scenario_type] = factors.as_dict()
        rows: dict[float, CapacityEvaluation] = {}

        for option in standard_options_kwp:
            capacity = float(option)
            if capacity <= 0:
                continue
            panel_count = int(
                math.ceil(capacity / assumptions.panel_capacity_kwp)
            ) if assumptions.panel_capacity_kwp > 0 else 0
            row = evaluate_capacity(
                capacity,
                annual_demand_kwh,
                assumptions,
                factors=factors,
                max_capacity_kwp=max_capacity_kwp,
                panel_count=panel_count,
                option_label=_capacity_label(capacity),
            )
            rows[round(capacity, 3)] = row

        optimised = evaluate_capacity(
            best.capacity_kwp,
            annual_demand_kwh,
            assumptions,
            factors=factors,
            max_capacity_kwp=max_capacity_kwp,
            panel_count=best.panel_count,
            option_label=_panel_capacity_label(best.panel_count, best.capacity_kwp),
        )
        key = round(best.capacity_kwp, 3)
        existing = rows.get(key)
        if existing is not None:
            rows[key] = CapacityEvaluation(
                **{
                    **existing.__dict__,
                    "option_label": _panel_capacity_label(
                        best.panel_count, best.capacity_kwp
                    ),
                }
            )
        else:
            rows[key] = optimised

        ordered = sorted(rows.values(), key=lambda row: row.capacity_kwp)
        scenario_rows[scenario_type] = ordered

    recommended = evaluate_capacity(
        best.capacity_kwp,
        annual_demand_kwh,
        assumptions,
        factors=scenario_factors("STANDARD", assumptions),
        max_capacity_kwp=max_capacity_kwp,
        panel_count=best.panel_count,
        option_label=_panel_capacity_label(best.panel_count, best.capacity_kwp),
    )

    return ProjectEvaluation(
        required_capacity_kwp=required_kwp,
        max_installable_capacity_kwp=max_capacity_kwp,
        max_panel_count=max_panel_count,
        recommended_capacity_kwp=recommended.capacity_kwp,
        recommended_panel_count=recommended.panel_count,
        recommended=recommended,
        recommendation_reason=build_recommendation_reason(
            recommended, required_kwp, max_capacity_kwp
        ),
        scenario_factors=scenario_factor_payload,
        scenarios=scenario_rows,
    )


def standard_options_including(extra_capacity_kwp: float) -> tuple[float, ...]:
    """Return the standard list plus a non-duplicate optimised capacity."""

    values: list[float] = list(STANDARD_CAPACITY_OPTIONS_KWP)
    if all(abs(extra_capacity_kwp - value) > 0.05 for value in values):
        values.append(extra_capacity_kwp)
    return tuple(values)


def growth_series(
    annual_savings: float,
    annual_maintenance_cost: float,
    years: int,
    *,
    tariff_escalation_pct: float,
    maintenance_escalation_pct: float,
) -> list[dict[str, float]]:
    """Cumulative net benefit by year, used by the dashboard chart.

    The API may expose this helper later; keeping it here makes the financial
    model reusable and testable without a database.
    """

    rows: list[dict[str, float]] = []
    cumulative = 0.0
    for year in range(1, years + 1):
        savings = annual_savings * (
            (1.0 + tariff_escalation_pct / 100.0) ** (year - 1)
        )
        maintenance = annual_maintenance_cost * (
            (1.0 + maintenance_escalation_pct / 100.0) ** (year - 1)
        )
        cumulative += savings - maintenance
        rows.append(
            {
                "year": year,
                "annual_savings": _round(savings, 2),
                "annual_maintenance": _round(maintenance, 2),
                "cumulative_net_benefit": _round(cumulative, 2),
            }
        )
    return rows


def scenario_summary(rows: Iterable[CapacityEvaluation]) -> dict[str, Any]:
    """Convenience aggregate used by tests and API summaries."""

    materialised = list(rows)
    feasible = [row for row in materialised if row.is_feasible]
    if not feasible:
        return {
            "option_count": len(materialised),
            "feasible_count": 0,
            "best_coverage_percentage": 0.0,
            "best_capacity_kwp": 0.0,
        }
    best_coverage = max(feasible, key=lambda row: row.demand_coverage_percentage)
    return {
        "option_count": len(materialised),
        "feasible_count": len(feasible),
        "best_coverage_percentage": _round(
            best_coverage.demand_coverage_percentage, 3
        ),
        "best_capacity_kwp": _round(best_coverage.capacity_kwp, 3),
    }
