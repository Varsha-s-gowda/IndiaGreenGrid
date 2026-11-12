"""Request and response schemas for the BillFair billing APIs.

The response models mirror the service payloads one-for-one.  They are defined
with ``extra="allow"`` so additive fields (for example future audit details) do
not break clients, while the core contract stays documented and validated.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

AllocationMethodLiteral = Literal[
    "EQUAL_SHARE", "CONSUMPTION_BASED", "OWNERSHIP_BASED"
]
BillStatusLiteral = Literal["ISSUED", "SUPERSEDED", "VOID"]
AuditStatusLiteral = Literal["PASS", "WARNING", "FAIL", "REVIEWED"]
AuditCheckTypeLiteral = Literal[
    "BILL_RECALCULATION",
    "CONSUMPTION",
    "SOLAR_ALLOCATION",
    "GRID_IMPORT",
    "TARIFF",
    "GRID_CHARGE",
    "SOLAR_CREDIT",
    "MAINTENANCE",
    "OTHER_CHARGES",
    "NET_PAYABLE",
    "SAVINGS",
    "LINE_ITEMS",
    "MISSING_BILL",
    "DUPLICATE_BILL",
]


class _Payload(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="allow")


class BillGenerateRequest(BaseModel):
    allocation_run_id: int | None = Field(default=None, ge=1)
    simulation_run_id: int | None = Field(default=None, ge=1)
    method: AllocationMethodLiteral | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    billing_month: str | None = Field(
        default=None,
        description="Convenience month selector formatted as YYYY-MM.",
        pattern=r"^\d{4}-\d{2}$",
    )
    flat_id: int | None = Field(default=None, ge=1)
    flat_number: str | None = Field(default=None, max_length=20)
    save: bool = Field(
        default=False,
        description="Preview when false; persist issued bills when true.",
    )
    recalculate: bool = Field(
        default=False,
        description="Intentionally supersede current bills and create a new version.",
    )
    allow_incomplete: bool = Field(
        default=False,
        description="Allow billing apartments with missing hourly allocation records.",
    )
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _check_period(self) -> "BillGenerateRequest":
        if self.billing_month and (self.billing_period_start or self.billing_period_end):
            raise ValueError(
                "Provide either billing_month or explicit billing period dates, not both."
            )
        if (
            self.billing_period_start is not None
            and self.billing_period_end is not None
            and self.billing_period_end < self.billing_period_start
        ):
            raise ValueError("billing_period_end must be on or after start.")
        if self.flat_id is not None and self.flat_number is not None:
            raise ValueError("Provide either flat_id or flat_number, not both.")
        return self


class ApartmentPayload(_Payload):
    id: int
    flat_number: str
    floor_number: int
    apartment_category: str
    residents_count: int | None = None
    consumption_profile: str | None = None


class ActorPayload(_Payload):
    id: int
    name: str
    email: str


class LineItemPayload(_Payload):
    id: int | None = None
    charge_type: str
    description: str
    quantity: float
    unit: str
    rate: float
    amount: float
    sort_order: int


class AuditBriefPayload(_Payload):
    id: int
    status: str
    check_type: str
    explanation: str
    reviewed_at: datetime | None = None


class BillPayload(_Payload):
    id: int | None = None
    bill_number: str | None = None
    duplicate: bool = False
    status: str
    is_current: bool = False
    version: int = 0
    supersedes_bill_id: int | None = None
    apartment_id: int
    apartment: ApartmentPayload | None = None
    resident: ActorPayload | None = None
    allocation_run_id: int
    simulation_run_id: int
    allocation_method: str
    allocation_method_label: str
    billing_configuration_id: int | None = None
    billing_period_start: date
    billing_period_end: date
    billing_period_label: str
    consumption_kwh: float
    solar_allocation_kwh: float
    grid_import_kwh: float
    solar_coverage_percentage: float
    tariff_price_per_kwh: float
    solar_credit_rate_per_kwh: float
    grid_charge: float
    solar_credit: float
    maintenance_charge: float
    other_charges: float
    other_charges_description: str | None = None
    net_payable: float
    no_solar_baseline_cost: float
    actual_estimated_cost: float
    estimated_savings: float
    hour_count: int
    algorithm_version: str
    input_hash: str
    tariff_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    charge_snapshot: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    generated_at: datetime | None = None
    issued_at: datetime | None = None
    created_at: datetime | None = None
    generated_by: ActorPayload | None = None
    latest_audit: AuditBriefPayload | None = None
    disclaimer: str | None = None
    line_items: list[LineItemPayload] = Field(default_factory=list)


class AllocationRunBrief(_Payload):
    id: int
    simulation_run_id: int
    method: str
    method_label: str
    date_from: date
    date_to: date
    algorithm_version: str
    input_hash: str


class BillingPeriodPayload(_Payload):
    start: date
    end: date
    label: str
    days: int
    requested_month: str | None = None
    partial_month: bool = False
    allocation_run_id: int
    simulation_run_id: int
    allocation_method: str
    allocation_method_label: str


class BillTotalsPayload(_Payload):
    apartment_count: int
    consumption_kwh: float
    solar_allocation_kwh: float
    grid_import_kwh: float
    grid_charge: float
    solar_credit: float
    maintenance_charge: float
    other_charges: float
    net_payable: float
    estimated_savings: float
    no_solar_baseline_cost: float
    actual_estimated_cost: float
    average_net_payable: float
    average_estimated_savings: float
    solar_coverage_percentage: float


class GenerateResponse(_Payload):
    saved: bool
    duplicate: bool
    recalculated: bool
    allocation_run_id: int
    simulation_run_id: int
    allocation_run: AllocationRunBrief
    billing_period: BillingPeriodPayload
    apartments_requested: int
    apartments_generated: int
    duplicate_count: int
    superseded_count: int
    usage_report: dict[str, Any]
    tariff_revisions: list[dict[str, Any]]
    billing_configurations: list[dict[str, Any]]
    warnings: list[str] = Field(default_factory=list)
    totals: BillTotalsPayload
    bills: list[BillPayload]
    generated_at: datetime | None = None
    generated_by: ActorPayload | None = None
    status: str


class PeriodSummaryPayload(_Payload):
    start: date
    end: date
    label: str
    bills: int


class AvailableRunPayload(_Payload):
    id: int
    simulation_run_id: int
    method: str
    method_label: str
    status: str
    date_from: date
    date_to: date
    total_allocated_kwh: float
    tariff_price_per_kwh: float
    algorithm_version: str
    input_hash: str
    created_at: datetime


class TariffRevisionPayload(_Payload):
    id: int
    price_per_kwh: float
    effective_from: date
    effective_to: date | None = None


class BillingConfigurationPayload(_Payload):
    id: int
    name: str
    solar_credit_rate_per_kwh: float
    maintenance_charge: float
    other_charges: float
    other_charges_description: str | None = None
    effective_from: date
    effective_to: date | None = None
    created_at: datetime | None = None


class SummaryResponse(_Payload):
    scope: str
    apartment: ApartmentPayload | None = None
    totals: BillTotalsPayload
    bills_generated: int
    apartments_billed: int
    pending_audit_issues: int
    last_audit_at: datetime | None = None
    latest_bill_at: datetime | None = None
    bills: list[BillPayload]
    apartments: list[BillPayload]
    periods: list[PeriodSummaryPayload]
    available_runs: list[AvailableRunPayload]
    tariff_revisions: list[TariffRevisionPayload]
    billing_configurations: list[BillingConfigurationPayload]
    latest_configuration: BillingConfigurationPayload | None = None
    disclaimer: str


class FlatDetailResponse(_Payload):
    apartment: ApartmentPayload
    resident: ActorPayload | None = None
    bill: BillPayload | None = None
    bills: list[BillPayload]
    history_count: int
    filters: dict[str, Any]


class BillListResponse(_Payload):
    total: int
    limit: int
    offset: int
    items: list[BillPayload]


class BillHistoryResponse(_Payload):
    apartment: ApartmentPayload
    total: int
    limit: int
    offset: int
    items: list[BillPayload]


class AuditRunRequest(BaseModel):
    allocation_run_id: int | None = Field(default=None, ge=1)
    simulation_run_id: int | None = Field(default=None, ge=1)
    method: AllocationMethodLiteral | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    billing_month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    bill_ids: list[int] | None = Field(default=None, max_length=200)
    include_passed: bool = True

    @model_validator(mode="after")
    def _check(self) -> "AuditRunRequest":
        if self.billing_month and (self.billing_period_start or self.billing_period_end):
            raise ValueError(
                "Provide either billing_month or explicit billing period dates, not both."
            )
        if self.bill_ids and (
            self.allocation_run_id
            or self.simulation_run_id
            or self.billing_period_start
            or self.billing_period_end
            or self.billing_month
        ):
            raise ValueError(
                "bill_ids cannot be combined with run or period selectors."
            )
        return self


class AuditPayload(_Payload):
    id: int
    audit_batch_id: str
    bill_id: int | None = None
    bill_number: str | None = None
    apartment_id: int | None = None
    flat_number: str | None = None
    allocation_run_id: int | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    check_type: str
    status: str
    severity: str
    expected_amount: float | None = None
    calculated_amount: float | None = None
    discrepancy: float | None = None
    explanation: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    created_by: ActorPayload | None = None
    reviewed_at: datetime | None = None
    reviewed_by: ActorPayload | None = None
    review_note: str | None = None


class AuditRunResponse(_Payload):
    audit_batch_id: str
    allocation_run_id: int
    simulation_run_id: int
    allocation_method: str
    billing_period_start: date
    billing_period_end: date
    bills_audited: int
    passed: int
    failed: int
    missing_bills: int
    duplicate_bills: int
    issues_found: int
    include_passed: bool
    findings: list[AuditPayload]
    created_at: datetime
    created_by: ActorPayload | None = None
    message: str


class AuditListResponse(_Payload):
    total: int
    limit: int
    offset: int
    items: list[AuditPayload]
    status_counts: dict[str, int] = Field(default_factory=dict)


class AuditReviewRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class BillingConfigurationCreate(BaseModel):
    name: str = Field(default="Society billing rules", min_length=2, max_length=120)
    solar_credit_rate_per_kwh: float = Field(ge=0, le=1000)
    maintenance_charge: float = Field(ge=0, le=10_000_000)
    other_charges: float = Field(ge=0, le=10_000_000)
    other_charges_description: str | None = Field(default=None, max_length=255)
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def _check_dates(self) -> "BillingConfigurationCreate":
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to must be on or after effective_from.")
        return self


class TariffRevisionCreate(BaseModel):
    price_per_kwh: float = Field(gt=0, le=1000)
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def _check_dates(self) -> "TariffRevisionCreate":
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to must be on or after effective_from.")
        return self


class BillingSettingsResponse(_Payload):
    tariff_revisions: list[TariffRevisionPayload]
    billing_configurations: list[BillingConfigurationPayload]
    latest_configuration: BillingConfigurationPayload | None = None
    disclaimer: str
