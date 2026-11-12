"""Unit tests for the pure RoofMax calculation engine.

The reference example is deliberately simple so every expected number can be
checked by hand:

* 100 m2 roof, 2.0 m x 1.0 m panels of 500 Wp -> 50 panels, 25 kWp maximum.
* 5.0 kWh/m2/day irradiation, 80% performance ratio, 0% system loss
  -> 4.0 kWh per kWp per average day.
* 40 kWh average daily demand -> 10 kWp required.
* 7.50/kWh tariff, 50,000/kWp installation, 1,000/kWp/year maintenance.
"""

from __future__ import annotations

import pytest

from app.services import solar_optimization as engine


def reference_assumptions(**overrides) -> engine.PlanningAssumptions:
    values = dict(
        usable_roof_area_m2=100.0,
        panel_length_m=2.0,
        panel_width_m=1.0,
        panel_capacity_wp=500.0,
        panel_efficiency_pct=20.0,
        performance_ratio_pct=80.0,
        system_loss_pct=0.0,
        solar_irradiation_kwh_m2_day=5.0,
        installation_cost_per_kwp=50_000.0,
        maintenance_cost_per_kwp_year=1_000.0,
        tariff_price_per_kwh=7.50,
        tariff_escalation_pct=0.0,
        maintenance_escalation_pct=0.0,
        short_horizon_years=10,
        long_horizon_years=20,
        conservative_yield_variation_pct=12.0,
        conservative_tariff_variation_pct=10.0,
        conservative_cost_variation_pct=10.0,
        optimistic_yield_variation_pct=12.0,
        optimistic_tariff_variation_pct=10.0,
        optimistic_cost_variation_pct=10.0,
    )
    values.update(overrides)
    return engine.PlanningAssumptions(**values)


def test_panel_geometry_and_roof_limit():
    assumptions = reference_assumptions()

    assert assumptions.panel_area_m2 == pytest.approx(2.0)
    assert assumptions.max_panels() == 50
    count, capacity = engine.max_installable_capacity(assumptions)
    assert count == 50
    assert capacity == pytest.approx(25.0)


def test_roof_area_constraint_uses_floor_of_panels():
    assumptions = reference_assumptions(usable_roof_area_m2=9.99)

    assert assumptions.max_panels() == 4
    assert assumptions.max_capacity_kwp() == pytest.approx(2.0)


def test_required_capacity_and_generation():
    assumptions = reference_assumptions()

    assert assumptions.specific_daily_yield_kwh_per_kwp == pytest.approx(4.0)
    assert engine.required_capacity_kwp(40.0, assumptions) == pytest.approx(10.0)
    assert engine.daily_generation_kwh(10.0, assumptions) == pytest.approx(40.0)
    assert engine.annual_generation_kwh(10.0, assumptions) == pytest.approx(
        14_600.0
    )


def test_capacity_financials_are_hand_calculable():
    assumptions = reference_assumptions()
    annual_demand = 40.0 * 365.0

    result = engine.evaluate_capacity(10.0, annual_demand, assumptions)

    assert result.is_feasible is True
    assert result.annual_generation_kwh == pytest.approx(14_600.0)
    assert result.self_consumed_kwh == pytest.approx(14_600.0)
    assert result.surplus_kwh == pytest.approx(0.0)
    assert result.grid_dependency_kwh == pytest.approx(0.0)
    assert result.demand_coverage_percentage == pytest.approx(100.0)
    assert result.installation_cost == pytest.approx(500_000.0)
    assert result.annual_savings == pytest.approx(109_500.0)
    assert result.annual_maintenance_cost == pytest.approx(10_000.0)
    assert result.net_annual_savings == pytest.approx(99_500.0)
    assert result.payback_period_years == pytest.approx(5.025126, rel=1e-6)
    assert result.ten_year_benefit == pytest.approx(995_000.0)
    assert result.twenty_year_benefit == pytest.approx(1_990_000.0)
    assert result.roi_percentage == pytest.approx(298.0)
    assert result.cost_per_kwp == pytest.approx(50_000.0)


def test_oversized_capacity_has_surplus_and_infeasible_flag():
    assumptions = reference_assumptions(usable_roof_area_m2=40.0)  # 10 kWp max
    annual_demand = 40.0 * 365.0

    result = engine.evaluate_capacity(20.0, annual_demand, assumptions)

    assert result.is_feasible is False
    assert "roof limit" in (result.constraint_note or "")
    assert result.annual_generation_kwh == pytest.approx(29_200.0)
    assert result.self_consumed_kwh == pytest.approx(14_600.0)
    assert result.surplus_kwh == pytest.approx(14_600.0)
    assert result.demand_coverage_percentage == pytest.approx(100.0)
    assert result.annual_savings == pytest.approx(109_500.0)


