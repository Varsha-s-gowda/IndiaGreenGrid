"""Shared capped weighted-allocation engine.

All three fair-allocation methods use the same water-filling algorithm:

1. Offer energy to eligible apartments in proportion to their weights.
2. Cap every apartment at its own demand.
3. Redistribute the energy released by capped apartments using the *original*
   weights of the apartments that still have unmet demand.
4. Repeat until either all demand is met or the available energy is exhausted.

The function is pure Python and has no database or framework dependency, which
makes every allocation result easy to audit and unit-test.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import TypeVar

ApartmentKey = TypeVar("ApartmentKey")

ALLOCATION_PRECISION = 6
ALLOCATION_SCALE = 10**ALLOCATION_PRECISION
EPSILON = 1e-9


@dataclass(frozen=True)
class AllocationResult:
    """Immutable result of one capped weighted allocation."""

    allocations: dict[int, float]
    total_allocated: float
    surplus: float
    total_demand: float
    rounds: int
    eligible_apartment_ids: tuple[int, ...]

    def allocation_for(self, apartment_id: int) -> float:
        return self.allocations.get(apartment_id, 0.0)


def _as_mapping(values: Mapping[int, float] | Sequence[float]) -> dict[int, float]:
    if isinstance(values, Mapping):
        return {int(key): float(value) for key, value in values.items()}
    return {index: float(value) for index, value in enumerate(values)}


def _floor_to_precision(value: float) -> float:
    """Floor to six decimals so rounding can never exceed the input energy."""

    if value <= 0:
        return 0.0
    return math.floor((value + EPSILON) * ALLOCATION_SCALE) / ALLOCATION_SCALE


def weighted_capped_allocation(
    available_energy: float,
    apartment_demands: Mapping[int, float] | Sequence[float],
    allocation_weights: Mapping[int, float] | Sequence[float],
) -> AllocationResult:
    """Distribute ``available_energy`` fairly under per-apartment demand caps.

    Parameters
    ----------
    available_energy:
        Solar energy offered to apartments after common-area consumption.
        Must be finite and non-negative.
    apartment_demands:
        Mapping (or aligned sequence) of apartment key to hourly consumption.
        Negative demands are rejected.
    allocation_weights:
        Mapping (or aligned sequence) of apartment key to a non-negative
        allocation weight.  Equal-share passes ``1`` for every eligible flat,
        consumption-based passes consumption, ownership-based passes the
        ownership percentage.  Missing keys and negative weights are rejected.

    Guarantees
    ----------
    * ``0 <= allocation[i] <= demand[i]`` for every apartment.
    * ``sum(allocation) <= available_energy``.
    * ``surplus = available_energy - sum(allocation) >= 0``.
    * Zero-weight or zero-demand apartments receive exactly zero.
    """

    available = float(available_energy)
    if not math.isfinite(available):
        raise ValueError("Available energy must be a finite number.")
    if available < 0:
        raise ValueError("Available energy must not be negative.")

    demands = _as_mapping(apartment_demands)
    weights = _as_mapping(allocation_weights)

    for apartment_id, demand in demands.items():
        if not math.isfinite(demand):
            raise ValueError(f"Demand for apartment {apartment_id} must be finite.")
        if demand < 0:
            raise ValueError(
                f"Demand for apartment {apartment_id} must not be negative."
            )

    for apartment_id in demands:
        if apartment_id not in weights:
            raise ValueError(
                f"Missing allocation weight for apartment {apartment_id}."
            )

    for apartment_id, weight in weights.items():
        if not math.isfinite(weight):
            raise ValueError(
                f"Allocation weight for apartment {apartment_id} must be finite."
            )
        if weight < 0:
            raise ValueError(
                f"Allocation weight for apartment {apartment_id} must not be "
                "negative."
            )

    allocations: dict[int, float] = {apartment_id: 0.0 for apartment_id in demands}
    total_demand = sum(demands.values())
    remaining = available
    rounds = 0

    active = {
        apartment_id: {
            "demand": demand,
            "weight": weights[apartment_id],
        }
        for apartment_id, demand in demands.items()
        if demand > EPSILON and weights[apartment_id] > EPSILON
    }
    eligible_ids = tuple(sorted(active))

    while remaining > EPSILON and active:
        total_weight = sum(item["weight"] for item in active.values())
        if total_weight <= EPSILON:
            break

        capped: list[int] = []
        for apartment_id, item in active.items():
            headroom = item["demand"] - allocations[apartment_id]
            proposed = remaining * item["weight"] / total_weight
            if proposed >= headroom - EPSILON:
                capped.append(apartment_id)

        rounds += 1
        if not capped:
            for apartment_id, item in active.items():
                allocations[apartment_id] += (
                    remaining * item["weight"] / total_weight
                )
            remaining = 0.0
            break

        for apartment_id in capped:
            headroom = max(
                0.0, active[apartment_id]["demand"] - allocations[apartment_id]
            )
            allocations[apartment_id] += headroom
            remaining -= headroom
            active.pop(apartment_id, None)

        if rounds > len(demands) + 1:
            raise RuntimeError("Allocation did not converge.")

        if remaining < 0:
            remaining = 0.0

    raw_allocations = {
        apartment_id: min(
            allocations.get(apartment_id, 0.0), demands[apartment_id]
        )
        for apartment_id in demands
    }
    rounded = {
        apartment_id: _floor_to_precision(value)
        for apartment_id, value in raw_allocations.items()
    }
    total_allocated = round(sum(rounded.values()), ALLOCATION_PRECISION)

    residual_units = int(
        math.floor((available - total_allocated) * ALLOCATION_SCALE + EPSILON)
    )
    if residual_units > 0:
        candidates = sorted(
            (
                (
                    raw_allocations[apartment_id] * ALLOCATION_SCALE
                    - rounded[apartment_id] * ALLOCATION_SCALE,
                    apartment_id,
                )
                for apartment_id in demands
                if demands[apartment_id] - rounded[apartment_id] > EPSILON
            ),
            key=lambda item: (-item[0], item[1]),
        )
        index = 0
        while residual_units > 0 and candidates:
            _, apartment_id = candidates[index]
            headroom = demands[apartment_id] - rounded[apartment_id]
            if headroom <= EPSILON:
                candidates.pop(index)
                if index >= len(candidates):
                    index = 0
                continue
            rounded[apartment_id] = round(
                rounded[apartment_id] + 1.0 / ALLOCATION_SCALE,
                ALLOCATION_PRECISION,
            )
            residual_units -= 1
            if demands[apartment_id] - rounded[apartment_id] <= EPSILON:
                candidates.pop(index)
                if index >= len(candidates):
                    index = 0
            else:
                index = (index + 1) % len(candidates)

    total_allocated = round(sum(rounded.values()), ALLOCATION_PRECISION)

    if total_allocated > available + EPSILON:
        overflow = total_allocated - available
        for apartment_id in sorted(
            rounded, key=lambda key: rounded[key], reverse=True
        ):
            reduction = min(overflow, rounded[apartment_id])
            rounded[apartment_id] -= reduction
            overflow -= reduction
            if overflow <= EPSILON:
                break
        total_allocated = round(sum(rounded.values()), ALLOCATION_PRECISION)

    surplus = round(max(0.0, available - total_allocated), ALLOCATION_PRECISION)

    return AllocationResult(
        allocations=rounded,
        total_allocated=total_allocated,
        surplus=surplus,
        total_demand=round(total_demand, ALLOCATION_PRECISION),
        rounds=rounds,
        eligible_apartment_ids=eligible_ids,
    )


def normalised_weights(
    apartment_weights: Mapping[int, float] | Sequence[float],
) -> dict[int, float]:
    """Return weights normalised to a fraction of the eligible total."""

    weights = _as_mapping(apartment_weights)
    total = sum(weight for weight in weights.values() if weight > 0)
    if total <= EPSILON:
        return {apartment_id: 0.0 for apartment_id in weights}
    return {
        apartment_id: (weight / total if weight > 0 else 0.0)
        for apartment_id, weight in weights.items()
    }
