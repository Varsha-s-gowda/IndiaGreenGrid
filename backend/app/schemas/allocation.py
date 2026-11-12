"""Request and response schemas for the fair-allocation APIs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

AllocationMethodLiteral = Literal[
    "EQUAL_SHARE", "CONSUMPTION_BASED", "OWNERSHIP_BASED"
]


class AllocationCalculateRequest(BaseModel):
    simulation_run_id: int | None = Field(
        default=None,
        ge=1,
        description="SolarTwin simulation run ID. Defaults to the latest run.",
    )
    simulation_id: int | None = Field(
        default=None,
        ge=1,
        description="Alias for simulation_run_id.",
    )
    date_from: date | None = None
    date_to: date | None = None
    method: AllocationMethodLiteral = Field(
        default="EQUAL_SHARE",
        description="EQUAL_SHARE, CONSUMPTION_BASED or OWNERSHIP_BASED.",
    )
    save: bool = Field(
        default=False,
        description="Preview when false; persist an immutable run when true.",
    )
    solar_multiplier: float = Field(
        default=1.0,
        ge=0,
        le=10,
        description="What-if multiplier applied to hourly solar generation.",
    )
    demand_multiplier: float = Field(
        default=1.0,
        ge=0,
        le=10,
        description="What-if multiplier applied to every apartment's demand.",
    )
    ownership_overrides: dict[str, float] | None = Field(
        default=None,
        description=(
            "Optional hypothetical ownership percentages keyed by flat number "
            "or apartment ID. The effective total must be 100.000%."
        ),
    )
    hypothetical: bool = Field(
        default=False,
        description="Explicitly label the request as a what-if scenario.",
    )
    allow_incomplete: bool = Field(
        default=False,
        description=(
            "Allow previewing complete hours when some source readings are "
            "missing. Saving additionally requires incomplete_policy."
        ),
    )
    incomplete_policy: str | None = Field(
        default=None,
        max_length=2000,
        description="Administrator-approved documented policy for incomplete data.",
    )

    @model_validator(mode="after")
    def _resolve_simulation_alias(self) -> "AllocationCalculateRequest":
        if self.simulation_run_id is None and self.simulation_id is not None:
            self.simulation_run_id = self.simulation_id
        if (
            self.simulation_run_id is not None
            and self.simulation_id is not None
            and self.simulation_run_id != self.simulation_id
        ):
            raise ValueError(
                "simulation_run_id and simulation_id must refer to the same run."
            )
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to.")
        return self


class AllocationComparisonRequest(BaseModel):
    simulation_run_id: int | None = Field(default=None, ge=1)
    simulation_id: int | None = Field(default=None, ge=1)
    date_from: date | None = None
    date_to: date | None = None
    solar_multiplier: float = Field(default=1.0, ge=0, le=10)
    demand_multiplier: float = Field(default=1.0, ge=0, le=10)
    ownership_overrides: dict[str, float] | None = None
    hypothetical: bool = Field(
        default=True,
        description="What-if comparisons are never persisted.",
    )
    allow_incomplete: bool = Field(default=False)
    incomplete_policy: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _resolve_simulation_alias(self) -> "AllocationComparisonRequest":
        if self.simulation_run_id is None and self.simulation_id is not None:
            self.simulation_run_id = self.simulation_id
        if (
            self.simulation_run_id is not None
            and self.simulation_id is not None
            and self.simulation_run_id != self.simulation_id
        ):
            raise ValueError(
                "simulation_run_id and simulation_id must refer to the same run."
            )
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to.")
        return self


class ActorSummary(BaseModel):
    id: int
    name: str
    email: str


class AllocationTotals(BaseModel):
    total_solar_generation_kwh: float = Field(ge=0)
    common_solar_consumption_kwh: float = Field(ge=0)
    available_for_apartments_kwh: float = Field(ge=0)
    total_allocated_kwh: float = Field(ge=0)
    surplus_kwh: float = Field(ge=0)
    total_apartment_consumption_kwh: float = Field(ge=0)
    grid_import_kwh: float = Field(ge=0)
    solar_utilization_percentage: float = Field(ge=0, le=100)
    apartment_solar_coverage_percentage: float = Field(ge=0, le=100)
    average_coverage_percentage: float = Field(default=0, ge=0, le=100)
    tariff_price_per_kwh: float = Field(default=0, ge=0)
    hour_count: int | None = Field(default=None, ge=0)
    conservation_ok: bool | None = None
    max_conservation_error_kwh: float | None = Field(default=None, ge=0)
    allocation_rounds: int | None = Field(default=None, ge=0)


class AllocationApartmentSummary(BaseModel):
    apartment_id: int
    flat_number: str
    apartment_category: str
    residents_count: int = Field(ge=0)
    ownership_percentage: float = Field(ge=0, le=100)
    total_consumption_kwh: float = Field(ge=0)
    total_solar_allocation_kwh: float = Field(ge=0)
    total_grid_import_kwh: float = Field(ge=0)
    solar_coverage_percentage: float = Field(ge=0, le=100)
    estimated_solar_credit: float = Field(ge=0)


class FairnessBenefitRow(BaseModel):
    apartment_id: int
    flat_number: str
    consumption_kwh: float = Field(ge=0)
    solar_allocation_kwh: float = Field(ge=0)
    grid_import_kwh: float = Field(ge=0)
    solar_coverage_percentage: float = Field(ge=0, le=100)
    estimated_solar_credit: float = Field(ge=0)
    ownership_percentage: float = Field(ge=0, le=100)


class CoverageBucket(BaseModel):
    label: str
    lower_percentage: float
    upper_percentage: float
    count: int = Field(ge=0)
    share_percentage: float = Field(ge=0, le=100)


class SavingsDistribution(BaseModel):
    total_estimated_credit: float = Field(ge=0)
    average_credit: float = Field(ge=0)
    minimum_credit: float = Field(ge=0)
    maximum_credit: float = Field(ge=0)
    credit_variance: float = Field(ge=0)
    top_earners: list[FairnessBenefitRow]
    zero_credit_apartments: list[str]


class FairnessConcept(BaseModel):
    key: str
    title: str
    explanation: str


class FairnessMetricsResponse(BaseModel):
    jain_index: float | None = Field(default=None, ge=0, le=1)
    jain_index_applicable: bool
    jain_index_reason: str | None = None
    metric: str
    metric_definition: str
    tariff_price_per_kwh: float = Field(ge=0)
    apartment_count: int = Field(ge=0)
    positive_demand_apartments: int = Field(ge=0)
    total_consumption_kwh: float = Field(ge=0)
    total_solar_allocation_kwh: float = Field(ge=0)
    total_grid_import_kwh: float = Field(ge=0)
    overall_coverage_percentage: float = Field(ge=0, le=100)
    average_coverage_percentage: float = Field(ge=0, le=100)
    minimum_coverage_percentage: float = Field(ge=0, le=100)
    maximum_coverage_percentage: float = Field(ge=0, le=100)
    coverage_variance: float = Field(ge=0)
    coverage_standard_deviation: float = Field(ge=0)
    allocation_variance_kwh: float = Field(ge=0)
    coverage_distribution: list[CoverageBucket]
    highest_benefited_apartments: list[FairnessBenefitRow]
    lowest_benefited_apartments: list[FairnessBenefitRow]
    savings_distribution: SavingsDistribution
    concepts: list[FairnessConcept]
    interpretation: str
    caveats: list[str]


class AllocationRunMeta(BaseModel):
    id: int
    simulation_run_id: int
    method: str
    method_label: str
    status: str
    date_from: date
    date_to: date
    total_solar_generation_kwh: float = Field(ge=0)
    common_solar_consumption_kwh: float = Field(ge=0)
    available_for_apartments_kwh: float = Field(ge=0)
    total_allocated_kwh: float = Field(ge=0)
    surplus_kwh: float = Field(ge=0)
    total_apartment_consumption_kwh: float = Field(ge=0)
    grid_import_kwh: float = Field(ge=0)
    average_coverage_percentage: float = Field(ge=0, le=100)
    tariff_price_per_kwh: float = Field(ge=0)
    algorithm_version: str
    input_hash: str
    is_hypothetical: bool
    incomplete_data: bool
    policy_note: str | None = None
    notes: str | None = None
    created_at: datetime
    created_by_id: int | None = None
    created_by: ActorSummary | None = None


class AllocationRunListResponse(BaseModel):
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
    items: list[AllocationRunMeta]


class AllocationResultResponse(BaseModel):
    saved: bool
    duplicate: bool
    run_id: int | None = None
    status: str
    method: str
    method_label: str
    algorithm_version: str
    input_hash: str
    is_hypothetical: bool
    incomplete_data: bool
    policy_note: str | None = None
    simulation_run_id: int
    date_from: date
    date_to: date
    apartments_analyzed: int = Field(ge=0)
    hour_count: int = Field(ge=0)
    expected_hour_count: int | None = Field(default=None, ge=0)
    missing_report: dict[str, Any] | None = None
    totals: AllocationTotals
    fairness: FairnessMetricsResponse
    apartments: list[AllocationApartmentSummary]
    warnings: list[str]
    created_at: datetime | None = None
    created_by: ActorSummary | None = None
    run: AllocationRunMeta | None = None


class ApartmentIdentity(BaseModel):
    id: int
    flat_number: str
    floor_number: int = Field(ge=0)
    apartment_category: str
    residents_count: int = Field(ge=0)
    consumption_profile: str


class ApartmentAllocationResponse(BaseModel):
    saved: bool
    is_hypothetical: bool
    allocation_run_id: int | None = None
    simulation_run_id: int
    method: str
    method_label: str
    algorithm_version: str
    input_hash: str
    date_from: date
    date_to: date
    hour_count: int = Field(ge=0)
    apartment: ApartmentIdentity
    summary: AllocationApartmentSummary
    tariff_price_per_kwh: float = Field(ge=0)
    totals: AllocationTotals
    policy_note: str | None = None
    warnings: list[str]


class AllocationRecordPoint(BaseModel):
    reading_time: datetime | None = None
    period: str
    apartment_id: int | None = None
    flat_number: str | None = None
    consumption_kwh: float = Field(ge=0)
    allocated_solar_kwh: float = Field(ge=0)
    grid_import_kwh: float = Field(ge=0)
    ownership_percentage: float = Field(default=0, ge=0, le=100)
    allocation_weight: float | None = Field(default=None, ge=0, le=1)
    solar_coverage_percentage: float = Field(default=0, ge=0, le=100)
    apartment_count: int | None = Field(default=None, ge=0)


class AllocationRecordListResponse(BaseModel):
    saved: bool
    allocation_run_id: int | None = None
    simulation_run_id: int
    method: str
    method_label: str
    algorithm_version: str
    input_hash: str
    granularity: str
    flat_number: str | None = None
    apartment_id: int | None = None
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
    items: list[AllocationRecordPoint]
    warnings: list[str]


class ComparisonMethodApartment(BaseModel):
    allocated_kwh: float = Field(ge=0)
    grid_import_kwh: float = Field(ge=0)
    coverage_percentage: float = Field(ge=0, le=100)
    estimated_credit: float = Field(ge=0)


class ComparisonApartmentRow(BaseModel):
    apartment_id: int
    flat_number: str
    apartment_category: str
    residents_count: int = Field(ge=0)
    ownership_percentage: float = Field(ge=0, le=100)
    consumption_kwh: float = Field(ge=0)
    methods: dict[str, ComparisonMethodApartment]
    allocation_spread_kwh: float = Field(ge=0)
    coverage_spread_percentage: float = Field(ge=0, le=100)


class ComparisonMethodResult(BaseModel):
    method: str
    method_label: str
    allocation_run_id: int | None = None
    saved: bool
    status: str
    input_hash: str
    totals: AllocationTotals
    fairness: FairnessMetricsResponse


class ComparisonFairness(BaseModel):
    jain_index: dict[str, float | None]
    average_coverage_percentage: dict[str, float]
    minimum_coverage_percentage: dict[str, float]
    maximum_coverage_percentage: dict[str, float]
    coverage_variance: dict[str, float]
    note: str


class AllocationComparisonResponse(BaseModel):
    source: str
    saved: bool
    is_hypothetical: bool
    simulation_run_id: int
    date_from: date
    date_to: date
    apartments_compared: int = Field(ge=0)
    tariff_price_per_kwh: float = Field(ge=0)
    methods: list[ComparisonMethodResult]
    method_totals: dict[str, AllocationTotals]
    fairness_comparison: ComparisonFairness
    apartments: list[ComparisonApartmentRow]
    saved_run_ids: dict[str, int]
    warnings: list[str]
    concepts: list[str]


class FairnessMethodResult(BaseModel):
    method: str
    method_label: str
    allocation_run_id: int | None = None
    saved: bool
    totals: AllocationTotals
    fairness: FairnessMetricsResponse


class FairnessComparisonBlock(BaseModel):
    jain_index: dict[str, float | None]
    average_coverage_percentage: dict[str, float]
    note: str


class AllocationFairnessResponse(BaseModel):
    source: str
    saved: bool
    allocation_run_id: int | None = None
    simulation_run_id: int
    date_from: date
    date_to: date
    selected_method: str | None = None
    methods: list[FairnessMethodResult]
    comparison: FairnessComparisonBlock
    created_at: datetime | None = None
