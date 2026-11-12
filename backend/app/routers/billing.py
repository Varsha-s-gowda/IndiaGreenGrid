"""BillFair billing API.

All billing mathematics lives in the service layer.  Administrators generate
bills and run independent audits; residents can only read and download their
own apartment's statements.  The legacy ``/status`` endpoint is retained for the
module registry used by Parts 1 and 2.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import AdminUser, BillingViewer, DbSession
from app.core.exceptions import ConflictError
from app.models.electricity_tariff import ElectricityTariff
from app.schemas.billing import (
    AuditListResponse,
    AuditPayload,
    AuditReviewRequest,
    AuditRunRequest,
    AuditRunResponse,
    BillGenerateRequest,
    BillHistoryResponse,
    BillListResponse,
    BillPayload,
    BillingConfigurationCreate,
    BillingConfigurationPayload,
    BillingSettingsResponse,
    FlatDetailResponse,
    GenerateResponse,
    SummaryResponse,
    TariffRevisionCreate,
    TariffRevisionPayload,
)
from app.schemas.common import ModuleStatusResponse
from app.services import billing_audit, billing_pdf, billing_service
from app.services.module_service import module_status

router = APIRouter(prefix="/billing", tags=["Billing"])

DISCLAIMER = (
    "Grid charges are estimated from the society tariff configuration and are not "
    "an official BESCOM bill. Solar credits and estimated savings are internal "
    "society benefits, not BESCOM credits."
)


@router.get(
    "/status",
    response_model=ModuleStatusResponse,
    summary="Billing module status (legacy placeholder contract)",
)
def status(current_user: BillingViewer) -> ModuleStatusResponse:
    return module_status("billing")


@router.post(
    "/generate",
    response_model=GenerateResponse,
    summary="Preview or save monthly bills (ADMIN only)",
)
def generate(
    payload: BillGenerateRequest,
    db: DbSession,
    admin: AdminUser,
) -> GenerateResponse:
    result = billing_service.generate(
        db,
        actor=admin,
        allocation_run_id=payload.allocation_run_id,
        simulation_run_id=payload.simulation_run_id,
        method=payload.method,
        billing_period_start=payload.billing_period_start,
        billing_period_end=payload.billing_period_end,
        billing_month=payload.billing_month,
        flat_ref=(
            payload.flat_id
            if payload.flat_id is not None
            else payload.flat_number
        ),
        save=payload.save,
        recalculate=payload.recalculate,
        allow_incomplete=payload.allow_incomplete,
        notes=payload.notes,
    )
    return GenerateResponse(**result)


@router.get(
    "/summary",
    response_model=SummaryResponse,
    summary="Billing overview for the current scope",
)
def summary(
    db: DbSession,
    current_user: BillingViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    method: Annotated[str | None, Query()] = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    flat_id: Annotated[str | None, Query()] = None,
) -> SummaryResponse:
    result = billing_service.summary(
        db,
        actor=current_user,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        billing_month=billing_month,
        flat_ref=flat_id,
    )
    return SummaryResponse(**result)


@router.get(
    "/flats",
    response_model=BillListResponse,
    summary="Apartment-wise bill list for the current scope",
)
def list_flats(
    db: DbSession,
    current_user: BillingViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    method: Annotated[str | None, Query()] = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    status: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=40)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> BillListResponse:
    result = billing_service.list_flats(
        db,
        actor=current_user,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        billing_month=billing_month,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
    )
    return BillListResponse(**result)


@router.get(
    "/flats/{flat_id}",
    response_model=FlatDetailResponse,
    summary="Current bill and detail for one apartment",
)
def flat_detail(
    flat_id: str,
    db: DbSession,
    current_user: BillingViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    method: Annotated[str | None, Query()] = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
) -> FlatDetailResponse:
    result = billing_service.flat_detail(
        db,
        actor=current_user,
        flat_ref=flat_id,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        billing_month=billing_month,
    )
    return FlatDetailResponse(**result)


@router.get(
    "/history/{flat_id}",
    response_model=BillHistoryResponse,
    summary="Every bill version for one apartment",
)
def history(
    flat_id: str,
    db: DbSession,
    current_user: BillingViewer,
    allocation_run_id: Annotated[int | None, Query(ge=1)] = None,
    simulation_run_id: Annotated[int | None, Query(ge=1)] = None,
    method: Annotated[str | None, Query()] = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> BillHistoryResponse:
    result = billing_service.history(
        db,
        actor=current_user,
        flat_ref=flat_id,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        billing_month=billing_month,
        limit=limit,
        offset=offset,
    )
    return BillHistoryResponse(**result)


@router.get(
    "/bills/{bill_id}",
    response_model=BillPayload,
    summary="Full bill detail with line items",
)
def get_bill(
    bill_id: int,
    db: DbSession,
    current_user: BillingViewer,
) -> BillPayload:
    result = billing_service.get_bill(db, actor=current_user, bill_id=bill_id)
    return BillPayload(**result)


@router.get(
    "/bills/{bill_id}/pdf",
    summary="Download a branded PDF statement (role scoped)",
    response_class=Response,
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "BillFair PDF statement",
        }
    },
)
def get_bill_pdf(
    bill_id: int,
    db: DbSession,
    current_user: BillingViewer,
) -> Response:
    bill = billing_service.get_bill(db, actor=current_user, bill_id=bill_id)
    content = billing_pdf.build_bill_pdf(bill)
    safe_number = "".join(
        character
        for character in str(bill.get("bill_number") or bill_id)
        if character.isalnum() or character in ("-", "_")
    )
    filename = f"BillFair-{safe_number or bill_id}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post(
    "/audits",
    response_model=AuditRunResponse,
    summary="Run an independent billing audit (ADMIN only)",
)
def run_audit(
    payload: AuditRunRequest,
    db: DbSession,
    admin: AdminUser,
) -> AuditRunResponse:
    result = billing_audit.run_audit(
        db,
        actor=admin,
        allocation_run_id=payload.allocation_run_id,
        simulation_run_id=payload.simulation_run_id,
        method=payload.method,
        billing_period_start=payload.billing_period_start,
        billing_period_end=payload.billing_period_end,
        billing_month=payload.billing_month,
        bill_ids=payload.bill_ids,
        include_passed=payload.include_passed,
    )
    return AuditRunResponse(**result)


@router.get(
    "/audits",
    response_model=AuditListResponse,
    summary="List stored billing audit findings (ADMIN only)",
)
def list_audits(
    db: DbSession,
    admin: AdminUser,
    audit_batch_id: Annotated[str | None, Query(max_length=40)] = None,
    bill_id: Annotated[int | None, Query(ge=1)] = None,
    apartment_id: Annotated[int | None, Query(ge=1)] = None,
    status: Annotated[str | None, Query()] = None,
    check_type: Annotated[str | None, Query()] = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditListResponse:
    result = billing_audit.list_audits(
        db,
        audit_batch_id=audit_batch_id,
        bill_id=bill_id,
        apartment_id=apartment_id,
        status=status,
        check_type=check_type,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        limit=limit,
        offset=offset,
    )
    return AuditListResponse(**result)


@router.post(
    "/audits/{audit_id}/review",
    response_model=AuditPayload,
    summary="Mark an audit finding as reviewed (ADMIN only)",
)
def review_audit(
    audit_id: int,
    payload: AuditReviewRequest,
    db: DbSession,
    admin: AdminUser,
) -> AuditPayload:
    result = billing_audit.review_audit(
        db, actor=admin, audit_id=audit_id, note=payload.note
    )
    return AuditPayload(**result)


@router.get(
    "/config",
    response_model=BillingSettingsResponse,
    summary="Tariff and society billing rules",
)
def get_settings(db: DbSession, current_user: BillingViewer) -> BillingSettingsResponse:
    tariffs = billing_service.list_tariffs(db)
    configurations = billing_service.list_configurations(db)
    return BillingSettingsResponse(
        tariff_revisions=[TariffRevisionPayload(**item) for item in tariffs],
        billing_configurations=[
            BillingConfigurationPayload(**item) for item in configurations
        ],
        latest_configuration=(
            BillingConfigurationPayload(**configurations[-1])
            if configurations
            else None
        ),
        disclaimer=DISCLAIMER,
    )


@router.post(
    "/config",
    response_model=BillingConfigurationPayload,
    status_code=201,
    summary="Create a society billing rule revision (ADMIN only)",
)
def create_configuration(
    payload: BillingConfigurationCreate,
    db: DbSession,
    admin: AdminUser,
) -> BillingConfigurationPayload:
    configuration = billing_service.create_configuration(
        db,
        name=payload.name,
        solar_credit_rate_per_kwh=Decimal(str(payload.solar_credit_rate_per_kwh)),
        maintenance_charge=Decimal(str(payload.maintenance_charge)),
        other_charges=Decimal(str(payload.other_charges)),
        other_charges_description=payload.other_charges_description,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
    )
    return BillingConfigurationPayload(
        **billing_service.configuration_payload(configuration)
    )


@router.post(
    "/tariffs",
    response_model=TariffRevisionPayload,
    status_code=201,
    summary="Create an electricity tariff revision (ADMIN only)",
)
def create_tariff(
    payload: TariffRevisionCreate,
    db: DbSession,
    admin: AdminUser,
) -> TariffRevisionPayload:
    existing = db.scalar(
        select(ElectricityTariff).where(
            ElectricityTariff.effective_from == payload.effective_from
        )
    )
    if existing is not None:
        raise ConflictError(
            "An electricity tariff already exists for this effective date.",
            details={"tariff_id": existing.id},
        )
    tariff = ElectricityTariff(
        price_per_kwh=Decimal(str(payload.price_per_kwh)),
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
    )
    db.add(tariff)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            "An electricity tariff already exists for this effective date."
        ) from exc
    db.refresh(tariff)
    return TariffRevisionPayload(
        id=tariff.id,
        price_per_kwh=float(tariff.price_per_kwh),
        effective_from=tariff.effective_from,
        effective_to=tariff.effective_to,
    )
