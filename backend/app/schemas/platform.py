"""Request schemas for the India Green Grid modules."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class RpoTargetCreate(BaseModel):
    entity_type: Literal["DISCOM", "INDUSTRY", "COMMERCIAL", "INSTITUTIONAL"] = "DISCOM"
    entity_name: str = Field(min_length=2, max_length=180)
    entity_code: str = Field(default="", max_length=80)
    state: str = Field(min_length=2, max_length=80)
    year: int = Field(ge=2025, le=2030)
    obligated_energy_mwh: float = Field(gt=0, le=10_000_000)
    solar_target_pct: float = Field(ge=0, le=100)
    non_solar_target_pct: float = Field(ge=0, le=100)
    notes: str = Field(default="", max_length=2000)

    @field_validator("entity_name", "state")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Value must not be blank.")
        return value


class RpoTargetUpdate(BaseModel):
    entity_type: Literal["DISCOM", "INDUSTRY", "COMMERCIAL", "INSTITUTIONAL"] | None = None
    entity_name: str | None = Field(default=None, min_length=2, max_length=180)
    entity_code: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, min_length=2, max_length=80)
    obligated_energy_mwh: float | None = Field(default=None, gt=0, le=10_000_000)
    solar_target_pct: float | None = Field(default=None, ge=0, le=100)
    non_solar_target_pct: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)


class RpoComplianceCreate(BaseModel):
    actual_solar_mwh: float = Field(ge=0, le=100_000_000)
    actual_non_solar_mwh: float = Field(ge=0, le=100_000_000)
    notes: str = Field(default="", max_length=2000)


class SolarCalculationRequest(BaseModel):
    location: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=80)
    customer_type: Literal[
        "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "INSTITUTIONAL", "AGRICULTURAL"
    ] = "RESIDENTIAL"
    monthly_consumption_kwh: float = Field(gt=0, le=10_000_000)
    rooftop_area_sqm: float = Field(gt=0, le=1_000_000)
    tariff_per_kwh: float | None = Field(default=None, gt=0, le=100)
    system_preference: Literal[
        "AUTO", "MAX_ROOF", "MATCH_CONSUMPTION", "CUSTOM"
    ] = "AUTO"
    preferred_kwp: float | None = Field(default=None, gt=0, le=1000)


class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    category: str = Field(min_length=2, max_length=60)
    organization: str = Field(min_length=2, max_length=180)
    location: str = Field(min_length=2, max_length=120)
    state: str = Field(default="", max_length=80)
    employment_type: Literal[
        "FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "APPRENTICESHIP", "REMOTE"
    ] = "FULL_TIME"
    experience_level: Literal["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD"] = "MID"
    salary_min: float | None = Field(default=None, ge=0, le=100_000_000)
    salary_max: float | None = Field(default=None, ge=0, le=100_000_000)
    skills: list[str] = Field(default_factory=list, max_length=20)
    description: str = Field(min_length=10, max_length=5000)
    eligibility: str = Field(default="", max_length=2000)
    application_url: HttpUrl | None = None
    source_name: str = Field(default="", max_length=180)
    source_url: HttpUrl | None = None
    verification_status: Literal[
        "VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED"
    ] = "SAMPLE"
    expires_at: datetime | None = None
    is_active: bool = True


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    category: str | None = Field(default=None, min_length=2, max_length=60)
    organization: str | None = Field(default=None, min_length=2, max_length=180)
    location: str | None = Field(default=None, min_length=2, max_length=120)
    state: str | None = Field(default=None, max_length=80)
    employment_type: str | None = None
    experience_level: str | None = None
    salary_min: float | None = Field(default=None, ge=0)
    salary_max: float | None = Field(default=None, ge=0)
    skills: list[str] | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    eligibility: str | None = Field(default=None, max_length=2000)
    application_url: HttpUrl | None = None
    source_name: str | None = Field(default=None, max_length=180)
    source_url: HttpUrl | None = None
    verification_status: Literal[
        "VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED"
    ] | None = None
    expires_at: datetime | None = None
    is_active: bool | None = None


class JobApplicationRequest(BaseModel):
    cover_note: str = Field(default="", max_length=2000)


class FinanceSchemeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    provider: str = Field(min_length=2, max_length=180)
    scheme_type: Literal["LOAN", "SUBSIDY", "BOND", "LEASE", "MARKET", "GRANT", "GUARANTEE"] = "LOAN"
    category: str = Field(min_length=2, max_length=60)
    description: str = Field(min_length=10, max_length=4000)
    eligibility: str = Field(min_length=5, max_length=2000)
    benefits: str = Field(min_length=5, max_length=2000)
    interest_rate_min: float | None = Field(default=None, ge=0, le=100)
    interest_rate_max: float | None = Field(default=None, ge=0, le=100)
    rate_verified: bool = False
    rate_note: str = Field(default="", max_length=300)
    tenure_months_min: int | None = Field(default=None, ge=0, le=600)
    tenure_months_max: int | None = Field(default=None, ge=0, le=600)
    max_amount: float | None = Field(default=None, ge=0)
    application_url: HttpUrl | None = None
    source_url: HttpUrl | None = None
    limitations: str = Field(default="", max_length=2000)
    last_verified_at: date | None = None
    verification_status: Literal[
        "VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED"
    ] = "SAMPLE"
    is_active: bool = True

    @field_validator("interest_rate_max")
    @classmethod
    def _check_rate(cls, value: float | None, info) -> float | None:
        minimum = info.data.get("interest_rate_min")
        if value is not None and minimum is not None and value < minimum:
            raise ValueError("Maximum rate cannot be below minimum rate.")
        return value


class FinanceSchemeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    provider: str | None = Field(default=None, min_length=2, max_length=180)
    scheme_type: str | None = None
    category: str | None = Field(default=None, min_length=2, max_length=60)
    description: str | None = Field(default=None, min_length=10, max_length=4000)
    eligibility: str | None = Field(default=None, min_length=5, max_length=2000)
    benefits: str | None = Field(default=None, min_length=5, max_length=2000)
    interest_rate_min: float | None = Field(default=None, ge=0, le=100)
    interest_rate_max: float | None = Field(default=None, ge=0, le=100)
    rate_verified: bool | None = None
    rate_note: str | None = Field(default=None, max_length=300)
    tenure_months_min: int | None = Field(default=None, ge=0, le=600)
    tenure_months_max: int | None = Field(default=None, ge=0, le=600)
    max_amount: float | None = Field(default=None, ge=0)
    application_url: HttpUrl | None = None
    source_url: HttpUrl | None = None
    limitations: str | None = Field(default=None, max_length=2000)
    last_verified_at: date | None = None
    verification_status: Literal[
        "VERIFIED_EXTERNAL", "SAMPLE", "UNVERIFIED"
    ] | None = None
    is_active: bool | None = None


class RecyclingTransactionCreate(BaseModel):
    recycler_id: int = Field(gt=0)
    waste_category: Literal[
        "SOLAR_PANEL",
        "EWASTE",
        "EV_BATTERY",
        "LITHIUM_ION",
        "LEAD_ACID",
        "IT_EQUIPMENT",
        "CABLES",
        "GLASS",
        "ALUMINIUM",
    ]
    quantity_kg: float = Field(gt=0, le=10_000_000)
    pickup_date: date | None = None
    notes: str = Field(default="", max_length=2000)


class RecyclingTransactionUpdate(BaseModel):
    status: Literal[
        "LOGGED", "SCHEDULED", "IN_TRANSIT", "RECYCLED", "CANCELLED"
    ] | None = None
    pickup_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    material_recovered_kg: float | None = Field(default=None, ge=0, le=10_000_000)
    verification_status: Literal["VERIFIED", "SAMPLE", "REJECTED"] | None = None


class RecyclerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    address: str = Field(default="", max_length=300)
    accepted_categories: list[str] = Field(min_length=1, max_length=10)
    capacity_tonnes_per_month: float | None = Field(default=None, ge=0)
    certification: str = Field(default="", max_length=180)
    contact_email: str | None = Field(default=None, max_length=180)
    contact_phone: str | None = Field(default=None, max_length=40)
    is_verified: bool = False


class RecyclerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    city: str | None = Field(default=None, min_length=2, max_length=80)
    state: str | None = Field(default=None, min_length=2, max_length=80)
    address: str | None = Field(default=None, max_length=300)
    accepted_categories: list[str] | None = Field(default=None, max_length=10)
    capacity_tonnes_per_month: float | None = Field(default=None, ge=0)
    certification: str | None = Field(default=None, max_length=180)
    contact_email: str | None = Field(default=None, max_length=180)
    contact_phone: str | None = Field(default=None, max_length=40)
    is_verified: bool | None = None


class ForecastEstimateRequest(BaseModel):
    location: str = Field(min_length=2, max_length=120)
    solar_kwp: float = Field(ge=0, le=100_000)
    wind_kwp: float = Field(default=0, ge=0, le=100_000)
    daily_consumption_kwh: float = Field(gt=0, le=1_000_000)
    backup_hours: float = Field(default=4, ge=0, le=24)


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = None
    organization: str | None = Field(default=None, max_length=160)
    state: str | None = Field(default=None, max_length=80)
    is_active: bool | None = None
    verification_status: Literal["VERIFIED", "PENDING", "REJECTED"] | None = None
    verification_note: str | None = Field(default=None, max_length=500)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    organization: str | None = Field(default=None, max_length=160)
    state: str | None = Field(default=None, max_length=80)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def _bcrypt_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 UTF-8 bytes.")
        return value
