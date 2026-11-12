"""Pydantic schemas for the multi-stakeholder ecosystem workflows."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

SolarPropertyType = Literal["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "INSTITUTIONAL"]
EnergyType = Literal["SOLAR", "WIND", "HYDRO", "OTHER", "ANY"]
WasteCategory = Literal["LITHIUM_ION", "EV_BATTERY", "SOLAR_PANEL", "EWASTE", "LEAD_ACID", "OTHER"]
OrganisationType = Literal[
    "DISCOM",
    "INDUSTRY",
    "FINANCIAL_INSTITUTION",
    "SOLAR_INSTALLER",
    "RENEWABLE_SUPPLIER",
    "RECYCLER",
    "POLICYMAKER",
]


def _clean(value: str) -> str:
    return " ".join(value.split())


class OrganisationProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    registration_number: str | None = Field(default=None, max_length=120)
    gstin: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, max_length=12)
    contact_email: str | None = Field(default=None, max_length=180)
    contact_phone: str | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    services: list[str] | None = None
    serviceable_states: list[str] | None = None
    capacity_kwp: float | None = Field(default=None, ge=0, le=1_000_000)
    accepted_categories: list[WasteCategory] | None = None
    energy_types: list[EnergyType] | None = None
    pickup_availability: dict | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        return _clean(value) if value else value


class SolarInstallationRequestCreate(BaseModel):
    project_title: str = Field(min_length=3, max_length=180)
    property_type: SolarPropertyType = "RESIDENTIAL"
    address: str = Field(min_length=5, max_length=500)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    pincode: str = Field(default="", max_length=12)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    roof_area_sqm: float = Field(gt=0, le=1_000_000)
    monthly_consumption_kwh: float = Field(gt=0, le=10_000_000)
    desired_capacity_kwp: float = Field(gt=0, le=100_000)
    additional_requirements: str = Field(default="", max_length=4000)
    solar_calculation_id: int | None = None
    installer_id: int | None = None


class SolarRequestDecision(BaseModel):
    note: str = Field(default="", max_length=2000)


class SolarQuotationCreate(BaseModel):
    price: float = Field(gt=0, le=1_000_000_000)
    system_capacity_kwp: float = Field(gt=0, le=100_000)
    equipment_details: str = Field(default="", max_length=4000)
    panel_details: str = Field(default="", max_length=2000)
    inverter_details: str = Field(default="", max_length=2000)
    installation_duration_days: int = Field(default=30, ge=1, le=3650)
    warranty_years: int = Field(default=5, ge=0, le=50)
    description: str = Field(default="", max_length=4000)
    valid_until: date | None = None


class InspectionSchedule(BaseModel):
    scheduled_at: datetime
    note: str = Field(default="", max_length=2000)


class InstallationProgressUpdate(BaseModel):
    status: Literal["STARTED", "COMPLETED", "ON_HOLD"] | None = None
    progress_pct: int | None = Field(default=None, ge=0, le=100)
    milestone: str | None = Field(default=None, max_length=300)
    completion_notes: str | None = Field(default=None, max_length=4000)


class ComplianceRecordCreate(BaseModel):
    entity_name: str = Field(min_length=2, max_length=180)
    state: str = Field(min_length=2, max_length=80)
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)
    obligated_energy_mwh: float = Field(ge=0, le=100_000_000)
    solar_mwh: float = Field(default=0, ge=0, le=100_000_000)
    wind_mwh: float = Field(default=0, ge=0, le=100_000_000)
    hydro_mwh: float = Field(default=0, ge=0, le=100_000_000)
    other_mwh: float = Field(default=0, ge=0, le=100_000_000)
    rpo_target_pct: float = Field(ge=0, le=100)
    notes: str = Field(default="", max_length=4000)

    @field_validator("entity_name", "state")
    @classmethod
    def _clean_required(cls, value: str) -> str:
        value = _clean(value)
        if not value:
            raise ValueError("Value must not be blank.")
        return value


class ComplianceReview(BaseModel):
    status: Literal["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "REVISION_REQUIRED"]
    note: str = Field(default="", max_length=4000)


class ProcurementRequestCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    energy_type: EnergyType = "ANY"
    quantity_mwh: float = Field(gt=0, le=100_000_000)
    delivery_start: date | None = None
    delivery_end: date | None = None
    delivery_location: str = Field(default="", max_length=180)
    max_price_per_mwh: float = Field(default=0, ge=0, le=10_000_000)
    description: str = Field(default="", max_length=4000)


class ProcurementRequestUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    energy_type: EnergyType | None = None
    quantity_mwh: float | None = Field(default=None, gt=0, le=100_000_000)
    delivery_start: date | None = None
    delivery_end: date | None = None
    delivery_location: str | None = Field(default=None, max_length=180)
    max_price_per_mwh: float | None = Field(default=None, ge=0, le=10_000_000)
    description: str | None = Field(default=None, max_length=4000)
    status: Literal["DRAFT", "OPEN", "UNDER_REVIEW", "CLOSED", "CANCELLED"] | None = None


class SupplierQuotationCreate(BaseModel):
    quantity_mwh: float = Field(gt=0, le=100_000_000)
    price_per_mwh: float = Field(gt=0, le=10_000_000)
    delivery_period_days: int = Field(default=30, ge=1, le=3650)
    delivery_start: date | None = None
    delivery_end: date | None = None
    terms: str = Field(default="", max_length=4000)


class ProcurementAward(BaseModel):
    quotation_id: int
    note: str = Field(default="", max_length=2000)


class LoanProductCreate(BaseModel):
    name: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=4000)
    interest_rate_min: float = Field(ge=0, le=100)
    interest_rate_max: float = Field(ge=0, le=100)
    min_amount: float = Field(gt=0, le=10_000_000_000)
    max_amount: float = Field(gt=0, le=10_000_000_000)
    tenure_months_min: int = Field(default=12, ge=1, le=600)
    tenure_months_max: int = Field(default=120, ge=1, le=600)
    eligibility: str = Field(default="", max_length=4000)
    required_documents: list[str] = Field(default_factory=list)
    processing_fee_pct: float = Field(default=0, ge=0, le=100)
    is_active: bool = False

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        return _clean(value)


class LoanProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    interest_rate_min: float | None = Field(default=None, ge=0, le=100)
    interest_rate_max: float | None = Field(default=None, ge=0, le=100)
    min_amount: float | None = Field(default=None, gt=0)
    max_amount: float | None = Field(default=None, gt=0)
    tenure_months_min: int | None = Field(default=None, ge=1, le=600)
    tenure_months_max: int | None = Field(default=None, ge=1, le=600)
    eligibility: str | None = Field(default=None, max_length=4000)
    required_documents: list[str] | None = None
    processing_fee_pct: float | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None


class LoanApplicationCreate(BaseModel):
    product_id: int
    loan_amount: float = Field(gt=0, le=10_000_000_000)
    project_purpose: str = Field(min_length=3, max_length=180)
    location: str = Field(default="", max_length=180)
    state: str = Field(default="", max_length=80)


class LoanDecision(BaseModel):
    status: Literal[
        "UNDER_REVIEW",
        "DOCUMENTS_REQUESTED",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
    ]
    note: str = Field(default="", max_length=4000)


class RecyclingRequestCreate(BaseModel):
    waste_category: WasteCategory
    estimated_weight_kg: float = Field(gt=0, le=1_000_000)
    address: str = Field(min_length=5, max_length=500)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    pincode: str = Field(default="", max_length=12)
    preferred_pickup_date: date | None = None
    description: str = Field(default="", max_length=4000)
    recycler_id: int | None = None


class RecyclingDecision(BaseModel):
    note: str = Field(default="", max_length=2000)


class OrganisationReview(BaseModel):
    action: Literal[
        "APPROVE", "REJECT", "REQUEST_DOCUMENTS", "SUSPEND", "REACTIVATE"
    ]
    note: str = Field(default="", max_length=4000)


class PickupSchedule(BaseModel):
    scheduled_pickup_at: datetime
    assigned_personnel: str = Field(default="", max_length=180)
    note: str = Field(default="", max_length=2000)


class CollectionUpdate(BaseModel):
    actual_weight_kg: float = Field(gt=0, le=1_000_000)
    note: str = Field(default="", max_length=2000)


class ProcessingUpdate(BaseModel):
    processing_details: str = Field(min_length=3, max_length=4000)
    recovered_materials: list[dict] = Field(default_factory=list)
    note: str = Field(default="", max_length=2000)


class QuotationWithdraw(BaseModel):
    note: str = Field(default="", max_length=2000)
