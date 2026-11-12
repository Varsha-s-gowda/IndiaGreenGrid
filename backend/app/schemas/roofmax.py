"""Validated request and response schemas for the RoofMax APIs.

Every energy and money value in a response is computed by the backend service;
the React client only formats what it receives.  Request payloads are strict
(``extra="forbid"``) so a typo in a planning assumption is rejected instead of
silently ignored.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ScenarioTypeLiteral = Literal["CONSERVATIVE", "STANDARD", "OPTIMISTIC"]
AnalysisStatusLiteral = Literal["DRAFT", "PUBLISHED"]


class _Payload(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="allow")


class RoofConfigurationUpdate(BaseModel):
    """Partial update of the active roof and financial assumptions.

    Any omitted field keeps the corresponding value from the currently active
    configuration.  The service stores a new version rather than editing the
    previous row, so past analyses remain reproducible.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=120)
    location: str | None = Field(default=None, min_length=2, max_length=160)
    usable_roof_area_m2: float | None = Field(default=None, gt=0, le=100000)
    panel_length_m: float | None = Field(default=None, gt=0, le=10)
    panel_width_m: float | None = Field(default=None, gt=0, le=10)
    panel_capacity_wp: float | None = Field(default=None, gt=0, le=2000)
    panel_efficiency_pct: float | None = Field(default=None, gt=0, le=100)
    performance_ratio_pct: float | None = Field(default=None, gt=0, le=100)
    system_loss_pct: float | None = Field(default=None, ge=0, lt=100)
    solar_irradiation_kwh_m2_day: float | None = Field(
        default=None, gt=0, le=12
    )
    installation_cost_per_kwp: float | None = Field(default=None, ge=0, le=1000000)
    maintenance_cost_per_kwp_year: float | None = Field(
        default=None, ge=0, le=100000
    )
    tariff_override_per_kwh: float | None = Field(default=None, ge=0, le=100)
    tariff_escalation_pct: float | None = Field(default=None, ge=0, le=50)
    maintenance_escalation_pct: float | None = Field(default=None, ge=0, le=50)
    conservative_yield_variation_pct: float | None = Field(
        default=None, ge=0, le=50
    )
    conservative_tariff_variation_pct: float | None = Field(
        default=None, ge=0, le=50
    )
    conservative_cost_variation_pct: float | None = Field(
        default=None, ge=0, le=50
    )
    optimistic_yield_variation_pct: float | None = Field(
        default=None, ge=0, le=50
    )
    optimistic_tariff_variation_pct: float | None = Field(
        default=None, ge=0, le=50
    )
    optimistic_cost_variation_pct: float | None = Field(
        default=None, ge=0, le=50
    )
    short_horizon_years: int | None = Field(default=None, ge=1, le=40)
    long_horizon_years: int | None = Field(default=None, ge=1, le=40)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "location")
    @classmethod
    def _clean_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Must contain at least 2 characters.")
        return cleaned

    @model_validator(mode="after")
    def _validate_configuration(self) -> "RoofConfigurationUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one configuration field to update.")
        short = self.short_horizon_years
        long = self.long_horizon_years
        if short is not None and long is not None and long < short:
            raise ValueError(
                "long_horizon_years must be greater than or equal to "
                "short_horizon_years."
            )
        return self


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    simulation_run_id: int | None = Field(default=None, ge=1)
    configuration_id: int | None = Field(default=None, ge=1)
    publish: bool = Field(
        default=True,
        description=(
            "Publish the analysis so residents can view the recommendation. "
            "Draft analyses remain administrator-only."
        ),
    )
    notes: str | None = Field(default=None, max_length=2000)


class ActorPayload(_Payload):
    id: int
    name: str
    email: str


class RoofConfigurationPayload(_Payload):
    id: int
    name: str
    location: str
    usable_roof_area_m2: float
    panel_length_m: float
    panel_width_m: float
    panel_area_m2: float
    panel_capacity_wp: float
    panel_efficiency_pct: float
    performance_ratio_pct: float
    system_loss_pct: float
    solar_irradiation_kwh_m2_day: float
    specific_daily_yield_kwh_per_kwp: float
    installation_cost_per_kwp: float
    maintenance_cost_per_kwp_year: float
    tariff_override_per_kwh: float | None = None
    tariff_escalation_pct: float
    maintenance_escalation_pct: float
    conservative_yield_variation_pct: float
    conservative_tariff_variation_pct: float
    conservative_cost_variation_pct: float
    optimistic_yield_variation_pct: float
    optimistic_tariff_variation_pct: float
    optimistic_cost_variation_pct: float
    short_horizon_years: int
    long_horizon_years: int
    is_active: bool
    notes: str | None = None
    created_by: ActorPayload | None = None
    created_at: datetime


