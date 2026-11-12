"""Validated request and response schemas for the SolarVault APIs.

Every energy and money value in a response is computed by the backend battery
engine; the React client only formats what it receives.  Request payloads are
strict (``extra="forbid"``) so a typo in a battery parameter is rejected instead
of silently ignored.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SimulationStatusLiteral = Literal["DRAFT", "PUBLISHED"]


class _Payload(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="allow")


class BatteryConfigurationUpdate(BaseModel):
    """Partial update of the active battery assumptions.

    Any omitted field keeps the value from the currently active configuration.
    Saving appends a new version rather than editing the previous row, so
    historical simulations remain reproducible.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=120)
    capacity_kwh: float | None = Field(default=None, ge=0, le=100000)
    max_charge_kw: float | None = Field(default=None, ge=0, le=100000)
    max_discharge_kw: float | None = Field(default=None, ge=0, le=100000)
    charge_efficiency_pct: float | None = Field(default=None, gt=0, le=100)
    discharge_efficiency_pct: float | None = Field(default=None, gt=0, le=100)
    initial_soc_pct: float | None = Field(default=None, ge=0, le=100)
    min_soc_pct: float | None = Field(default=None, ge=0, le=100)
    max_soc_pct: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Must contain at least 2 characters.")
        return cleaned

    @model_validator(mode="after")
    def _validate_configuration(self) -> "BatteryConfigurationUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one configuration field to update.")
        minimum = self.min_soc_pct
        maximum = self.max_soc_pct
        initial = self.initial_soc_pct
        if minimum is not None and maximum is not None and minimum > maximum:
            raise ValueError("min_soc_pct cannot exceed max_soc_pct.")
        if (
            initial is not None
            and minimum is not None
            and maximum is not None
            and not minimum <= initial <= maximum
        ):
            raise ValueError(
                "initial_soc_pct must lie between min_soc_pct and max_soc_pct."
            )
        return self


class BatteryParameterOverride(BaseModel):
    """Hypothetical battery parameters for the scenario simulator."""

    model_config = ConfigDict(extra="forbid")

    capacity_kwh: float | None = Field(default=None, ge=0, le=100000)
    max_charge_kw: float | None = Field(default=None, ge=0, le=100000)
    max_discharge_kw: float | None = Field(default=None, ge=0, le=100000)
    charge_efficiency_pct: float | None = Field(default=None, gt=0, le=100)
    discharge_efficiency_pct: float | None = Field(default=None, gt=0, le=100)
    initial_soc_pct: float | None = Field(default=None, ge=0, le=100)
    min_soc_pct: float | None = Field(default=None, ge=0, le=100)
    max_soc_pct: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def _validate_override(self) -> "BatteryParameterOverride":
        minimum = self.min_soc_pct
        maximum = self.max_soc_pct
        initial = self.initial_soc_pct
        if minimum is not None and maximum is not None and minimum > maximum:
            raise ValueError("min_soc_pct cannot exceed max_soc_pct.")
        if (
            initial is not None
            and minimum is not None
            and maximum is not None
            and not minimum <= initial <= maximum
        ):
            raise ValueError(
                "initial_soc_pct must lie between min_soc_pct and max_soc_pct."
            )
        return self


class SimulateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    simulation_run_id: int | None = Field(default=None, ge=1)
    configuration_id: int | None = Field(default=None, ge=1)
    save: bool = Field(
        default=True,
        description=(
            "Persist the simulation and its hourly records. Set false for the "
            "hypothetical scenario simulator, which must not modify saved data."
        ),
    )
    publish: bool = Field(
        default=True,
        description=(
            "Publish a saved simulation so residents can view it. Draft "
            "simulations remain administrator-only."
        ),
    )
    notes: str | None = Field(default=None, max_length=2000)
    overrides: BatteryParameterOverride | None = Field(
        default=None,
        description=(
            "Optional hypothetical parameters. Only valid with save=false; "
            "saved simulations always use a stored configuration version."
        ),
    )

    @model_validator(mode="after")
    def _validate_save_override(self) -> "SimulateRequest":
        if self.save and self.overrides is not None:
            raise ValueError(
                "overrides are only allowed for hypothetical simulations "
                "(save=false). Save the configuration first to persist it."
            )
        return self


class ActorPayload(_Payload):
    id: int
    name: str
    email: str


class BatteryConfigurationPayload(_Payload):
    id: int
    name: str
    capacity_kwh: float
    max_charge_kw: float
    max_discharge_kw: float
    charge_efficiency_pct: float
    discharge_efficiency_pct: float
    initial_soc_pct: float
    min_soc_pct: float
    max_soc_pct: float
    usable_capacity_kwh: float
    is_active: bool
    notes: str | None = None
    created_by: ActorPayload | None = None
    created_at: datetime


