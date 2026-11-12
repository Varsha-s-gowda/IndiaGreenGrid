"""India Green Grid domain models.

Every PS1 module has persistent storage here.  Business calculations are kept
in (and only in) the Python service layer; these models are deliberately
declarative so that the React client receives finished figures.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class DataSource(TimestampMixin, Base):
    """A public data source and the freshness of its last ingestion."""

    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    organization: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    dataset_name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="sample", server_default="sample"
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    freshness_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=720)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")


class IngestionRun(Base):
    """Audit trail for every ingestion attempt (success or failure)."""

    __tablename__ = "ingestion_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    dataset_status: Mapped[str] = mapped_column(String(30), nullable=False, default="SAMPLE")
    records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    trigger: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)


class EnergySource(Base):
    __tablename__ = "energy_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#3d8f60")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_renewable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class NationalEnergyStatistic(TimestampMixin, Base):
    __tablename__ = "national_energy_statistics"
    __table_args__ = (
        UniqueConstraint("year", "energy_source_id", name="uq_national_energy_year_source"),
        CheckConstraint("installed_capacity_mw >= 0", name="ck_nes_capacity_non_negative"),
        CheckConstraint("generation_gwh >= 0", name="ck_nes_generation_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    energy_source_id: Mapped[int] = mapped_column(
        ForeignKey("energy_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    installed_capacity_mw: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    generation_gwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    capacity_share_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    generation_share_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    energy_source: Mapped[EnergySource] = relationship()
    data_source: Mapped[DataSource | None] = relationship()


class StateEnergyStatistic(TimestampMixin, Base):
    __tablename__ = "state_energy_statistics"
    __table_args__ = (
        UniqueConstraint("state", "year", name="uq_state_energy_state_year"),
        CheckConstraint("solar_capacity_mw >= 0", name="ck_ses_solar_non_negative"),
        CheckConstraint("wind_capacity_mw >= 0", name="ck_ses_wind_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    solar_capacity_mw: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    wind_capacity_mw: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_renewable_mw: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    co2_avoided_tonnes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    air_quality_index: Mapped[float | None] = mapped_column(Float)
    pm25: Mapped[float | None] = mapped_column(Float)
    is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )


class EnvironmentalImpact(TimestampMixin, Base):
    __tablename__ = "environmental_impacts"
    __table_args__ = (
        UniqueConstraint("region", "year", name="uq_impact_region_year"),
        CheckConstraint("co2_avoided_tonnes >= 0", name="ck_impact_co2_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region: Mapped[str] = mapped_column(String(80), nullable=False, default="India")
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    co2_avoided_tonnes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    renewable_generation_gwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    trees_equivalent: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )


class AirQualityReading(TimestampMixin, Base):
    __tablename__ = "air_quality_readings"
    __table_args__ = (
        UniqueConstraint("city", "measured_at", name="uq_air_quality_city_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    city: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    aqi: Mapped[float] = mapped_column(Float, nullable=False)
    pm25: Mapped[float | None] = mapped_column(Float)
    pm10: Mapped[float | None] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    data_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )


class RpoTarget(TimestampMixin, Base):
    __tablename__ = "rpo_targets"
    __table_args__ = (
        UniqueConstraint(
            "owner_id", "entity_name", "year", name="uq_rpo_owner_entity_year"
        ),
        CheckConstraint("year BETWEEN 2025 AND 2030", name="ck_rpo_year_range"),
        CheckConstraint("obligated_energy_mwh >= 0", name="ck_rpo_energy_non_negative"),
        CheckConstraint("solar_target_pct BETWEEN 0 AND 100", name="ck_rpo_solar_pct"),
        CheckConstraint(
            "non_solar_target_pct BETWEEN 0 AND 100", name="ck_rpo_non_solar_pct"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False, default="DISCOM")
    entity_name: Mapped[str] = mapped_column(String(180), nullable=False)
    entity_code: Mapped[str] = mapped_column(
        String(80), nullable=False, default="", server_default=""
    )
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    obligated_energy_mwh: Mapped[float] = mapped_column(Float, nullable=False)
    solar_target_pct: Mapped[float] = mapped_column(Float, nullable=False)
    non_solar_target_pct: Mapped[float] = mapped_column(Float, nullable=False)
    total_target_pct: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    compliances: Mapped[list["RpoComplianceRecord"]] = relationship(
        back_populates="target", cascade="all, delete-orphan", passive_deletes=True
    )


class RpoComplianceRecord(TimestampMixin, Base):
    __tablename__ = "rpo_compliance_records"
    __table_args__ = (
        UniqueConstraint("target_id", "year", name="uq_rpo_compliance_target_year"),
        CheckConstraint("actual_solar_mwh >= 0", name="ck_rpo_actual_solar_non_negative"),
        CheckConstraint(
            "actual_non_solar_mwh >= 0", name="ck_rpo_actual_non_solar_non_negative"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("rpo_targets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    actual_solar_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    actual_non_solar_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    actual_total_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    required_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    target_snapshot_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    compliance_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    shortfall_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    surplus_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NON_COMPLIANT")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    recorded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    target: Mapped[RpoTarget] = relationship(back_populates="compliances")


class RpoComplianceRevision(Base):
    """Immutable snapshot written every time compliance is recorded.

    The current state lives on :class:`RpoComplianceRecord`; this table keeps
    the full filing history so past submissions are never lost.
    """

    __tablename__ = "rpo_compliance_revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("rpo_targets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    actual_solar_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    actual_non_solar_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    actual_total_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    required_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    target_snapshot_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    compliance_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    shortfall_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    surplus_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    recorded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class SolarCalculation(Base):
    __tablename__ = "solar_calculations"
    __table_args__ = (
        CheckConstraint("monthly_consumption_kwh > 0", name="ck_solar_calc_consumption"),
        CheckConstraint("rooftop_area_sqm > 0", name="ck_solar_calc_area"),
        CheckConstraint("recommended_kwp >= 0", name="ck_solar_calc_kwp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    customer_type: Mapped[str] = mapped_column(String(40), nullable=False, default="RESIDENTIAL")
    monthly_consumption_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    rooftop_area_sqm: Mapped[float] = mapped_column(Float, nullable=False)
    tariff_per_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    recommended_kwp: Mapped[float] = mapped_column(Float, nullable=False)
    installation_cost: Mapped[float] = mapped_column(Float, nullable=False)
    subsidy_amount: Mapped[float] = mapped_column(Float, nullable=False)
    net_cost: Mapped[float] = mapped_column(Float, nullable=False)
    annual_generation_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    annual_savings: Mapped[float] = mapped_column(Float, nullable=False)
    payback_years: Mapped[float | None] = mapped_column(Float)
    lifetime_savings: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    co2_reduction_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    assumptions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    is_estimate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class GreenJob(TimestampMixin, Base):
    __tablename__ = "green_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    category: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    organization: Mapped[str] = mapped_column(String(180), nullable=False)
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    employment_type: Mapped[str] = mapped_column(String(40), nullable=False, default="FULL_TIME")
    experience_level: Mapped[str] = mapped_column(String(40), nullable=False, default="MID")
    salary_min: Mapped[float | None] = mapped_column(Float)
    salary_max: Mapped[float | None] = mapped_column(Float)
    skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    eligibility: Mapped[str] = mapped_column(Text, nullable=False, default="")
    application_url: Mapped[str | None] = mapped_column(String(500))
    source_name: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    source_url: Mapped[str | None] = mapped_column(String(500))
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="SAMPLE", server_default="SAMPLE", index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class JobApplication(Base):
    __tablename__ = "job_applications"
    __table_args__ = (
        UniqueConstraint("job_id", "user_id", name="uq_job_application_job_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("green_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUBMITTED")
    cover_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    job: Mapped[GreenJob] = relationship()


class FinanceScheme(TimestampMixin, Base):
    __tablename__ = "finance_schemes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str] = mapped_column(String(180), nullable=False)
    scheme_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    eligibility: Mapped[str] = mapped_column(Text, nullable=False)
    benefits: Mapped[str] = mapped_column(Text, nullable=False)
    interest_rate_min: Mapped[float | None] = mapped_column(Float)
    interest_rate_max: Mapped[float | None] = mapped_column(Float)
    rate_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rate_note: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    tenure_months_min: Mapped[int | None] = mapped_column(Integer)
    tenure_months_max: Mapped[int | None] = mapped_column(Integer)
    max_amount: Mapped[float | None] = mapped_column(Float)
    application_url: Mapped[str | None] = mapped_column(String(500))
    source_url: Mapped[str | None] = mapped_column(String(500))
    limitations: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_verified_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="SAMPLE", server_default="SAMPLE", index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Recycler(TimestampMixin, Base):
    __tablename__ = "recyclers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    city: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    accepted_categories: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    capacity_tonnes_per_month: Mapped[float | None] = mapped_column(Float)
    certification: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    contact_email: Mapped[str | None] = mapped_column(String(180))
    contact_phone: Mapped[str | None] = mapped_column(String(40))
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class RecyclingTransaction(TimestampMixin, Base):
    __tablename__ = "recycling_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recycler_id: Mapped[int] = mapped_column(
        ForeignKey("recyclers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    waste_category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(30), index=True, nullable=False, default="LOGGED")
    pickup_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    traceability_code: Mapped[str] = mapped_column(
        String(40), unique=True, index=True, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    material_recovered_kg: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, server_default="0"
    )
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="SAMPLE", server_default="SAMPLE", index=True
    )
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    recycler: Mapped[Recycler] = relationship()


class RecyclingEvent(Base):
    """Append-only traceability trail for a recycling transaction."""

    __tablename__ = "recycling_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("recycling_transactions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_role: Mapped[str] = mapped_column(String(30), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class WeatherForecast(TimestampMixin, Base):
    __tablename__ = "weather_forecasts"
    __table_args__ = (
        UniqueConstraint(
            "location", "forecast_date", name="uq_weather_location_forecast_date"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    forecast_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    temperature_c: Mapped[float] = mapped_column(Float, nullable=False, default=30)
    irradiance_kwh_m2_day: Mapped[float] = mapped_column(Float, nullable=False, default=5)
    wind_speed_ms: Mapped[float] = mapped_column(Float, nullable=False, default=4)
    cloud_cover_pct: Mapped[float] = mapped_column(Float, nullable=False, default=20)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class GenerationForecast(Base):
    __tablename__ = "generation_forecasts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    forecast_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    solar_kwp: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    wind_kwp: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    solar_generation_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    wind_generation_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    method: Mapped[str] = mapped_column(String(60), nullable=False, default="weather_forecast")
    is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class StorageRecommendation(Base):
    __tablename__ = "storage_recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    daily_consumption_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    solar_kwp: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    wind_kwp: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    recommended_battery_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    backup_hours: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_cost: Mapped[float] = mapped_column(Float, nullable=False)
    assumptions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    is_estimate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_email: Mapped[str] = mapped_column(String(255), nullable=False, default="system")
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(80))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