class CapacityScenarioPayload(_Payload):
    id: int | None = None
    analysis_id: int | None = None
    scenario_type: ScenarioTypeLiteral
    option_label: str
    capacity_kwp: float
    panel_count: int
    is_feasible: bool
    is_recommended: bool
    constraint_note: str | None = None
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
    payback_period_years: float | None = None
    ten_year_benefit: float
    twenty_year_benefit: float
    roi_percentage: float
    cost_per_kwp: float
    assumptions: dict[str, Any] = Field(default_factory=dict)
    sort_order: int = 0


class AnalysisSummaryPayload(_Payload):
    id: int
    analysis_code: str
    status: AnalysisStatusLiteral
    simulation_run_id: int
    roof_configuration_id: int
    demand_start_date: date
    demand_end_date: date
    demand_days: int
    demand_hour_count: int
    total_apartment_consumption_kwh: float
    total_common_consumption_kwh: float
    total_building_demand_kwh: float
    average_daily_demand_kwh: float
    average_monthly_demand_kwh: float
    annual_demand_kwh: float
    current_solar_capacity_kwp: float
    existing_solar_generation_kwh: float
    existing_solar_utilized_kwh: float
    existing_solar_utilization_percentage: float
    existing_solar_coverage_percentage: float
    required_capacity_kwp: float
    max_installable_capacity_kwp: float
    max_panel_count: int
    recommended_capacity_kwp: float
    recommended_panel_count: int
    recommended_daily_generation_kwh: float
    recommended_monthly_generation_kwh: float
    recommended_annual_generation_kwh: float
    recommended_demand_coverage_percentage: float
    recommended_surplus_kwh: float
    recommended_grid_dependency_kwh: float
    recommended_grid_dependency_percentage: float
    installation_cost: float
    annual_savings: float
    annual_maintenance_cost: float
    net_annual_savings: float
    payback_period_years: float | None = None
    ten_year_benefit: float
    twenty_year_benefit: float
    roi_percentage: float
    cost_per_kwp: float
    tariff_price_per_kwh: float
    algorithm_version: str
    input_hash: str
    notes: str | None = None
    created_by: ActorPayload | None = None
    published_by: ActorPayload | None = None
    published_at: datetime | None = None
    created_at: datetime
    recommendation_reason: str


class AnalysisPayload(AnalysisSummaryPayload):
    assumptions: dict[str, Any] = Field(default_factory=dict)
    demand_profile: dict[str, Any] = Field(default_factory=dict)
    limitations: list[Any] = Field(default_factory=list)
    scenarios: list[CapacityScenarioPayload] = Field(default_factory=list)
    configuration: RoofConfigurationPayload | None = None


class AnalyzeResponse(_Payload):
    saved: bool
    published: bool
    duplicate: bool
    analysis: AnalysisPayload
    disclaimer: str


class RecommendationResponse(_Payload):
    analysis: AnalysisPayload
    configuration: RoofConfigurationPayload
    disclaimer: str
    limitations: list[Any] = Field(default_factory=list)


class ScenariosResponse(_Payload):
    analysis_id: int
    analysis_code: str
    recommended_capacity_kwp: float
    recommended_panel_count: int
    max_installable_capacity_kwp: float
    required_capacity_kwp: float
    scenario_factors: dict[str, dict[str, float]] = Field(default_factory=dict)
    standard_scenario: list[CapacityScenarioPayload] = Field(default_factory=list)
    conservative_scenario: list[CapacityScenarioPayload] = Field(
        default_factory=list
    )
    optimistic_scenario: list[CapacityScenarioPayload] = Field(default_factory=list)
    disclaimer: str


class AnalysisHistoryResponse(_Payload):
    total: int
    limit: int
    offset: int
    items: list[AnalysisSummaryPayload] = Field(default_factory=list)


class AnalysisDetailResponse(_Payload):
    analysis: AnalysisPayload
    configuration: RoofConfigurationPayload
    disclaimer: str
    limitations: list[Any] = Field(default_factory=list)


class ConfigurationResponse(_Payload):
    configuration: RoofConfigurationPayload
    previous_configuration_id: int | None = None
    created: bool
    disclaimer: str


class ConfigurationListResponse(_Payload):
    total: int
    items: list[RoofConfigurationPayload] = Field(default_factory=list)
