"""Unit tests for the pure SolarVault battery engine.

Every expected value is calculated by hand from the documented flow rule, so
the tests validate the physics independently of the database and API layer.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from app.services import energy_balance
from app.services.battery_engine import BatteryParameters, simulate_battery

BASE = datetime(2026, 10, 12, tzinfo=timezone.utc)


def build_frame(specs: list[tuple[float, float, float]]) -> pd.DataFrame:
    """Build a SolarTwin balance frame from (solar, common, apartment) tuples."""

    times = pd.date_range(start=BASE, periods=len(specs), freq="h")
    solar = pd.DataFrame(
        {
            "reading_time": times,
            "solar_kwh": [row[0] for row in specs],
        }
    )
    apartments = pd.DataFrame(
        {
            "reading_time": times,
            "apartment_kwh": [row[2] for row in specs],
        }
    )
    common = pd.DataFrame(
        {
            "reading_time": times,
            "common_kwh": [row[1] for row in specs],
        }
    )
    return energy_balance.build_balance_frame(solar, apartments, common)


def parameters(**overrides) -> BatteryParameters:
    values = {
        "capacity_kwh": 10.0,
        "max_charge_kw": 5.0,
        "max_discharge_kw": 5.0,
        "charge_efficiency": 1.0,
        "discharge_efficiency": 1.0,
        "initial_soc_pct": 50.0,
        "min_soc_pct": 10.0,
        "max_soc_pct": 100.0,
    }
    values.update(overrides)
    return BatteryParameters(**values)


def test_charges_from_surplus_and_carries_soc_forward():
    frame = build_frame([(10.0, 2.0, 3.0), (0.0, 2.0, 3.0)])
    result = simulate_battery(frame, parameters())

    first, second = result.rows
    assert first["charge_energy_kwh"] == pytest.approx(5.0)
    assert first["soc_percentage"] == pytest.approx(100.0)
    assert second["discharge_energy_kwh"] == pytest.approx(5.0)
    assert second["soc_percentage"] == pytest.approx(50.0)
    assert result.final_stored_kwh == pytest.approx(5.0)
    assert result.conservation_ok is True


def test_charge_efficiency_reduces_stored_energy():
    frame = build_frame([(10.0, 0.0, 0.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=100.0,
            max_charge_kw=10.0,
            charge_efficiency=0.8,
            initial_soc_pct=0.0,
            min_soc_pct=0.0,
        ),
    )
    row = result.rows[0]
    assert row["charge_energy_kwh"] == pytest.approx(10.0)
    assert row["stored_gain_kwh"] == pytest.approx(8.0)
    assert row["charge_loss_kwh"] == pytest.approx(2.0)
    assert row["soc_percentage"] == pytest.approx(8.0)
    assert result.total_losses_kwh == pytest.approx(2.0)


def test_discharge_efficiency_reduces_delivered_energy():
    frame = build_frame([(0.0, 0.0, 4.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=10.0,
            initial_soc_pct=100.0,
            min_soc_pct=0.0,
            discharge_efficiency=0.5,
        ),
    )
    row = result.rows[0]
    assert row["discharge_energy_kwh"] == pytest.approx(4.0)
    assert row["stored_used_kwh"] == pytest.approx(8.0)
    assert row["discharge_loss_kwh"] == pytest.approx(4.0)
    assert row["grid_import_kwh"] == pytest.approx(0.0)
    assert row["soc_percentage"] == pytest.approx(20.0)


def test_maximum_charge_power_is_respected():
    frame = build_frame([(100.0, 0.0, 0.0)])
    result = simulate_battery(
        frame,
        parameters(capacity_kwh=100.0, max_charge_kw=7.0, initial_soc_pct=0.0, min_soc_pct=0.0),
    )
    assert result.rows[0]["charge_energy_kwh"] == pytest.approx(7.0)
    assert result.remaining_surplus_kwh == pytest.approx(93.0)


def test_maximum_discharge_power_is_respected():
    frame = build_frame([(0.0, 0.0, 20.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=100.0,
            max_discharge_kw=6.0,
            initial_soc_pct=100.0,
            min_soc_pct=0.0,
        ),
    )
    row = result.rows[0]
    assert row["discharge_energy_kwh"] == pytest.approx(6.0)
    assert row["grid_import_kwh"] == pytest.approx(14.0)


def test_minimum_reserve_soc_is_protected():
    frame = build_frame([(0.0, 0.0, 8.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=10.0,
            initial_soc_pct=20.0,
            min_soc_pct=20.0,
            max_soc_pct=100.0,
        ),
    )
    row = result.rows[0]
    assert row["discharge_energy_kwh"] == pytest.approx(0.0)
    assert row["soc_percentage"] == pytest.approx(20.0)
    assert row["grid_import_kwh"] == pytest.approx(8.0)


def test_zero_capacity_reproduces_the_baseline():
    frame = build_frame([(10.0, 2.0, 3.0), (0.0, 2.0, 3.0)])
    result = simulate_battery(
        frame,
        parameters(capacity_kwh=0.0, initial_soc_pct=0.0, min_soc_pct=0.0),
    )
    assert all(row["charge_energy_kwh"] == 0 for row in result.rows)
    assert all(row["discharge_energy_kwh"] == 0 for row in result.rows)
    assert result.final_soc_pct == 0.0
    assert result.grid_import_kwh == pytest.approx(result.baseline_grid_import_kwh)
    assert result.remaining_surplus_kwh == pytest.approx(
        result.baseline_surplus_kwh
    )
    assert result.warnings


def test_full_battery_cannot_charge():
    frame = build_frame([(10.0, 0.0, 0.0)])
    result = simulate_battery(
        frame,
        parameters(capacity_kwh=10.0, initial_soc_pct=100.0),
    )
    row = result.rows[0]
    assert row["charge_energy_kwh"] == pytest.approx(0.0)
    assert row["soc_percentage"] == pytest.approx(100.0)
    assert row["surplus_kwh"] == pytest.approx(10.0)


def test_empty_battery_cannot_discharge():
    frame = build_frame([(0.0, 0.0, 5.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=10.0,
            initial_soc_pct=0.0,
            min_soc_pct=0.0,
        ),
    )
    row = result.rows[0]
    assert row["discharge_energy_kwh"] == pytest.approx(0.0)
    assert row["grid_import_kwh"] == pytest.approx(5.0)


def test_no_simultaneous_charge_and_discharge():
    frame = build_frame([(10.0, 0.0, 0.0)])
    frame.loc[0, "grid_import_kwh"] = 5.0
    result = simulate_battery(
        frame,
        parameters(capacity_kwh=10.0, initial_soc_pct=50.0),
    )
    row = result.rows[0]
    assert row["charge_energy_kwh"] > 0
    assert row["discharge_energy_kwh"] == 0
    assert not (
        row["charge_energy_kwh"] > 0 and row["discharge_energy_kwh"] > 0
    )


def test_hourly_soc_continuity():
    frame = build_frame(
        [
            (20.0, 0.0, 0.0),
            (0.0, 0.0, 5.0),
            (0.0, 0.0, 5.0),
            (10.0, 0.0, 0.0),
        ]
    )
    result = simulate_battery(frame, parameters(capacity_kwh=20.0))
    previous = result.initial_stored_kwh
    for row in result.rows:
        expected = previous + row["stored_gain_kwh"] - row["stored_used_kwh"]
        assert row["soc_kwh"] == pytest.approx(expected, abs=1e-6)
        previous = row["soc_kwh"]
    assert result.final_stored_kwh == pytest.approx(previous)


def test_energy_conservation_and_no_double_counting():
    frame = build_frame(
        [
            (60.0, 4.0, 30.0),  # surplus
            (10.0, 4.0, 20.0),  # solar shortage
            (0.0, 4.0, 20.0),   # no solar
            (80.0, 4.0, 10.0),  # surplus
        ]
    )
    result = simulate_battery(
        frame,
        parameters(capacity_kwh=25.0, initial_soc_pct=20.0),
    )
    for row in result.rows:
        solar_identity = (
            row["solar_generation_kwh"]
            - row["direct_solar_kwh"]
            - row["charge_energy_kwh"]
            - row["surplus_kwh"]
        )
        demand_identity = (
            row["total_demand_kwh"]
            - row["direct_solar_kwh"]
            - row["discharge_energy_kwh"]
            - row["grid_import_kwh"]
        )
        assert solar_identity == pytest.approx(0.0, abs=1e-6)
        assert demand_identity == pytest.approx(0.0, abs=1e-6)
        assert row["direct_solar_kwh"] == pytest.approx(
            row["direct_common_solar_kwh"] + row["direct_apartment_solar_kwh"]
        )
    assert result.conservation_ok is True
    assert result.max_conservation_error_kwh <= 1e-6


def test_grid_import_reduction_and_savings_inputs():
    frame = build_frame([(20.0, 0.0, 0.0), (0.0, 0.0, 10.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=10.0,
            max_charge_kw=10.0,
            max_discharge_kw=10.0,
            initial_soc_pct=0.0,
            min_soc_pct=0.0,
        ),
    )
    assert result.baseline_grid_import_kwh == pytest.approx(10.0)
    assert result.grid_import_kwh == pytest.approx(0.0)
    assert result.grid_reduction_kwh == pytest.approx(10.0)
    assert result.grid_reduction_pct == pytest.approx(100.0)


def test_surplus_capture_increases_solar_utilization():
    frame = build_frame([(20.0, 0.0, 10.0)])
    result = simulate_battery(
        frame,
        parameters(
            capacity_kwh=10.0,
            max_charge_kw=10.0,
            initial_soc_pct=0.0,
            min_soc_pct=0.0,
        ),
    )
    assert result.baseline_solar_utilization_pct == pytest.approx(50.0)
    assert result.solar_utilization_pct == pytest.approx(100.0)
    assert result.remaining_surplus_kwh == pytest.approx(0.0)


def test_empty_frame_is_handled():
    frame = energy_balance.empty_balance_frame()
    result = simulate_battery(frame, parameters(capacity_kwh=10.0))
    assert result.rows == []
    assert result.hour_count == 0
    assert result.final_stored_kwh == pytest.approx(result.initial_stored_kwh)
    assert result.conservation_ok is True


@pytest.mark.parametrize(
    "overrides",
    [
        {"charge_efficiency": 0.0},
        {"charge_efficiency": 1.2},
        {"discharge_efficiency": 0.0},
        {"min_soc_pct": 80.0, "max_soc_pct": 20.0},
        {"initial_soc_pct": 5.0, "min_soc_pct": 10.0},
        {"capacity_kwh": -1.0},
        {"max_charge_kw": -1.0},
    ],
)
def test_invalid_parameters_are_rejected(overrides):
    with pytest.raises(ValueError):
        parameters(**overrides)
