"""Request and response schemas for the SolarTwin simulation APIs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SimulationGenerateRequest(BaseModel):
    capacity_kwp: float = Field(default=50.0, gt=0, le=10_000)
    start_date: date | None = Field(
        default=None,
        description="First day of the simulation. Defaults to a period ending today.",
    )
    days: int = Field(default=30, ge=1, le=366)
    seed: int = Field(default=360, ge=0)
    run_id: int | None = Field(
        default=None,
        description="Extend/regenerate an existing run instead of creating a new one.",
    )
    regenerate: bool = Field(
        default=False,
        description="Replace existing readings for this run/configuration.",
    )
    include_common: bool = Field(
        default=True,
        description="When generating consumption, also generate common-area loads.",
    )


class SimulationRunStatus(BaseModel):
    id: int
    status: str
    solar_capacity_kwp: float
    start_date: date
    end_date: date
    days: int
    random_seed: int
    created_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None
    solar_records: int
    meter_records: int
    common_records: int
    expected_records: dict[str, int]
    progress_percentage: float = Field(ge=0, le=100)


class SimulationRunListResponse(BaseModel):
    total: int = Field(ge=0)
    items: list[SimulationRunStatus]


class SimulationGenerationResponse(BaseModel):
    run: SimulationRunStatus
    solar_created: int = Field(ge=0)
    meter_created: int = Field(ge=0)
    common_created: int = Field(ge=0)
    reused: bool
    message: str


class SolarGenerationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    simulation_run_id: int
    reading_time: datetime
    generation_kwh: float = Field(ge=0)
    capacity_kwp: float = Field(gt=0)
    weather_factor: float = Field(ge=0)


class SolarGenerationListResponse(BaseModel):
    run_id: int
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
    items: list[SolarGenerationRead]


class MeterReadingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    simulation_run_id: int
    apartment_id: int
    flat_number: str | None = None
    reading_time: datetime
    consumption_kwh: float = Field(ge=0)


class MeterReadingListResponse(BaseModel):
    run_id: int
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
    items: list[MeterReadingRead]


class CommonConsumptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    simulation_run_id: int
    category: str
    reading_time: datetime
    consumption_kwh: float = Field(ge=0)


class CommonConsumptionListResponse(BaseModel):
    run_id: int
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
    items: list[CommonConsumptionRead]


class EnergyValues(BaseModel):
    total_solar_generation_kwh: float = Field(ge=0)
    total_apartment_consumption_kwh: float = Field(ge=0)
    total_common_consumption_kwh: float = Field(ge=0)
    total_building_demand_kwh: float = Field(ge=0)
    common_solar_utilization_kwh: float = Field(ge=0)
    remaining_solar_after_common_kwh: float = Field(ge=0)
    solar_to_apartments_kwh: float = Field(ge=0)
    total_solar_utilized_kwh: float = Field(ge=0)
    surplus_solar_kwh: float = Field(ge=0)
    grid_import_kwh: float = Field(ge=0)
    solar_utilization_percentage: float = Field(ge=0, le=100)
    apartment_solar_coverage_percentage: float = Field(ge=0, le=100)
    common_solar_coverage_percentage: float = Field(ge=0, le=100)


class EnergyBalancePoint(EnergyValues):
    reading_time: datetime


class EnergyBalancePeriod(EnergyValues):
    period: str


class EnergyBalanceTotals(EnergyValues):
    hour_count: int = Field(ge=0)
    conservation_ok: bool
    max_conservation_error_kwh: float = Field(ge=0)


class EnergyBalanceListResponse(BaseModel):
    run_id: int
    granularity: str
    count: int = Field(ge=0)
    items: list[EnergyBalancePoint] | list[EnergyBalancePeriod]


class HourlyBalanceResponse(EnergyBalanceListResponse):
    granularity: str = "hourly"
    items: list[EnergyBalancePoint]


class DailyBalanceResponse(EnergyBalanceListResponse):
    granularity: str = "daily"
    items: list[EnergyBalancePeriod]


class MonthlyBalanceResponse(EnergyBalanceListResponse):
    granularity: str = "monthly"
    items: list[EnergyBalancePeriod]


class SimulationSummaryResponse(BaseModel):
    run: SimulationRunStatus
    date_from: date | None = None
    date_to: date | None = None
    energy_balance: EnergyBalanceTotals
    record_counts: dict[str, int]
    common_by_category: dict[str, float]


class MessageResponse(BaseModel):
    message: str