def test_payback_is_none_when_maintenance_exceeds_savings():
    assumptions = reference_assumptions(
        tariff_price_per_kwh=0.1,
        maintenance_cost_per_kwp_year=5_000.0,
    )

    result = engine.evaluate_capacity(10.0, 40.0 * 365.0, assumptions)

    assert result.net_annual_savings < 0
    assert result.payback_period_years is None
    assert result.roi_percentage < 0


def test_escalation_increases_long_term_benefit():
    base = reference_assumptions()
    escalating = reference_assumptions(
        tariff_escalation_pct=5.0, maintenance_escalation_pct=2.0
    )

    base_benefit = engine.horizon_benefit(
        109_500.0,
        10_000.0,
        years=20,
        tariff_escalation_pct=base.tariff_escalation_pct,
        maintenance_escalation_pct=base.maintenance_escalation_pct,
    )
    escalated_benefit = engine.horizon_benefit(
        109_500.0,
        10_000.0,
        years=20,
        tariff_escalation_pct=escalating.tariff_escalation_pct,
        maintenance_escalation_pct=escalating.maintenance_escalation_pct,
    )

    assert escalated_benefit > base_benefit


def test_scenario_factors_are_symmetric_and_explainable():
    assumptions = reference_assumptions()

    conservative = engine.scenario_factors("CONSERVATIVE", assumptions)
    standard = engine.scenario_factors("STANDARD", assumptions)
    optimistic = engine.scenario_factors("OPTIMISTIC", assumptions)

    assert conservative.yield_factor == pytest.approx(0.88)
    assert conservative.tariff_factor == pytest.approx(0.90)
    assert conservative.cost_factor == pytest.approx(1.10)
    assert standard.yield_factor == pytest.approx(1.0)
    assert optimistic.yield_factor == pytest.approx(1.12)
    assert optimistic.tariff_factor == pytest.approx(1.10)
    assert optimistic.cost_factor == pytest.approx(0.90)


def test_optimiser_never_recommends_beyond_roof_limit():
    assumptions = reference_assumptions(usable_roof_area_m2=10.0)  # 5 panels
    project = engine.optimize_project(assumptions, 40.0 * 365.0)

    assert project.max_panel_count == 5
    assert project.max_installable_capacity_kwp == pytest.approx(2.5)
    assert project.recommended_capacity_kwp <= 2.5 + 0.01
    assert any(
        "roof can host at most" in reason
        for reason in [project.recommendation_reason]
    )
    for rows in project.scenarios.values():
        assert all(
            row.capacity_kwp <= 2.5 + 0.01 for row in rows if row.is_feasible
        )


def test_standard_optimiser_selects_demand_sized_capacity():
    assumptions = reference_assumptions()
    project = engine.optimize_project(assumptions, 40.0 * 365.0)

    assert project.required_capacity_kwp == pytest.approx(10.0)
    assert project.recommended_capacity_kwp == pytest.approx(10.0)
    assert project.recommended.annual_generation_kwh == pytest.approx(14_600.0)
    assert project.recommended.demand_coverage_percentage == pytest.approx(100.0)


def test_all_three_scenarios_share_candidates_but_change_results():
    assumptions = reference_assumptions()
    project = engine.optimize_project(assumptions, 40.0 * 365.0)

    standard = {
        round(row.capacity_kwp, 3): row
        for row in project.scenarios["STANDARD"]
    }
    conservative = {
        round(row.capacity_kwp, 3): row
        for row in project.scenarios["CONSERVATIVE"]
    }
    optimistic = {
        round(row.capacity_kwp, 3): row
        for row in project.scenarios["OPTIMISTIC"]
    }

    assert set(standard) == set(conservative) == set(optimistic)
    key = round(project.recommended_capacity_kwp, 3)
    assert conservative[key].annual_generation_kwh < standard[key].annual_generation_kwh
    assert optimistic[key].annual_generation_kwh > standard[key].annual_generation_kwh
    assert conservative[key].installation_cost > standard[key].installation_cost
    assert optimistic[key].installation_cost < standard[key].installation_cost
    assert conservative[key].roi_percentage < optimistic[key].roi_percentage


def test_zero_demand_is_handled_without_division_error():
    assumptions = reference_assumptions()
    project = engine.optimize_project(assumptions, 0.0)

    assert project.required_capacity_kwp == pytest.approx(0.0)
    assert project.recommended.demand_coverage_percentage == pytest.approx(0.0)
    assert project.recommended.surplus_kwh == pytest.approx(0.0)
    assert project.recommended.grid_dependency_kwh == pytest.approx(0.0)


def test_growth_series_matches_cumulative_benefit():
    series = engine.growth_series(
        100_000.0,
        10_000.0,
        3,
        tariff_escalation_pct=0.0,
        maintenance_escalation_pct=0.0,
    )

    assert [row["year"] for row in series] == [1, 2, 3]
    assert series[0]["cumulative_net_benefit"] == pytest.approx(90_000.0)
    assert series[2]["cumulative_net_benefit"] == pytest.approx(270_000.0)
