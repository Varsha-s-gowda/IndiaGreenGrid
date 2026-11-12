"""Transactional models for the multi-stakeholder renewable-energy ecosystem.

These tables back the five connected workflows:

* citizen <-> solar installer
* DISCOM <-> renewable-energy supplier
* citizen <-> financial institution
* citizen <-> recycler
* administrator <-> every stakeholder

Business rules live in ``app.services``; these models stay declarative so that
the API can return finished figures to the React client.
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
from app.models.green_grid import TimestampMixin

SOLAR_REQUEST_STATUSES = (
    "REQUESTED",
    "ACCEPTED",
    "INSPECTION_SCHEDULED",
    "QUOTATION_SUBMITTED",
    "QUOTE_ACCEPTED",
    "INSTALLATION_STARTED",
    "INSTALLATION_COMPLETED",
    "CANCELLED",
    "REJECTED",
)
SOLAR_QUOTATION_STATUSES = ("SUBMITTED", "ACCEPTED", "REJECTED", "WITHDRAWN")
SOLAR_INSTALLATION_STATUSES = ("PENDING", "STARTED", "COMPLETED", "ON_HOLD")

COMPLIANCE_STATUSES = (
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "VERIFIED",
    "REJECTED",
    "REVISION_REQUIRED",
)
PROCUREMENT_STATUSES = (
    "DRAFT",
    "OPEN",
    "QUOTATION_RECEIVED",
    "UNDER_REVIEW",
    "AWARDED",
    "CLOSED",
    "CANCELLED",
)
SUPPLIER_QUOTATION_STATUSES = (
    "SUBMITTED",
    "SHORTLISTED",
    "AWARDED",
    "REJECTED",
    "WITHDRAWN",
)
LOAN_APPLICATION_STATUSES = (
    "SUBMITTED",
    "UNDER_REVIEW",
    "DOCUMENTS_REQUESTED",
    "DOCUMENTS_RESUBMITTED",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
)
LOAN_PRODUCT_STATUSES = ("DRAFT", "ACTIVE", "INACTIVE")
RECYCLING_REQUEST_STATUSES = (
    "REQUESTED",
    "ACCEPTED",
    "PICKUP_SCHEDULED",
    "COLLECTED",
    "PROCESSING",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
)
ORGANISATION_STATUSES = ("PENDING", "VERIFIED", "REJECTED", "SUSPENDED")
DOCUMENT_ENTITY_TYPES = (
    "ORGANISATION",
    "SOLAR_REQUEST",
    "SOLAR_INSTALLATION",
    "LOAN_APPLICATION",
    "RECYCLING_REQUEST",
    "PROCUREMENT_REQUEST",
)
DOCUMENT_STATUSES = ("UPLOADED", "ACCEPTED", "REJECTED")

ORGANISATION_TYPES = (
    "DISCOM",
    "INDUSTRY",
    "FINANCIAL_INSTITUTION",
    "SOLAR_INSTALLER",
    "RENEWABLE_SUPPLIER",
    "RECYCLER",
    "POLICYMAKER",
)

WASTE_CATEGORIES = (
    "LITHIUM_ION",
    "EV_BATTERY",
    "SOLAR_PANEL",
    "EWASTE",
    "LEAD_ACID",
    "OTHER",
)

ENERGY_TYPES = ("SOLAR", "WIND", "HYDRO", "OTHER", "ANY")


class OrganisationProfile(TimestampMixin, Base):
    """Business profile attached to every organisational account."""

    __tablename__ = "organisation_profiles"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')",
            name="ck_org_profile_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    organisation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    registration_number: Mapped[str] = mapped_column(
        String(120), nullable=False, default="", server_default=""
    )
    gstin: Mapped[str] = mapped_column(
        String(40), nullable=False, default="", server_default=""
    )
    address: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    city: Mapped[str] = mapped_column(String(80), nullable=False, default="", server_default="")
    state: Mapped[str] = mapped_column(String(80), nullable=False, default="", server_default="")
    pincode: Mapped[str] = mapped_column(String(12), nullable=False, default="", server_default="")
    contact_email: Mapped[str] = mapped_column(String(180), nullable=False, default="", server_default="")
    contact_phone: Mapped[str] = mapped_column(String(40), nullable=False, default="", server_default="")
    website: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    services: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    serviceable_states: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    capacity_kwp: Mapped[float | None] = mapped_column(Float)
    accepted_categories: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    energy_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    pickup_availability: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    verification_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING", server_default="PENDING", index=True
    )
    verification_note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    verified_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])  # noqa: F821


class OrganisationVerification(Base):
    """Append-only verification decision history."""

    __tablename__ = "organisation_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    status_after: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class ApplicationDocument(TimestampMixin, Base):
    """A validated uploaded document, linked polymorphically to one record."""

    __tablename__ = "application_documents"
    __table_args__ = (
        CheckConstraint("size_bytes >= 0", name="ck_application_document_size"),
        CheckConstraint(
            "status IN ('UPLOADED','ACCEPTED','REJECTED')",
            name="ck_application_document_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(String(80), nullable=False, default="SUPPORTING")
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="UPLOADED", server_default="UPLOADED"
    )
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")


class SolarInstallationRequest(TimestampMixin, Base):
    __tablename__ = "solar_installation_requests"
    __table_args__ = (
        CheckConstraint("roof_area_sqm > 0", name="ck_solar_request_roof_area"),
        CheckConstraint("monthly_consumption_kwh > 0", name="ck_solar_request_consumption"),
        CheckConstraint("desired_capacity_kwp > 0", name="ck_solar_request_capacity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    citizen_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    installer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    solar_calculation_id: Mapped[int | None] = mapped_column(
        ForeignKey("solar_calculations.id", ondelete="SET NULL"), nullable=True
    )
    reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    project_title: Mapped[str] = mapped_column(String(180), nullable=False)
    property_type: Mapped[str] = mapped_column(String(40), nullable=False, default="RESIDENTIAL")
    address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    pincode: Mapped[str] = mapped_column(String(12), nullable=False, default="", server_default="")
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    roof_area_sqm: Mapped[float] = mapped_column(Float, nullable=False)
    monthly_consumption_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    desired_capacity_kwp: Mapped[float] = mapped_column(Float, nullable=False)
    additional_requirements: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="REQUESTED", server_default="REQUESTED", index=True
    )
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    cancellation_reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    inspection_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    citizen: Mapped["User"] = relationship(foreign_keys=[citizen_id])  # noqa: F821
    installer: Mapped["User | None"] = relationship(foreign_keys=[installer_id])  # noqa: F821
    organisation: Mapped[OrganisationProfile | None] = relationship(foreign_keys=[organisation_id])
    quotations: Mapped[list["SolarQuotation"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", passive_deletes=True
    )
    installation: Mapped["SolarInstallation | None"] = relationship(
        back_populates="request", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )


class SolarQuotation(TimestampMixin, Base):
    __tablename__ = "solar_quotations"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_solar_quotation_price"),
        CheckConstraint("system_capacity_kwp > 0", name="ck_solar_quotation_capacity"),
        UniqueConstraint("request_id", "installer_id", name="uq_solar_quotation_request_installer"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("solar_installation_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    installer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True
    )
    price: Mapped[float] = mapped_column(Float, nullable=False)
    system_capacity_kwp: Mapped[float] = mapped_column(Float, nullable=False)
    equipment_details: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    panel_details: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    inverter_details: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    installation_duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    warranty_years: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    valid_until: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="SUBMITTED", server_default="SUBMITTED", index=True
    )

    request: Mapped[SolarInstallationRequest] = relationship(back_populates="quotations")
    installer: Mapped["User"] = relationship(foreign_keys=[installer_id])  # noqa: F821
    organisation: Mapped[OrganisationProfile | None] = relationship(
        foreign_keys=[organisation_id]
    )


class SolarInstallation(TimestampMixin, Base):
    __tablename__ = "solar_installations"
    __table_args__ = (
        UniqueConstraint("request_id", name="uq_solar_installation_request"),
        CheckConstraint("progress_pct BETWEEN 0 AND 100", name="ck_solar_installation_progress"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("solar_installation_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int | None] = mapped_column(
        ForeignKey("solar_quotations.id", ondelete="SET NULL"), nullable=True
    )
    citizen_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    installer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING", server_default="PENDING", index=True
    )
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    milestones: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completion_notes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    request: Mapped[SolarInstallationRequest] = relationship(back_populates="installation")
    quotation: Mapped[SolarQuotation | None] = relationship()
    citizen: Mapped["User"] = relationship(foreign_keys=[citizen_id])  # noqa: F821
    installer: Mapped["User"] = relationship(foreign_keys=[installer_id])  # noqa: F821


class EnergyComplianceRecord(TimestampMixin, Base):
    """Monthly RPO filing for a DISCOM / obligated entity."""

    __tablename__ = "energy_compliance_records"
    __table_args__ = (
        UniqueConstraint("owner_id", "period_year", "period_month", name="uq_compliance_owner_period"),
        CheckConstraint("period_month BETWEEN 1 AND 12", name="ck_compliance_month"),
        CheckConstraint("obligated_energy_mwh >= 0", name="ck_compliance_obligated"),
        CheckConstraint("solar_mwh >= 0", name="ck_compliance_solar"),
        CheckConstraint("wind_mwh >= 0", name="ck_compliance_wind"),
        CheckConstraint("hydro_mwh >= 0", name="ck_compliance_hydro"),
        CheckConstraint("other_mwh >= 0", name="ck_compliance_other"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True
    )
    entity_name: Mapped[str] = mapped_column(String(180), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    obligated_energy_mwh: Mapped[float] = mapped_column(Float, nullable=False)
    solar_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    wind_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    hydro_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    other_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    rpo_target_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    required_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    actual_renewable_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    compliance_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    shortfall_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DRAFT", server_default="DRAFT", index=True
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])  # noqa: F821
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by_id])  # noqa: F821


class RenewableProcurementRequest(TimestampMixin, Base):
    __tablename__ = "renewable_procurement_requests"
    __table_args__ = (
        CheckConstraint("quantity_mwh > 0", name="ck_procurement_quantity"),
        CheckConstraint("max_price_per_mwh >= 0", name="ck_procurement_price"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    discom_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True
    )
    reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    energy_type: Mapped[str] = mapped_column(String(30), nullable=False, default="ANY")
    quantity_mwh: Mapped[float] = mapped_column(Float, nullable=False)
    delivery_start: Mapped[date | None] = mapped_column(Date)
    delivery_end: Mapped[date | None] = mapped_column(Date)
    delivery_location: Mapped[str] = mapped_column(String(180), nullable=False, default="", server_default="")
    max_price_per_mwh: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DRAFT", server_default="DRAFT", index=True
    )
    awarded_quotation_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    awarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    discom: Mapped["User"] = relationship(foreign_keys=[discom_id])  # noqa: F821
    quotations: Mapped[list["SupplierQuotation"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="SupplierQuotation.request_id",
    )


class SupplierQuotation(TimestampMixin, Base):
    __tablename__ = "supplier_quotations"
    __table_args__ = (
        UniqueConstraint("request_id", "supplier_id", name="uq_supplier_quotation_request_supplier"),
        CheckConstraint("quantity_mwh > 0", name="ck_supplier_quotation_quantity"),
        CheckConstraint("price_per_mwh > 0", name="ck_supplier_quotation_price"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("renewable_procurement_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True
    )
    quantity_mwh: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_mwh: Mapped[float] = mapped_column(Float, nullable=False)
    total_price: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    delivery_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    delivery_start: Mapped[date | None] = mapped_column(Date)
    delivery_end: Mapped[date | None] = mapped_column(Date)
    terms: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="SUBMITTED", server_default="SUBMITTED", index=True
    )

    request: Mapped[RenewableProcurementRequest] = relationship(
        back_populates="quotations", foreign_keys=[request_id]
    )
    supplier: Mapped["User"] = relationship(foreign_keys=[supplier_id])  # noqa: F821
    organisation: Mapped[OrganisationProfile | None] = relationship(
        foreign_keys=[organisation_id]
    )


class GreenLoanProduct(TimestampMixin, Base):
    __tablename__ = "green_loan_products"
    __table_args__ = (
        UniqueConstraint("institution_id", "name", name="uq_loan_product_institution_name"),
        CheckConstraint("min_amount > 0", name="ck_loan_product_min_amount"),
        CheckConstraint("max_amount >= min_amount", name="ck_loan_product_amount_range"),
        CheckConstraint("interest_rate_min >= 0", name="ck_loan_product_rate"),
        CheckConstraint("interest_rate_max >= interest_rate_min", name="ck_loan_product_rate_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    interest_rate_min: Mapped[float] = mapped_column(Float, nullable=False)
    interest_rate_max: Mapped[float] = mapped_column(Float, nullable=False)
    min_amount: Mapped[float] = mapped_column(Float, nullable=False)
    max_amount: Mapped[float] = mapped_column(Float, nullable=False)
    tenure_months_min: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    tenure_months_max: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    eligibility: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    required_documents: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    processing_fee_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="DRAFT", server_default="DRAFT", index=True
    )

    applications: Mapped[list["GreenLoanApplication"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", passive_deletes=True
    )

    institution: Mapped["User"] = relationship(foreign_keys=[institution_id])  # noqa: F821
    organisation: Mapped[OrganisationProfile | None] = relationship(
        foreign_keys=[organisation_id]
    )


class GreenLoanApplication(TimestampMixin, Base):
    __tablename__ = "green_loan_applications"
    __table_args__ = (
        CheckConstraint("loan_amount > 0", name="ck_loan_application_amount"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("green_loan_products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    citizen_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    loan_amount: Mapped[float] = mapped_column(Float, nullable=False)
    project_purpose: Mapped[str] = mapped_column(String(180), nullable=False)
    location: Mapped[str] = mapped_column(String(180), nullable=False, default="", server_default="")
    state: Mapped[str] = mapped_column(String(80), nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="SUBMITTED", server_default="SUBMITTED", index=True
    )
    review_note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    decision_note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped[GreenLoanProduct] = relationship(back_populates="applications")
    citizen: Mapped["User"] = relationship(foreign_keys=[citizen_id])  # noqa: F821
    institution: Mapped["User"] = relationship(foreign_keys=[institution_id])  # noqa: F821


class RecyclingRequest(TimestampMixin, Base):
    __tablename__ = "recycling_requests"
    __table_args__ = (
        CheckConstraint("estimated_weight_kg > 0", name="ck_recycling_request_weight"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    citizen_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recycler_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisation_profiles.id", ondelete="SET NULL"), nullable=True
    )
    waste_category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    estimated_weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    actual_weight_kg: Mapped[float | None] = mapped_column(Float)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    pincode: Mapped[str] = mapped_column(String(12), nullable=False, default="", server_default="")
    preferred_pickup_date: Mapped[date | None] = mapped_column(Date)
    scheduled_pickup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="REQUESTED", server_default="REQUESTED", index=True
    )
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    cancellation_reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    assigned_personnel: Mapped[str] = mapped_column(String(180), nullable=False, default="", server_default="")
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_details: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    recovered_materials: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    certificate_code: Mapped[str | None] = mapped_column(String(60), unique=True, nullable=True)

    citizen: Mapped["User"] = relationship(foreign_keys=[citizen_id])  # noqa: F821
    recycler: Mapped["User | None"] = relationship(foreign_keys=[recycler_id])  # noqa: F821
    organisation: Mapped[OrganisationProfile | None] = relationship(
        foreign_keys=[organisation_id]
    )
    events: Mapped[list["RecyclingRequestEvent"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", passive_deletes=True
    )


class RecyclingRequestEvent(Base):
    """Append-only status trail for a recycling request."""

    __tablename__ = "recycling_request_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("recycling_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_role: Mapped[str] = mapped_column(String(30), nullable=False, default="SYSTEM")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    request: Mapped[RecyclingRequest] = relationship(back_populates="events")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "category IN ('SOLAR','PROCUREMENT','FINANCE','RECYCLING','ORGANISATION','SYSTEM')",
            name="ck_notification_category",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    category: Mapped[str] = mapped_column(String(30), nullable=False, default="SYSTEM", index=True)
    link: Mapped[str] = mapped_column(String(300), nullable=False, default="", server_default="")
    entity_type: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false", index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
