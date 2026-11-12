"""Unit tests for the shared capped weighted-allocation engine."""

from __future__ import annotations

import pytest

from app.services.allocation_engine import (
    normalised_weights,
    weighted_capped_allocation,
)


def test_equal_weights_redistribute_capped_energy():
    result = weighted_capped_allocation(
        10.0,
        {1: 2.0, 2: 20.0, 3: 0.0},
        {1: 1.0, 2: 1.0, 3: 1.0},
    )

    assert result.allocations[1] == pytest.approx(2.0)
    assert result.allocations[2] == pytest.approx(8.0)
    assert result.allocations[3] == 0.0
    assert result.total_allocated == pytest.approx(10.0)
    assert result.surplus == pytest.approx(0.0)
    assert result.eligible_apartment_ids == (1, 2)


def test_weighted_allocation_follows_weights():
    result = weighted_capped_allocation(
        100.0,
        {1: 100.0, 2: 100.0, 3: 100.0},
        {1: 1.0, 2: 2.0, 3: 1.0},
    )

    assert result.allocations[1] == pytest.approx(25.0)
    assert result.allocations[2] == pytest.approx(50.0)
    assert result.allocations[3] == pytest.approx(25.0)
    assert result.total_allocated == pytest.approx(100.0)


def test_demand_caps_and_weighted_redistribution():
    result = weighted_capped_allocation(
        30.0,
        {1: 5.0, 2: 50.0, 3: 50.0},
        {1: 1.0, 2: 1.0, 3: 1.0},
    )

    assert result.allocations[1] == pytest.approx(5.0)
    assert result.allocations[2] == pytest.approx(12.5)
    assert result.allocations[3] == pytest.approx(12.5)
    assert result.total_allocated == pytest.approx(30.0)


def test_consumption_weights_scale_demand_uniformly():
    result = weighted_capped_allocation(
        20.0,
        {1: 3.0, 2: 30.0, 3: 30.0},
        {1: 3.0, 2: 30.0, 3: 30.0},
    )

    scale = 20.0 / 63.0
    assert result.allocations[1] == pytest.approx(3.0 * scale)
    assert result.allocations[2] == pytest.approx(30.0 * scale)
    assert result.allocations[3] == pytest.approx(30.0 * scale)
    assert result.total_allocated == pytest.approx(20.0)


def test_weighted_redistribution_after_cap():
    result = weighted_capped_allocation(
        10.0,
        {1: 1.0, 2: 10.0, 3: 10.0},
        {1: 10.0, 2: 5.0, 3: 5.0},
    )

    assert result.allocations[1] == pytest.approx(1.0)
    assert result.allocations[2] == pytest.approx(4.5)
    assert result.allocations[3] == pytest.approx(4.5)
    assert result.total_allocated == pytest.approx(10.0)
    assert result.eligible_apartment_ids == (1, 2, 3)


def test_excess_energy_becomes_surplus():
    result = weighted_capped_allocation(
        100.0,
        {1: 10.0, 2: 20.0},
        {1: 1.0, 2: 1.0},
    )

    assert result.allocations[1] == pytest.approx(10.0)
    assert result.allocations[2] == pytest.approx(20.0)
    assert result.total_allocated == pytest.approx(30.0)
    assert result.surplus == pytest.approx(70.0)


def test_zero_solar_and_zero_demand_are_safe():
    no_solar = weighted_capped_allocation(
        0.0, {1: 10.0, 2: 5.0}, {1: 1.0, 2: 1.0}
    )
    assert no_solar.total_allocated == 0.0
    assert no_solar.surplus == 0.0
    assert all(value == 0.0 for value in no_solar.allocations.values())

    no_demand = weighted_capped_allocation(
        10.0, {1: 0.0, 2: 0.0}, {1: 1.0, 2: 1.0}
    )
    assert no_demand.total_allocated == 0.0
    assert no_demand.surplus == pytest.approx(10.0)
    assert no_demand.eligible_apartment_ids == ()


def test_zero_weight_apartment_receives_nothing():
    result = weighted_capped_allocation(
        10.0,
        {1: 10.0, 2: 10.0},
        {1: 0.0, 2: 1.0},
    )

    assert result.allocations[1] == 0.0
    assert result.allocations[2] == pytest.approx(10.0)
    assert result.surplus == 0.0


def test_rounding_never_exceeds_available_energy():
    result = weighted_capped_allocation(
        1.0,
        {1: 1.0, 2: 1.0, 3: 1.0},
        {1: 1.0, 2: 1.0, 3: 1.0},
    )

    assert sum(result.allocations.values()) <= 1.0
    assert result.total_allocated <= 1.0
    assert result.surplus >= 0.0
    for allocation in result.allocations.values():
        assert allocation <= 1.0


def test_sequence_inputs_and_normalised_weights():
    result = weighted_capped_allocation(9.0, [10.0, 10.0], [1.0, 1.0])
    assert result.allocations[0] == pytest.approx(4.5)
    assert result.allocations[1] == pytest.approx(4.5)

    weights = normalised_weights({1: 1.0, 2: 2.0, 3: 1.0})
    assert weights[1] == pytest.approx(0.25)
    assert weights[2] == pytest.approx(0.5)
    assert weights[3] == pytest.approx(0.25)


@pytest.mark.parametrize(
    ("available", "demands", "weights", "message"),
    [
        (-1.0, {1: 1.0}, {1: 1.0}, "negative"),
        (float("nan"), {1: 1.0}, {1: 1.0}, "finite"),
        (1.0, {1: -1.0}, {1: 1.0}, "negative"),
        (1.0, {1: 1.0}, {1: -1.0}, "negative"),
        (1.0, {1: 1.0}, {}, "Missing allocation weight"),
    ],
)
def test_invalid_inputs_are_rejected(available, demands, weights, message):
    with pytest.raises(ValueError, match=message):
        weighted_capped_allocation(available, demands, weights)
