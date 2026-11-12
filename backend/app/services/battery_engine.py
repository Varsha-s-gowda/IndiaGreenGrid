"""Hourly battery-storage simulation engine for SolarVault.

The engine is a pure, deterministic calculation over the hourly energy-balance
frame produced by :mod:`app.services.energy_balance`.  It never reads the
database and never invents readings, which keeps it independently testable and
makes every reported number reproducible from stored SolarTwin data.

Flow rule for every hourly interval
-----------------------------------
1. Solar serves common-area demand first (baseline, unchanged).
2. The remaining solar is offered directly to apartments (baseline, unchanged).
3. Only the *genuine surplus left after direct allocation* may charge the
   battery.  Charging energy is therefore never allocated to apartments in the
   same interval.
4. When solar leaves demand unmet, the battery discharges into that unmet
   demand, respecting power and minimum-reserve limits.
5. Any demand still unmet is imported from the grid.

Battery model
-------------
* Stored energy is carried forward between intervals.
* ``charge_efficiency`` converts solar energy drawn into stored energy:
  ``stored_gain = charge_input * charge_efficiency``.
* ``discharge_efficiency`` converts stored energy into delivered energy:
  ``delivered = stored_used * discharge_efficiency``.
* Charging is limited by the configured maximum charge power, the available
  surplus and the remaining headroom below the maximum state of charge.
* Discharging is limited by the configured maximum discharge power, the unmet
  demand and the energy above the minimum reserve state of charge.
* A single interval can never charge and discharge at the same time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pandas as pd

CONSERVATION_TOLERANCE_KWH = 1e-6
DEFAULT_INTERVAL_HOURS = 1.0


@dataclass(frozen=True)
class BatteryParameters:
    """Validated, immutable battery operating parameters.

    Efficiencies and state-of-charge values are expressed as fractions
    (``0.95``) and percentages (``20.0``) respectively to match the database
    columns, where efficiencies are stored as percentages.
    """

    capacity_kwh: float
    max_charge_kw: float
    max_discharge_kw: float
    charge_efficiency: float
    discharge_efficiency: float
    initial_soc_pct: float
    min_soc_pct: float
    max_soc_pct: float
    interval_hours: float = DEFAULT_INTERVAL_HOURS

    def __post_init__(self) -> None:
        if self.capacity_kwh < 0:
            raise ValueError("Battery capacity cannot be negative.")
        if self.max_charge_kw < 0 or self.max_discharge_kw < 0:
            raise ValueError("Battery power limits cannot be negative.")
        if not 0 < self.charge_efficiency <= 1:
            raise ValueError("Charge efficiency must be in (0, 1].")
        if not 0 < self.discharge_efficiency <= 1:
            raise ValueError("Discharge efficiency must be in (0, 1].")
        if not 0 <= self.min_soc_pct <= 100:
            raise ValueError("Minimum SOC must be between 0 and 100 %.")
        if not 0 <= self.max_soc_pct <= 100:
            raise ValueError("Maximum SOC must be between 0 and 100 %.")
        if self.min_soc_pct > self.max_soc_pct:
            raise ValueError("Minimum SOC cannot exceed maximum SOC.")
        if not self.min_soc_pct <= self.initial_soc_pct <= self.max_soc_pct:
            raise ValueError(
                "Initial SOC must lie between the minimum and maximum SOC."
            )
        if self.interval_hours <= 0:
            raise ValueError("Interval length must be positive.")

    @property
    def usable_capacity_kwh(self) -> float:
        """Energy held between the minimum reserve and maximum SOC."""

        return max(
            0.0,
            self.capacity_kwh
            * (self.max_soc_pct - self.min_soc_pct)
            / 100.0,
        )


@dataclass
class BatterySimulationResult:
    """Aggregate outcome plus per-interval rows."""

    rows: list[dict[str, Any]]
    initial_stored_kwh: float
    final_stored_kwh: float
    initial_soc_pct: float
    final_soc_pct: float
    total_charged_kwh: float
    total_stored_gain_kwh: float
    total_discharged_kwh: float
    total_stored_used_kwh: float
    total_charge_loss_kwh: float
    total_discharge_loss_kwh: float
    total_losses_kwh: float
    total_solar_generation_kwh: float
    direct_solar_kwh: float
    baseline_grid_import_kwh: float
    baseline_surplus_kwh: float
    grid_import_kwh: float
    remaining_surplus_kwh: float
    hour_count: int
    conservation_ok: bool
    max_conservation_error_kwh: float
    warnings: list[str] = field(default_factory=list)

    @property
    def solar_utilization_pct(self) -> float:
        if self.total_solar_generation_kwh <= 0:
            return 0.0
        utilized = self.direct_solar_kwh + self.total_charged_kwh
        return _pct(utilized, self.total_solar_generation_kwh)

    @property
    def baseline_solar_utilization_pct(self) -> float:
        if self.total_solar_generation_kwh <= 0:
            return 0.0
        return _pct(self.direct_solar_kwh, self.total_solar_generation_kwh)

    @property
    def grid_reduction_kwh(self) -> float:
        return max(0.0, self.baseline_grid_import_kwh - self.grid_import_kwh)

    @property
    def grid_reduction_pct(self) -> float:
        if self.baseline_grid_import_kwh <= 0:
            return 0.0
        return _pct(self.grid_reduction_kwh, self.baseline_grid_import_kwh)


def _pct(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round(max(0.0, min(100.0, numerator / denominator * 100.0)), 4)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _round(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def simulate_battery(
    frame: pd.DataFrame,
    parameters: BatteryParameters,
) -> BatterySimulationResult:
    """Simulate battery dispatch over a SolarTwin hourly balance frame.

    The input frame must contain the columns emitted by
    :func:`app.services.energy_balance.build_balance_frame`.  An empty frame is
    valid and produces an empty result with the initial SOC carried into the
    final SOC.
    """

    initial_stored = parameters.capacity_kwh * parameters.initial_soc_pct / 100.0
    stored = _clamp(initial_stored, 0.0, parameters.capacity_kwh)
    min_energy = parameters.capacity_kwh * parameters.min_soc_pct / 100.0
    max_energy = parameters.capacity_kwh * parameters.max_soc_pct / 100.0

    rows: list[dict[str, Any]] = []
    total_charged = 0.0
    total_stored_gain = 0.0
    total_discharged = 0.0
    total_stored_used = 0.0
    total_charge_loss = 0.0
    total_discharge_loss = 0.0
    total_solar = 0.0
    direct_solar = 0.0
    baseline_grid = 0.0
    baseline_surplus = 0.0
    battery_grid = 0.0
    remaining_surplus_total = 0.0
    max_error = 0.0
    warnings: list[str] = []

    if parameters.capacity_kwh <= 0:
        warnings.append(
            "Battery capacity is zero, so the simulation reproduces the "
            "no-battery baseline without charging or discharging."
        )

    if not frame.empty:
        ordered = frame.sort_values("reading_time").reset_index(drop=True)
        for row in ordered.itertuples(index=False):
            solar = float(getattr(row, "solar_kwh", 0.0) or 0.0)
            apartment = float(getattr(row, "apartment_kwh", 0.0) or 0.0)
            common = float(getattr(row, "common_kwh", 0.0) or 0.0)
            common_solar = float(getattr(row, "common_solar_kwh", 0.0) or 0.0)
            apartment_solar = float(
                getattr(row, "apartment_solar_kwh", 0.0) or 0.0
            )
            surplus = float(getattr(row, "surplus_kwh", 0.0) or 0.0)
            unmet = float(getattr(row, "grid_import_kwh", 0.0) or 0.0)
            demand = apartment + common
            direct = common_solar + apartment_solar

            charge_input = 0.0
            stored_gain = 0.0
            discharge = 0.0
            stored_used = 0.0
            grid_import = unmet
            remaining_surplus = surplus

            if parameters.capacity_kwh > 0.0:
                if surplus > CONSERVATION_TOLERANCE_KWH:
                    headroom = max(0.0, max_energy - stored)
                    by_soc = headroom / parameters.charge_efficiency
                    by_power = parameters.max_charge_kw * parameters.interval_hours
                    charge_input = max(
                        0.0, min(surplus, by_power, by_soc)
                    )
                    stored_gain = charge_input * parameters.charge_efficiency
                    stored = _clamp(stored + stored_gain, 0.0, max_energy)
                    remaining_surplus = max(0.0, surplus - charge_input)
                    grid_import = 0.0
                elif unmet > CONSERVATION_TOLERANCE_KWH:
                    available = max(0.0, stored - min_energy)
                    by_soc = available * parameters.discharge_efficiency
                    by_power = (
                        parameters.max_discharge_kw * parameters.interval_hours
                    )
                    discharge = max(0.0, min(unmet, by_power, by_soc))
                    if discharge > 0.0:
                        stored_used = discharge / parameters.discharge_efficiency
                        stored = _clamp(stored - stored_used, min_energy, max_energy)
                    grid_import = max(0.0, unmet - discharge)
                    remaining_surplus = 0.0

            charge_loss = max(0.0, charge_input - stored_gain)
            discharge_loss = max(0.0, stored_used - discharge)

            total_charged += charge_input
            total_stored_gain += stored_gain
            total_discharged += discharge
            total_stored_used += stored_used
            total_charge_loss += charge_loss
            total_discharge_loss += discharge_loss
            total_solar += solar
            direct_solar += direct
            baseline_grid += unmet
            baseline_surplus += surplus
            battery_grid += grid_import
            remaining_surplus_total += remaining_surplus

            soc_pct = (
                stored / parameters.capacity_kwh * 100.0
                if parameters.capacity_kwh > 0
                else 0.0
            )

            solar_identity = solar - (direct + charge_input + remaining_surplus)
            demand_identity = demand - (direct + discharge + grid_import)
            max_error = max(
                max_error,
                abs(solar_identity),
                abs(demand_identity),
            )

            timestamp = getattr(row, "reading_time", None)
            if isinstance(timestamp, pd.Timestamp):
                timestamp = timestamp.to_pydatetime()
            elif not isinstance(timestamp, datetime):  # pragma: no cover
                timestamp = datetime.now()

            rows.append(
                {
                    "reading_time": timestamp,
                    "solar_generation_kwh": _round(solar),
                    "apartment_consumption_kwh": _round(apartment),
                    "common_consumption_kwh": _round(common),
                    "total_demand_kwh": _round(demand),
                    "direct_solar_kwh": _round(direct),
                    "direct_common_solar_kwh": _round(common_solar),
                    "direct_apartment_solar_kwh": _round(apartment_solar),
                    "charge_energy_kwh": _round(charge_input),
                    "stored_gain_kwh": _round(stored_gain),
                    "discharge_energy_kwh": _round(discharge),
                    "stored_used_kwh": _round(stored_used),
                    "charge_loss_kwh": _round(charge_loss),
                    "discharge_loss_kwh": _round(discharge_loss),
                    "soc_kwh": _round(stored),
                    "soc_percentage": round(soc_pct, 4),
                    "grid_import_kwh": _round(grid_import),
                    "surplus_kwh": _round(remaining_surplus),
                    "baseline_grid_import_kwh": _round(unmet),
                    "baseline_surplus_kwh": _round(surplus),
                }
            )

    final_stored = _clamp(stored, 0.0, max(parameters.capacity_kwh, 0.0))
    final_soc = (
        final_stored / parameters.capacity_kwh * 100.0
        if parameters.capacity_kwh > 0
        else 0.0
    )
    conservation_ok = bool(max_error <= CONSERVATION_TOLERANCE_KWH)

    return BatterySimulationResult(
        rows=rows,
        initial_stored_kwh=_round(initial_stored),
        final_stored_kwh=_round(final_stored),
        initial_soc_pct=round(parameters.initial_soc_pct, 4),
        final_soc_pct=round(final_soc, 4),
        total_charged_kwh=_round(total_charged),
        total_stored_gain_kwh=_round(total_stored_gain),
        total_discharged_kwh=_round(total_discharged),
        total_stored_used_kwh=_round(total_stored_used),
        total_charge_loss_kwh=_round(total_charge_loss),
        total_discharge_loss_kwh=_round(total_discharge_loss),
        total_losses_kwh=_round(total_charge_loss + total_discharge_loss),
        total_solar_generation_kwh=_round(total_solar),
        direct_solar_kwh=_round(direct_solar),
        baseline_grid_import_kwh=_round(baseline_grid),
        baseline_surplus_kwh=_round(baseline_surplus),
        grid_import_kwh=_round(battery_grid),
        remaining_surplus_kwh=_round(remaining_surplus_total),
        hour_count=len(rows),
        conservation_ok=conservation_ok,
        max_conservation_error_kwh=round(max_error, 9),
        warnings=warnings,
    )


def parameters_from_row(row: Any) -> BatteryParameters:
    """Build engine parameters from a :class:`BatteryConfiguration` instance."""

    return BatteryParameters(
        capacity_kwh=float(row.capacity_kwh),
        max_charge_kw=float(row.max_charge_kw),
        max_discharge_kw=float(row.max_discharge_kw),
        charge_efficiency=float(row.charge_efficiency_pct) / 100.0,
        discharge_efficiency=float(row.discharge_efficiency_pct) / 100.0,
        initial_soc_pct=float(row.initial_soc_pct),
        min_soc_pct=float(row.min_soc_pct),
        max_soc_pct=float(row.max_soc_pct),
    )