class BatteryHourlyRecordPayload(_Payload):
    id: int | None = None
    simulation_id: int | None = None
    timestamp: datetime
    solar_generation_kwh: float
    apartment_consumption_kwh: float
    common_consumption_kwh: float
    total_demand_kwh: float
    direct_solar_kwh: float
    direct_common_solar_kwh: float
    direct_apartment_solar_kwh: float
    charge_energy_kwh: float
    stored_gain_kwh: float
    discharge_energy_kwh: float
    stored_used_kwh: float
    charge_loss_kwh: float
    discharge_loss_kwh: float
    soc_kwh: float
    soc_percentage: float
    grid_import_kwh: float
    surplus_kwh: float
    baseline_grid_import_kwh: float
    baseline_surplus_kwh: float


class BaselineComparisonPayload(_Payload):
    solar_generation_kwh: float
    direct_solar_kwh: float
    stored_energy_kwh: float
    discharged_kwh: float
    charge_loss_kwh: float
    discharge_loss_kwh: float
    total_losses_kwh: float
    final_soc_pct: float
    grid_import_kwh: float
    remaining_surplus_kwh: float
    solar_utilization_pct: float


class SavingsComparisonPayload(_Payload):
    grid_reduction_kwh: float
    grid_reduction_pct: float
    solar_utilization_gain_pct: float
    surplus_reduction_kwh: float
    estimated_savings: float
    tariff_price_per_kwh: float


class BatteryComparisonPayload(_Payload):
    simulation_id: int | None = None
    simulation_code: str | None = None
    baseline: BaselineComparisonPayload
    with_battery: BaselineComparisonPayload
    savings: SavingsComparisonPayload


class BatterySimulationSummaryPayload(_Payload):
    id: int
    simulation_code: str
    status: SimulationStatusLiteral
    simulation_run_id: int
    battery_configuration_id: int
    period_start: datetime
    period_end: datetime
    hour_count: int
    tariff_price_per_kwh: float
    tariff_source: str

    capacity_kwh: float
    max_charge_kw: float
    max_discharge_kw: float
    charge_efficiency_pct: float
    discharge_efficiency_pct: float
    initial_soc_pct: float
    min_soc_pct: float
    max_soc_pct: float

    initial_stored_kwh: float
    final_stored_kwh: float
    initial_soc_actual_pct: float
    final_soc_pct: float

    total_solar_generation_kwh: float
    total_apartment_consumption_kwh: float
    total_common_consumption_kwh: float
    total_building_demand_kwh: float
    direct_solar_kwh: float

    total_charged_kwh: float
    total_stored_gain_kwh: float
    total_discharged_kwh: float
    total_stored_used_kwh: float
    total_charge_loss_kwh: float
    total_discharge_loss_kwh: float
    total_losses_kwh: float

    baseline_grid_import_kwh: float
    baseline_surplus_kwh: float
    grid_import_kwh: float
    remaining_surplus_kwh: float
    baseline_solar_utilization_pct: float
    solar_utilization_pct: float
    grid_reduction_kwh: float
    grid_reduction_pct: float
    estimated_savings: float

    conservation_ok: bool
    max_conservation_error_kwh: float

    algorithm_version: str
    input_hash: str
    notes: str | None = None
    created_by: ActorPayload | None = None
    published_by: ActorPayload | None = None
    published_at: datetime | None = None
    created_at: datetime


class BatterySimulationPayload(BatterySimulationSummaryPayload):
    assumptions: dict[str, Any] = Field(default_factory=dict)
    warnings: list[Any] = Field(default_factory=list)
    limitations: list[Any] = Field(default_factory=list)
    configuration: BatteryConfigurationPayload | None = None
    comparison: BatteryComparisonPayload | None = None


class SimulateResponse(_Payload):
    saved: bool
    published: bool
    duplicate: bool
    simulation: BatterySimulationPayload
    comparison: BatteryComparisonPayload
    disclaimer: str
    limitations: list[Any] = Field(default_factory=list)


class ConfigurationResponse(_Payload):
    configuration: BatteryConfigurationPayload
    previous_configuration_id: int | None = None
    created: bool
    disclaimer: str


class SummaryResponse(_Payload):
    simulation: BatterySimulationPayload
    configuration: BatteryConfigurationPayload
    comparison: BatteryComparisonPayload
    overview: dict[str, Any] = Field(default_factory=dict)
    disclaimer: str
    limitations: list[Any] = Field(default_factory=list)


class HourlyResponse(_Payload):
    simulation_id: int
    simulation_code: str
    total: int
    limit: int
    offset: int
    items: list[BatteryHourlyRecordPayload] = Field(default_factory=list)
    disclaimer: str


class HistoryResponse(_Payload):
    total: int
    limit: int
    offset: int
    items: list[BatterySimulationSummaryPayload] = Field(default_factory=list)
    disclaimer: str


class CompareResponse(_Payload):
    simulation: BatterySimulationSummaryPayload
    comparison: BatteryComparisonPayload
    disclaimer: str
    limitations: list[Any] = Field(default_factory=list)


class SimulationDetailResponse(_Payload):
    simulation: BatterySimulationPayload
    configuration: BatteryConfigurationPayload
    comparison: BatteryComparisonPayload
    hourly: list[BatteryHourlyRecordPayload] = Field(default_factory=list)
    disclaimer: str
    limitations: list[Any] = Field(default_factory=list)
