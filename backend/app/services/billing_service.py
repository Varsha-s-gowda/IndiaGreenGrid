"""BillFair billing orchestration.

The service is the only layer that turns stored SolarTwin consumption and
SolarEquity allocation records into monthly bill snapshots.  It never invents
energy or prices: tariffs come from ``electricity_tariffs`` and society rules
from ``billing_configurations``.

Preview calculations are read-only.  Saving is atomic for the whole request and
duplicate-safe: an identical request returns the existing issued bill, while an
intentional recalculation supersedes the previous version instead of
overwriting it.
"""

from __future__ import annotations

import calendar
import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.allocation import (
    AllocationMethod,
    AllocationRecord,
    AllocationRun,
    AllocationSummary,
)
from app.models.apartment import Apartment
from app.models.billing import (
    AuditStatus,
    Bill,
    BillLineItem,
    BillLineType,
    BillStatus,
    BillingAudit,
    BillingConfiguration,
)
from app.models.electricity_tariff import ElectricityTariff
from app.models.simulation_run import SimulationRun
from app.models.user import User, UserRole
from app.services import billing_engine
from app.services.allocation_service import enforce_apartment_scope, resolve_apartment

BILLING_ALGORITHM_VERSION = "4.0.0"


def _utc(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        candidate = value
    else:
        candidate = datetime.combine(value, time.min)
    if candidate.tzinfo is None:
        return candidate.replace(tzinfo=timezone.utc)
    return candidate.astimezone(timezone.utc)


def _method_label(method: str) -> str:
    return AllocationMethod.LABELS.get(method, method)


def _month_bounds(month: str) -> tuple[date, date]:
    try:
        year_text, month_text = month.split("-", 1)
        year = int(year_text)
        month_number = int(month_text)
        if len(year_text) != 4 or len(month_text) != 2:
            raise ValueError
        start = date(year, month_number, 1)
    except (TypeError, ValueError) as exc:
        raise BadRequestError(
            "billing_month must be formatted as YYYY-MM."
        ) from exc
    end = date(year, month_number, calendar.monthrange(year, month_number)[1])
    return start, end


def _period_label(start: date, end: date) -> str:
    if start.year == end.year and start.month == end.month:
        if start.day == 1 and end.day == calendar.monthrange(
            start.year, start.month
        )[1]:
            return start.strftime("%B %Y")
        return f"{start.day} {start.strftime('%b')} - {end.day} {end.strftime('%b %Y')}"
    if start.year == end.year:
        return (
            f"{start.day} {start.strftime('%b')} - "
            f"{end.day} {end.strftime('%b %Y')}"
        )
    return f"{start.strftime('%d %b %Y')} - {end.strftime('%d %b %Y')}"


def _period_days(start: date, end: date) -> list[date]:
    count = (end - start).days + 1
    return [start + timedelta(days=offset) for offset in range(count)]


def _hash_payload(payload: Any) -> str:
    hasher = hashlib.sha256()
    hasher.update(json.dumps(payload, sort_keys=True, default=str).encode("utf-8"))
    return hasher.hexdigest()


def _money(value: Any) -> Decimal:
    return billing_engine.money(value)


def _energy(value: Any) -> Decimal:
    return billing_engine.energy(value)


def _sum(values: list[Decimal]) -> Decimal:
    total = Decimal("0")
    for value in values:
        total += value
    return total


@dataclass(frozen=True)
class BillingPeriod:
    start: date
    end: date
    label: str
    days: list[date]
    requested_month: str | None = None
    partial_month: bool = False

    @property
    def day_count(self) -> int:
        return len(self.days)


@dataclass(frozen=True)
class RateWindow:
    start: date
    end: date
    tariff: ElectricityTariff
    configuration: BillingConfiguration


@dataclass
class UsageDay:
    day: date
    consumption_kwh: Decimal
    solar_allocation_kwh: Decimal
    stored_grid_import_kwh: Decimal
    hour_count: int


@dataclass
class ApartmentUsage:
    apartment: Apartment
    days: dict[date, UsageDay]
    summary_consumption_kwh: Decimal
    summary_solar_allocation_kwh: Decimal
    summary_grid_import_kwh: Decimal
    hour_count: int


@dataclass
class BillComputation:
    apartment: Apartment
    period: BillingPeriod
    calculation: billing_engine.BillCalculation
    input_hash: str
    tariff_ids: list[int | None]
    config_ids: list[int | None]


def resolve_allocation_run(
    db: Session,
    *,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
) -> AllocationRun:
    resolved_method = (method or "").strip().upper() or None
    if resolved_method and resolved_method not in AllocationMethod.ALL:
        raise BadRequestError(
            f"Unknown allocation method {method!r}. "
            f"Choose from {', '.join(AllocationMethod.ALL)}."
        )

    if allocation_run_id is not None:
        run = db.get(AllocationRun, allocation_run_id)
        if run is None:
            raise NotFoundError(f"Allocation run {allocation_run_id} was not found.")
        if simulation_run_id is not None and run.simulation_run_id != simulation_run_id:
            raise BadRequestError(
                "allocation_run_id and simulation_run_id refer to different runs."
            )
        if resolved_method and run.method != resolved_method:
            raise BadRequestError(
                "allocation_run_id and method refer to different allocation methods."
            )
    else:
        stmt = (
            select(AllocationRun)
            .where(AllocationRun.is_hypothetical.is_(False))
            .order_by(AllocationRun.id.desc())
            .limit(1)
        )
        if simulation_run_id is not None:
            stmt = stmt.where(AllocationRun.simulation_run_id == simulation_run_id)
        if resolved_method:
            stmt = stmt.where(AllocationRun.method == resolved_method)
        run = db.scalar(stmt)
        if run is None:
            raise BadRequestError(
                "No saved allocation run is available for billing. Save an "
                "allocation run in SolarEquity first."
            )

    if run.is_hypothetical:
        raise BadRequestError(
            "Hypothetical allocation runs cannot be billed. Save the allocation first."
        )
    return run


def resolve_period(
    run: AllocationRun,
    *,
    billing_period_start: date | None,
    billing_period_end: date | None,
    billing_month: str | None,
) -> BillingPeriod:
    if billing_month and (billing_period_start or billing_period_end):
        raise BadRequestError(
            "Provide either billing_month or explicit billing period dates, not both."
        )

    partial_month = False
    requested_month = billing_month
    if billing_month:
        month_start, month_end = _month_bounds(billing_month)
        start = max(month_start, run.date_from)
        end = min(month_end, run.date_to)
        if start > end:
            raise BadRequestError(
                f"Billing month {billing_month} does not overlap allocation run "
                f"{run.id} ({run.date_from} to {run.date_to})."
            )
        partial_month = start != month_start or end != month_end
    else:
        start = billing_period_start or run.date_from
        end = billing_period_end or run.date_to
        if start > end:
            raise BadRequestError("billing_period_start must be on or before end.")
        if start < run.date_from or end > run.date_to:
            raise BadRequestError(
                "The billing period falls outside the saved allocation run.",
                details={
                    "allocation_run_id": run.id,
                    "run_start": str(run.date_from),
                    "run_end": str(run.date_to),
                    "requested_start": str(start),
                    "requested_end": str(end),
                },
            )

    return BillingPeriod(
        start=start,
        end=end,
        label=_period_label(start, end),
        days=_period_days(start, end),
        requested_month=requested_month,
        partial_month=partial_month,
    )


def _load_tariffs(
    db: Session, period: BillingPeriod
) -> tuple[list[ElectricityTariff], dict[date, ElectricityTariff]]:
    revisions = list(
        db.scalars(
            select(ElectricityTariff)
            .where(
                ElectricityTariff.effective_from <= period.end,
                (ElectricityTariff.effective_to.is_(None))
                | (ElectricityTariff.effective_to >= period.start),
            )
            .order_by(ElectricityTariff.effective_from)
        ).all()
    )
    by_day: dict[date, ElectricityTariff] = {}
    missing: list[str] = []
    for day in period.days:
        applicable = [
            revision
            for revision in revisions
            if revision.effective_from <= day
            and (revision.effective_to is None or revision.effective_to >= day)
        ]
        if not applicable:
            missing.append(day.isoformat())
            continue
        by_day[day] = max(applicable, key=lambda item: (item.effective_from, item.id))
    if missing:
        raise BadRequestError(
            "No electricity tariff covers part of the billing period.",
            details={"missing_days": missing[:20], "missing_count": len(missing)},
        )
    if not revisions:
        raise BadRequestError(
            "No electricity tariff revision applies to the billing period."
        )
    return revisions, by_day


def _load_configurations(
    db: Session, period: BillingPeriod
) -> tuple[list[BillingConfiguration], dict[date, BillingConfiguration]]:
    revisions = list(
        db.scalars(
            select(BillingConfiguration)
            .where(
                BillingConfiguration.effective_from <= period.end,
                (BillingConfiguration.effective_to.is_(None))
                | (BillingConfiguration.effective_to >= period.start),
            )
            .order_by(BillingConfiguration.effective_from)
        ).all()
    )
    by_day: dict[date, BillingConfiguration] = {}
    missing: list[str] = []
    for day in period.days:
        applicable = [
            revision
            for revision in revisions
            if revision.effective_from <= day
            and (revision.effective_to is None or revision.effective_to >= day)
        ]
        if not applicable:
            missing.append(day.isoformat())
            continue
        by_day[day] = max(applicable, key=lambda item: (item.effective_from, item.id))
    if missing:
        raise BadRequestError(
            "No billing configuration covers part of the billing period. Create "
            "a configuration revision first.",
            details={"missing_days": missing[:20], "missing_count": len(missing)},
        )
    if not revisions:
        raise BadRequestError(
            "No billing configuration is available. Seed or create billing rules."
        )
    return revisions, by_day


def _rate_windows(
    period: BillingPeriod,
    tariff_by_day: dict[date, ElectricityTariff],
    config_by_day: dict[date, BillingConfiguration],
) -> list[RateWindow]:
    windows: list[RateWindow] = []
    current: RateWindow | None = None
    for day in period.days:
        tariff = tariff_by_day[day]
        configuration = config_by_day[day]
        if (
            current is None
            or current.tariff.id != tariff.id
            or current.configuration.id != configuration.id
        ):
            if current is not None:
                windows.append(current)
            current = RateWindow(
                start=day, end=day, tariff=tariff, configuration=configuration
            )
        else:
            current = RateWindow(
                start=current.start,
                end=day,
                tariff=current.tariff,
                configuration=current.configuration,
            )
    if current is not None:
        windows.append(current)
    return windows


def _load_apartment_usage(
    db: Session,
    run: AllocationRun,
    period: BillingPeriod,
    *,
    apartment: Apartment | None,
    allow_incomplete: bool,
) -> tuple[dict[int, ApartmentUsage], dict[str, Any]]:
    summary_stmt = (
        select(AllocationSummary, Apartment)
        .join(Apartment, Apartment.id == AllocationSummary.apartment_id)
        .where(AllocationSummary.allocation_run_id == run.id)
        .order_by(Apartment.flat_number)
    )
    if apartment is not None:
        summary_stmt = summary_stmt.where(AllocationSummary.apartment_id == apartment.id)
    summary_rows = db.execute(summary_stmt).all()
    if not summary_rows:
        raise NotFoundError(
            f"No allocation summaries exist for allocation run {run.id}"
            + (f" and flat {apartment.flat_number}." if apartment else ".")
        )

    total_apartments = int(db.scalar(select(func.count()).select_from(Apartment)) or 0)
    missing_summaries = total_apartments - len(summary_rows)
    if apartment is None and missing_summaries > 0 and not allow_incomplete:
        raise BadRequestError(
            "The saved allocation run does not include every apartment.",
            details={
                "apartments_total": total_apartments,
                "summaries_available": len(summary_rows),
                "missing_count": missing_summaries,
            },
        )

    record_stmt = (
        select(
            AllocationRecord.apartment_id,
            AllocationRecord.reading_time,
            AllocationRecord.consumption_kwh,
            AllocationRecord.allocated_solar_kwh,
            AllocationRecord.grid_import_kwh,
        )
        .where(
            AllocationRecord.allocation_run_id == run.id,
            AllocationRecord.reading_time >= _utc(period.start),
            AllocationRecord.reading_time < _utc(period.end + timedelta(days=1)),
        )
        .order_by(AllocationRecord.apartment_id, AllocationRecord.reading_time)
    )
    if apartment is not None:
        record_stmt = record_stmt.where(AllocationRecord.apartment_id == apartment.id)
    records = db.execute(record_stmt).all()

    raw: dict[int, dict[date, dict[str, Any]]] = {}
    times: set[datetime] = set()
    for apartment_id, reading_time, consumption, solar, grid in records:
        timestamp = _utc(reading_time)
        times.add(timestamp)
        day = timestamp.date()
        bucket = raw.setdefault(int(apartment_id), {}).setdefault(
            day,
            {
                "consumption": Decimal("0"),
                "solar": Decimal("0"),
                "grid": Decimal("0"),
                "hours": 0,
            },
        )
        bucket["consumption"] += billing_engine.to_decimal(consumption)
        bucket["solar"] += billing_engine.to_decimal(solar)
        bucket["grid"] += billing_engine.to_decimal(grid)
        bucket["hours"] += 1

    expected_hours = len(times)
    if expected_hours == 0:
        raise BadRequestError(
            "No allocation records exist for the selected billing period.",
            details={
                "allocation_run_id": run.id,
                "billing_period_start": str(period.start),
                "billing_period_end": str(period.end),
            },
        )

    usage: dict[int, ApartmentUsage] = {}
    incomplete: list[dict[str, Any]] = []
    for summary, row_apartment in summary_rows:
        days = {
            day: UsageDay(
                day=day,
                consumption_kwh=_energy(values["consumption"]),
                solar_allocation_kwh=_energy(values["solar"]),
                stored_grid_import_kwh=_energy(values["grid"]),
                hour_count=int(values["hours"]),
            )
            for day, values in sorted(raw.get(row_apartment.id, {}).items())
        }
        hours = sum(item.hour_count for item in days.values())
        if hours < expected_hours:
            incomplete.append(
                {
                    "apartment_id": row_apartment.id,
                    "flat_number": row_apartment.flat_number,
                    "hours_available": hours,
                    "hours_expected": expected_hours,
                }
            )
        usage[row_apartment.id] = ApartmentUsage(
            apartment=row_apartment,
            days=days,
            summary_consumption_kwh=billing_engine.to_decimal(
                summary.total_consumption_kwh
            ),
            summary_solar_allocation_kwh=billing_engine.to_decimal(
                summary.total_solar_allocation_kwh
            ),
            summary_grid_import_kwh=billing_engine.to_decimal(
                summary.total_grid_import_kwh
            ),
            hour_count=hours,
        )

    if incomplete and not allow_incomplete:
        raise BadRequestError(
            "Allocation records are incomplete for one or more apartments.",
            details={
                "incomplete_apartments": incomplete[:20],
                "incomplete_count": len(incomplete),
                "hours_expected": expected_hours,
            },
        )

    report = {
        "expected_hours": expected_hours,
        "apartments_total": total_apartments,
        "apartments_available": len(summary_rows),
        "incomplete_apartments": incomplete,
        "incomplete_count": len(incomplete),
        "allow_incomplete": allow_incomplete,
    }
    return usage, report


def _compute_bill(
    usage: ApartmentUsage,
    period: BillingPeriod,
    windows: list[RateWindow],
    config_by_day: dict[date, BillingConfiguration],
    run: AllocationRun,
) -> BillComputation:
    segments: list[billing_engine.ChargeSegment] = []
    for window in windows:
        consumption = Decimal("0")
        solar = Decimal("0")
        hours = 0
        for day in _period_days(window.start, window.end):
            usage_day = usage.days.get(day)
            if usage_day is None:
                continue
            consumption += usage_day.consumption_kwh
            solar += usage_day.solar_allocation_kwh
            hours += usage_day.hour_count
        segments.append(
            billing_engine.ChargeSegment(
                start_date=window.start,
                end_date=window.end,
                tariff_id=window.tariff.id,
                tariff_price_per_kwh=billing_engine.to_decimal(
                    window.tariff.price_per_kwh
                ),
                config_id=window.configuration.id,
                solar_credit_rate_per_kwh=billing_engine.to_decimal(
                    window.configuration.solar_credit_rate_per_kwh
                ),
                consumption_kwh=_energy(consumption),
                solar_allocation_kwh=_energy(solar),
                hour_count=hours,
            )
        )

    maintenance_raw = sum(
        (
            billing_engine.daily_prorated_amount(
                config_by_day[day].maintenance_charge, day
            )
            for day in period.days
        ),
        Decimal("0"),
    )
    other_raw = sum(
        (
            billing_engine.daily_prorated_amount(
                config_by_day[day].other_charges, day
            )
            for day in period.days
        ),
        Decimal("0"),
    )
    descriptions = sorted(
        {
            (config_by_day[day].other_charges_description or "").strip()
            for day in period.days
            if (config_by_day[day].other_charges_description or "").strip()
        }
    )
    other_description = (
        "Other society charges"
        if not descriptions
        else "; ".join(descriptions)
    )

    calculation = billing_engine.calculate_bill(
        segments,
        maintenance_charge=_money(maintenance_raw),
        other_charges=_money(other_raw),
        other_charges_description=other_description,
    )

    usage_payload = [
        {
            "date": day.isoformat(),
            "consumption_kwh": f"{item.consumption_kwh:.6f}",
            "solar_allocation_kwh": f"{item.solar_allocation_kwh:.6f}",
            "hours": item.hour_count,
        }
        for day, item in sorted(usage.days.items())
    ]
    input_hash = _hash_payload(
        {
            "algorithm_version": BILLING_ALGORITHM_VERSION,
            "allocation_run_id": run.id,
            "simulation_run_id": run.simulation_run_id,
            "method": run.method,
            "period_start": str(period.start),
            "period_end": str(period.end),
            "apartment_id": usage.apartment.id,
            "flat_number": usage.apartment.flat_number,
            "tariffs": [
                {
                    "id": window.tariff.id,
                    "from": str(window.tariff.effective_from),
                    "to": str(window.tariff.effective_to),
                    "rate": f"{window.tariff.price_per_kwh:.4f}",
                }
                for window in windows
            ],
            "configurations": [
                {
                    "id": window.configuration.id,
                    "from": str(window.configuration.effective_from),
                    "to": str(window.configuration.effective_to),
                    "credit_rate": f"{window.configuration.solar_credit_rate_per_kwh:.4f}",
                    "maintenance": f"{window.configuration.maintenance_charge:.2f}",
                    "other": f"{window.configuration.other_charges:.2f}",
                }
                for window in windows
            ],
            "usage": usage_payload,
            "maintenance": f"{calculation.maintenance_charge:.2f}",
            "other_charges": f"{calculation.other_charges:.2f}",
        }
    )

    return BillComputation(
        apartment=usage.apartment,
        period=period,
        calculation=calculation,
        input_hash=input_hash,
        tariff_ids=[window.tariff.id for window in windows],
        config_ids=[window.configuration.id for window in windows],
    )


def _actor_payload(user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}


def _apartment_payload(apartment: Apartment) -> dict[str, Any]:
    return {
        "id": apartment.id,
        "flat_number": apartment.flat_number,
        "floor_number": apartment.floor_number,
        "apartment_category": apartment.apartment_category,
        "residents_count": apartment.residents_count,
        "consumption_profile": apartment.consumption_profile,
    }


def _resident_for_apartment(db: Session, apartment_id: int) -> User | None:
    return db.scalar(
        select(User)
        .where(User.apartment_id == apartment_id, User.role == UserRole.RESIDENT)
        .order_by(User.id)
        .limit(1)
    )


def bill_payload(
    db: Session,
    bill: Bill,
    *,
    include_line_items: bool = True,
    duplicate: bool = False,
) -> dict[str, Any]:
    apartment = bill.apartment or db.get(Apartment, bill.apartment_id)
    resident = _resident_for_apartment(db, bill.apartment_id)
    latest_audit = db.scalar(
        select(BillingAudit)
        .where(BillingAudit.bill_id == bill.id)
        .order_by(BillingAudit.created_at.desc(), BillingAudit.id.desc())
        .limit(1)
    )
    payload = {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "duplicate": duplicate,
        "status": bill.status,
        "is_current": bool(bill.is_current),
        "version": bill.version,
        "supersedes_bill_id": bill.supersedes_bill_id,
        "apartment_id": bill.apartment_id,
        "apartment": _apartment_payload(apartment) if apartment is not None else None,
        "resident": _actor_payload(resident),
        "allocation_run_id": bill.allocation_run_id,
        "simulation_run_id": bill.simulation_run_id,
        "allocation_method": bill.allocation_method,
        "allocation_method_label": _method_label(bill.allocation_method),
        "billing_configuration_id": bill.billing_configuration_id,
        "billing_period_start": bill.billing_period_start,
        "billing_period_end": bill.billing_period_end,
        "billing_period_label": bill.billing_period_label,
        "consumption_kwh": float(bill.consumption_kwh),
        "solar_allocation_kwh": float(bill.solar_allocation_kwh),
        "grid_import_kwh": float(bill.grid_import_kwh),
        "solar_coverage_percentage": float(bill.solar_coverage_percentage),
        "tariff_price_per_kwh": float(bill.tariff_price_per_kwh),
        "solar_credit_rate_per_kwh": float(bill.solar_credit_rate_per_kwh),
        "grid_charge": float(bill.grid_charge),
        "solar_credit": float(bill.solar_credit),
        "maintenance_charge": float(bill.maintenance_charge),
        "other_charges": float(bill.other_charges),
        "other_charges_description": bill.other_charges_description,
        "net_payable": float(bill.net_payable),
        "no_solar_baseline_cost": float(bill.no_solar_baseline_cost),
        "actual_estimated_cost": float(bill.actual_estimated_cost),
        "estimated_savings": float(bill.estimated_savings),
        "hour_count": bill.hour_count,
        "algorithm_version": bill.algorithm_version,
        "input_hash": bill.input_hash,
        "tariff_snapshot": bill.tariff_snapshot or [],
        "charge_snapshot": bill.charge_snapshot or {},
        "notes": bill.notes,
        "generated_at": bill.generated_at,
        "issued_at": bill.issued_at,
        "created_at": bill.created_at,
        "generated_by": _actor_payload(bill.generated_by),
        "latest_audit": (
            {
                "id": latest_audit.id,
                "status": latest_audit.status,
                "check_type": latest_audit.check_type,
                "explanation": latest_audit.explanation,
                "reviewed_at": latest_audit.reviewed_at,
            }
            if latest_audit is not None
            else None
        ),
        "disclaimer": (
            "This is an internal SolarEquity 360 society statement. Grid charges "
            "are estimated from society tariff configuration and are not an official "
            "BESCOM bill. Solar credits and estimated savings are internal society "
            "benefits, not BESCOM credits."
        ),
    }
    if include_line_items:
        payload["line_items"] = [
            {
                "id": item.id,
                "charge_type": item.charge_type,
                "description": item.description,
                "quantity": float(item.quantity),
                "unit": item.unit,
                "rate": float(item.rate),
                "amount": float(item.amount),
                "sort_order": item.sort_order,
            }
            for item in sorted(bill.line_items, key=lambda row: row.sort_order)
        ]
    return payload


def _preview_payload(
    computation: BillComputation,
    *,
    resident: User | None,
    run: AllocationRun,
) -> dict[str, Any]:
    calc = computation.calculation
    return {
        "id": None,
        "bill_number": None,
        "duplicate": False,
        "status": "PREVIEW",
        "is_current": False,
        "version": 0,
        "supersedes_bill_id": None,
        "apartment_id": computation.apartment.id,
        "apartment": _apartment_payload(computation.apartment),
        "resident": _actor_payload(resident),
        "allocation_run_id": run.id,
        "simulation_run_id": run.simulation_run_id,
        "allocation_method": run.method,
        "allocation_method_label": _method_label(run.method),
        "billing_configuration_id": (
            computation.config_ids[-1] if computation.config_ids else None
        ),
        "billing_period_start": computation.period.start,
        "billing_period_end": computation.period.end,
        "billing_period_label": computation.period.label,
        "consumption_kwh": float(calc.consumption_kwh),
        "solar_allocation_kwh": float(calc.solar_allocation_kwh),
        "grid_import_kwh": float(calc.grid_import_kwh),
        "solar_coverage_percentage": float(calc.solar_coverage_percentage),
        "tariff_price_per_kwh": float(calc.tariff_price_per_kwh),
        "solar_credit_rate_per_kwh": float(calc.solar_credit_rate_per_kwh),
        "grid_charge": float(calc.grid_charge),
        "solar_credit": float(calc.solar_credit),
        "maintenance_charge": float(calc.maintenance_charge),
        "other_charges": float(calc.other_charges),
        "other_charges_description": calc.charge_snapshot.get(
            "other_charges_description"
        ),
        "net_payable": float(calc.net_payable),
        "no_solar_baseline_cost": float(calc.no_solar_baseline_cost),
        "actual_estimated_cost": float(calc.actual_estimated_cost),
        "estimated_savings": float(calc.estimated_savings),
        "hour_count": calc.hour_count,
        "algorithm_version": BILLING_ALGORITHM_VERSION,
        "input_hash": computation.input_hash,
        "tariff_snapshot": calc.tariff_snapshot,
        "charge_snapshot": calc.charge_snapshot,
        "notes": None,
        "generated_at": None,
        "issued_at": None,
        "created_at": None,
        "generated_by": None,
        "latest_audit": None,
        "line_items": [
            {
                "id": None,
                "charge_type": item.charge_type,
                "description": item.description,
                "quantity": float(item.quantity),
                "unit": item.unit,
                "rate": float(item.rate),
                "amount": float(item.amount),
                "sort_order": item.sort_order,
            }
            for item in calc.line_items
        ],
        "disclaimer": (
            "Preview only. Nothing has been saved. Grid charges are estimates from "
            "society tariff configuration, not an official BESCOM bill."
        ),
    }


def _totals(bills: list[dict[str, Any]]) -> dict[str, Any]:
    consumption = sum(float(item["consumption_kwh"]) for item in bills)
    solar = sum(float(item["solar_allocation_kwh"]) for item in bills)
    grid = sum(float(item["grid_import_kwh"]) for item in bills)
    grid_charge = sum(float(item["grid_charge"]) for item in bills)
    solar_credit = sum(float(item["solar_credit"]) for item in bills)
    maintenance = sum(float(item["maintenance_charge"]) for item in bills)
    other = sum(float(item["other_charges"]) for item in bills)
    net = sum(float(item["net_payable"]) for item in bills)
    savings = sum(float(item["estimated_savings"]) for item in bills)
    baseline = sum(float(item["no_solar_baseline_cost"]) for item in bills)
    actual = sum(float(item["actual_estimated_cost"]) for item in bills)
    count = len(bills)
    return {
        "apartment_count": count,
        "consumption_kwh": round(consumption, 6),
        "solar_allocation_kwh": round(solar, 6),
        "grid_import_kwh": round(grid, 6),
        "grid_charge": round(grid_charge, 2),
        "solar_credit": round(solar_credit, 2),
        "maintenance_charge": round(maintenance, 2),
        "other_charges": round(other, 2),
        "net_payable": round(net, 2),
        "estimated_savings": round(savings, 2),
        "no_solar_baseline_cost": round(baseline, 2),
        "actual_estimated_cost": round(actual, 2),
        "average_net_payable": round(net / count, 2) if count else 0.0,
        "average_estimated_savings": round(savings / count, 2) if count else 0.0,
        "solar_coverage_percentage": (
            round((solar / consumption) * 100, 3) if consumption else 0.0
        ),
    }


def _period_payload(period: BillingPeriod, run: AllocationRun) -> dict[str, Any]:
    return {
        "start": period.start,
        "end": period.end,
        "label": period.label,
        "days": period.day_count,
        "requested_month": period.requested_month,
        "partial_month": period.partial_month,
        "allocation_run_id": run.id,
        "simulation_run_id": run.simulation_run_id,
        "allocation_method": run.method,
        "allocation_method_label": _method_label(run.method),
    }


def _rate_revision_payloads(
    tariffs: list[ElectricityTariff],
    configurations: list[BillingConfiguration],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    return (
        [
            {
                "id": item.id,
                "price_per_kwh": float(item.price_per_kwh),
                "effective_from": item.effective_from,
                "effective_to": item.effective_to,
            }
            for item in tariffs
        ],
        [
            configuration_payload(item)
            for item in configurations
        ],
    )


def configuration_payload(configuration: BillingConfiguration) -> dict[str, Any]:
    return {
        "id": configuration.id,
        "name": configuration.name,
        "solar_credit_rate_per_kwh": float(
            configuration.solar_credit_rate_per_kwh
        ),
        "maintenance_charge": float(configuration.maintenance_charge),
        "other_charges": float(configuration.other_charges),
        "other_charges_description": configuration.other_charges_description,
        "effective_from": configuration.effective_from,
        "effective_to": configuration.effective_to,
        "created_at": configuration.created_at,
    }


def _current_bills(
    db: Session,
    *,
    run: AllocationRun,
    period: BillingPeriod,
    apartment_id: int | None = None,
) -> list[Bill]:
    stmt = select(Bill).where(
        Bill.allocation_run_id == run.id,
        Bill.billing_period_start == period.start,
        Bill.billing_period_end == period.end,
        Bill.is_current.is_(True),
    )
    if apartment_id is not None:
        stmt = stmt.where(Bill.apartment_id == apartment_id)
    return list(db.scalars(stmt.order_by(Bill.id)).all())


def generate(
    db: Session,
    *,
    actor: User,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: str | None = None,
    flat_ref: str | int | None = None,
    save: bool = False,
    recalculate: bool = False,
    allow_incomplete: bool = False,
    notes: str | None = None,
) -> dict[str, Any]:
    if actor.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can generate bills.")

    run = resolve_allocation_run(
        db,
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
    )
    period = resolve_period(
        run,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        billing_month=billing_month,
    )
    tariffs, tariff_by_day = _load_tariffs(db, period)
    configurations, config_by_day = _load_configurations(db, period)
    windows = _rate_windows(period, tariff_by_day, config_by_day)

    apartment: Apartment | None = None
    if flat_ref is not None:
        apartment = resolve_apartment(db, flat_ref)

    usage_by_apartment, usage_report = _load_apartment_usage(
        db,
        run,
        period,
        apartment=apartment,
        allow_incomplete=allow_incomplete,
    )

    computations = [
        _compute_bill(usage, period, windows, config_by_day, run)
        for _, usage in sorted(
            usage_by_apartment.items(),
            key=lambda item: item[1].apartment.flat_number,
        )
    ]

    warnings: list[str] = []
    if period.partial_month:
        warnings.append(
            "The billing month is only partially covered by the saved allocation "
            "run. The statement covers the overlapping days only."
        )
    if usage_report["incomplete_count"]:
        warnings.append(
            f"{usage_report['incomplete_count']} apartment(s) have fewer allocation "
            "records than the period's complete hours. Missing hours were not "
            "interpolated or fabricated."
        )
    if len(tariffs) > 1:
        warnings.append(
            f"{len(tariffs)} tariff revisions apply to this period. Each day is "
            "charged at the revision effective on that day."
        )
    if len(configurations) > 1:
        warnings.append(
            f"{len(configurations)} billing rule revisions apply to this period. "
            "Solar credits and prorated fixed charges follow their effective dates."
        )

    tariff_payloads, config_payloads = _rate_revision_payloads(tariffs, configurations)
    base_response = {
        "saved": False,
        "duplicate": False,
        "recalculated": False,
        "allocation_run_id": run.id,
        "simulation_run_id": run.simulation_run_id,
        "allocation_run": {
            "id": run.id,
            "simulation_run_id": run.simulation_run_id,
            "method": run.method,
            "method_label": _method_label(run.method),
            "date_from": run.date_from,
            "date_to": run.date_to,
            "algorithm_version": run.algorithm_version,
            "input_hash": run.input_hash,
        },
        "billing_period": _period_payload(period, run),
        "apartments_requested": len(computations),
        "usage_report": usage_report,
        "tariff_revisions": tariff_payloads,
        "billing_configurations": config_payloads,
        "warnings": warnings,
    }

    if not save:
        bills = [
            _preview_payload(
                computation,
                resident=_resident_for_apartment(db, computation.apartment.id),
                run=run,
            )
            for computation in computations
        ]
        return {
            **base_response,
            "saved": False,
            "apartments_generated": len(bills),
            "duplicate_count": 0,
            "superseded_count": 0,
            "totals": _totals(bills),
            "bills": bills,
            "generated_at": None,
            "generated_by": _actor_payload(actor),
            "status": "PREVIEW",
        }

    existing = _current_bills(
        db, run=run, period=period, apartment_id=apartment.id if apartment else None
    )
    existing_by_apartment: dict[int, list[Bill]] = {}
    for bill in existing:
        existing_by_apartment.setdefault(bill.apartment_id, []).append(bill)

    all_version_rows = db.execute(
        select(Bill.apartment_id, func.max(Bill.version)).where(
            Bill.allocation_run_id == run.id,
            Bill.billing_period_start == period.start,
            Bill.billing_period_end == period.end,
        ).group_by(Bill.apartment_id)
    ).all()
    max_version_by_apartment = {
        int(apartment_id): int(version or 0)
        for apartment_id, version in all_version_rows
    }

    if not recalculate:
        conflicts = [
            computation
            for computation in computations
            if computation.apartment.id in existing_by_apartment
            and any(
                bill.input_hash != computation.input_hash
                for bill in existing_by_apartment[computation.apartment.id]
            )
        ]
        if conflicts:
            raise ConflictError(
                "Current bills already exist for this period with different inputs. "
                "Set recalculate=true to intentionally create a new version; the "
                "existing issued bills will be preserved as superseded records.",
                details={
                    "conflict_apartments": [
                        item.apartment.flat_number for item in conflicts[:20]
                    ],
                    "conflict_count": len(conflicts),
                },
            )

    now = datetime.now(timezone.utc)
    created_bills: list[Bill] = []
    duplicate_bills: list[Bill] = []
    superseded_count = 0

    try:
        for computation in computations:
            prior_bills = existing_by_apartment.get(computation.apartment.id, [])
            identical = [
                bill
                for bill in prior_bills
                if bill.input_hash == computation.input_hash
            ]
            if identical and not recalculate:
                duplicate_bills.append(identical[-1])
                continue

            prior_version = max(
                max_version_by_apartment.get(computation.apartment.id, 0),
                max((bill.version for bill in prior_bills), default=0),
            )
            supersedes_id = prior_bills[-1].id if prior_bills else None
            for prior in prior_bills:
                prior.status = BillStatus.SUPERSEDED
                prior.is_current = False
                superseded_count += 1

            version = prior_version + 1
            calc = computation.calculation
            latest_config_id = (
                computation.config_ids[-1] if computation.config_ids else None
            )
            bill = Bill(
                bill_number=(
                    f"BF-{computation.period.end:%Y%m%d}-"
                    f"{computation.apartment.flat_number}-v{version}"
                ),
                apartment_id=computation.apartment.id,
                allocation_run_id=run.id,
                simulation_run_id=run.simulation_run_id,
                billing_configuration_id=latest_config_id,
                allocation_method=run.method,
                billing_period_start=computation.period.start,
                billing_period_end=computation.period.end,
                billing_period_label=computation.period.label,
                version=version,
                status=BillStatus.ISSUED,
                is_current=True,
                supersedes_bill_id=supersedes_id,
                consumption_kwh=calc.consumption_kwh,
                solar_allocation_kwh=calc.solar_allocation_kwh,
                grid_import_kwh=calc.grid_import_kwh,
                solar_coverage_percentage=calc.solar_coverage_percentage,
                tariff_price_per_kwh=calc.tariff_price_per_kwh,
                solar_credit_rate_per_kwh=calc.solar_credit_rate_per_kwh,
                grid_charge=calc.grid_charge,
                solar_credit=calc.solar_credit,
                maintenance_charge=calc.maintenance_charge,
                other_charges=calc.other_charges,
                other_charges_description=calc.charge_snapshot.get(
                    "other_charges_description"
                ),
                net_payable=calc.net_payable,
                no_solar_baseline_cost=calc.no_solar_baseline_cost,
                actual_estimated_cost=calc.actual_estimated_cost,
                estimated_savings=calc.estimated_savings,
                tariff_snapshot=calc.tariff_snapshot,
                charge_snapshot={
                    **calc.charge_snapshot,
                    "tariff_ids": computation.tariff_ids,
                    "config_ids": computation.config_ids,
                    "allocation_run_input_hash": run.input_hash,
                },
                hour_count=calc.hour_count,
                algorithm_version=BILLING_ALGORITHM_VERSION,
                input_hash=computation.input_hash,
                notes=notes,
                generated_by_id=actor.id,
                generated_at=now,
                issued_at=now,
            )
            for item in calc.line_items:
                bill.line_items.append(
                    BillLineItem(
                        charge_type=item.charge_type,
                        description=item.description,
                        quantity=item.quantity,
                        unit=item.unit,
                        rate=item.rate,
                        amount=item.amount,
                        sort_order=item.sort_order,
                    )
                )
            db.add(bill)
            created_bills.append(bill)

        db.commit()
        for bill in created_bills:
            db.refresh(bill)
        for bill in duplicate_bills:
            db.refresh(bill)
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            "These bills were generated concurrently or a duplicate version was "
            "requested. Refresh and try again."
        ) from exc
    except Exception:
        db.rollback()
        raise

    saved_payloads = [
        bill_payload(db, bill) for bill in sorted(
            created_bills, key=lambda row: row.apartment.flat_number
        )
    ]
    duplicate_payloads = [
        bill_payload(db, bill, duplicate=True)
        for bill in sorted(duplicate_bills, key=lambda row: row.apartment.flat_number)
    ]
    all_payloads = sorted(
        saved_payloads + duplicate_payloads,
        key=lambda row: row["apartment"]["flat_number"] if row["apartment"] else "",
    )
    return {
        **base_response,
        "saved": True,
        "duplicate": bool(duplicate_payloads) and not saved_payloads,
        "recalculated": bool(recalculate and superseded_count > 0),
        "apartments_generated": len(saved_payloads),
        "duplicate_count": len(duplicate_payloads),
        "superseded_count": superseded_count,
        "totals": _totals(all_payloads),
        "bills": all_payloads,
        "generated_at": now,
        "generated_by": _actor_payload(actor),
        "status": "ISSUED",
    }


def list_available_runs(db: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    runs = list(
        db.scalars(
            select(AllocationRun)
            .where(AllocationRun.is_hypothetical.is_(False))
            .order_by(AllocationRun.id.desc())
            .limit(limit)
        ).all()
    )
    return [
        {
            "id": run.id,
            "simulation_run_id": run.simulation_run_id,
            "method": run.method,
            "method_label": _method_label(run.method),
            "status": run.status,
            "date_from": run.date_from,
            "date_to": run.date_to,
            "total_allocated_kwh": float(run.total_allocated_energy_kwh),
            "tariff_price_per_kwh": float(run.tariff_price_per_kwh),
            "algorithm_version": run.algorithm_version,
            "input_hash": run.input_hash,
            "created_at": run.created_at,
        }
        for run in runs
    ]


def list_tariffs(db: Session) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "price_per_kwh": float(item.price_per_kwh),
            "effective_from": item.effective_from,
            "effective_to": item.effective_to,
        }
        for item in db.scalars(
            select(ElectricityTariff).order_by(
                ElectricityTariff.effective_from, ElectricityTariff.id
            )
        ).all()
    ]


def latest_configuration(db: Session) -> BillingConfiguration | None:
    return db.scalar(
        select(BillingConfiguration)
        .order_by(BillingConfiguration.effective_from.desc(), BillingConfiguration.id.desc())
        .limit(1)
    )


def list_configurations(db: Session) -> list[dict[str, Any]]:
    return [
        configuration_payload(item)
        for item in db.scalars(
            select(BillingConfiguration).order_by(
                BillingConfiguration.effective_from,
                BillingConfiguration.id,
            )
        ).all()
    ]


def create_configuration(
    db: Session,
    *,
    name: str,
    solar_credit_rate_per_kwh: Decimal,
    maintenance_charge: Decimal,
    other_charges: Decimal,
    other_charges_description: str | None,
    effective_from: date,
    effective_to: date | None,
) -> BillingConfiguration:
    if effective_to is not None and effective_to < effective_from:
        raise BadRequestError("effective_to must be on or after effective_from.")
    duplicate = db.scalar(
        select(BillingConfiguration).where(
            BillingConfiguration.effective_from == effective_from
        )
    )
    if duplicate is not None:
        raise ConflictError(
            "A billing configuration already exists for this effective date.",
            details={"configuration_id": duplicate.id},
        )
    configuration = BillingConfiguration(
        name=name.strip() or "Society billing rules",
        solar_credit_rate_per_kwh=solar_credit_rate_per_kwh,
        maintenance_charge=maintenance_charge,
        other_charges=other_charges,
        other_charges_description=other_charges_description,
        effective_from=effective_from,
        effective_to=effective_to,
    )
    db.add(configuration)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            "A billing configuration already exists for this effective date."
        ) from exc
    db.refresh(configuration)
    return configuration


def _bill_filters(
    *,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    method: str | None,
    period_start: date | None,
    period_end: date | None,
    current_only: bool,
    billing_month: str | None = None,
) -> list[Any]:
    filters: list[Any] = []
    if allocation_run_id is not None:
        filters.append(Bill.allocation_run_id == allocation_run_id)
    if simulation_run_id is not None:
        filters.append(Bill.simulation_run_id == simulation_run_id)
    if method:
        resolved = method.strip().upper()
        if resolved not in AllocationMethod.ALL:
            raise BadRequestError(f"Unknown allocation method {method!r}.")
        filters.append(Bill.allocation_method == resolved)
    if period_start is not None:
        filters.append(Bill.billing_period_start == period_start)
    if period_end is not None:
        filters.append(Bill.billing_period_end == period_end)
    if billing_month:
        if period_start is not None or period_end is not None:
            raise BadRequestError(
                "Provide either billing_month or explicit billing period dates, not both."
            )
        month_start, month_end = _month_bounds(billing_month)
        filters.extend(
            [
                Bill.billing_period_end >= month_start,
                Bill.billing_period_start <= month_end,
            ]
        )
    if current_only:
        filters.extend([Bill.is_current.is_(True), Bill.status == BillStatus.ISSUED])
    return filters


def _resolve_scope(db: Session, actor: User, flat_ref: str | int | None) -> Apartment | None:
    if flat_ref is not None:
        apartment = resolve_apartment(db, flat_ref)
        enforce_apartment_scope(actor, apartment)
        return apartment
    if actor.role != UserRole.ADMIN:
        if actor.apartment_id is None:
            raise ForbiddenError(
                "Your resident account is not linked to an apartment yet."
            )
        apartment = db.get(Apartment, actor.apartment_id)
        if apartment is None:
            raise NotFoundError("The apartment linked to your account was not found.")
        return apartment
    return None


def summary(
    db: Session,
    *,
    actor: User,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: str | None = None,
    flat_ref: str | int | None = None,
) -> dict[str, Any]:
    apartment = _resolve_scope(db, actor, flat_ref)
    filters = _bill_filters(
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        period_start=billing_period_start,
        period_end=billing_period_end,
        current_only=True,
        billing_month=billing_month,
    )
    if apartment is not None:
        filters.append(Bill.apartment_id == apartment.id)

    if (
        billing_period_start is None
        and billing_period_end is None
        and not billing_month
    ):
        latest_period = db.execute(
            select(Bill.billing_period_start, Bill.billing_period_end)
            .where(*filters)
            .order_by(Bill.billing_period_end.desc(), Bill.billing_period_start.desc())
            .limit(1)
        ).first()
        if latest_period is not None:
            filters.extend(
                [
                    Bill.billing_period_start == latest_period[0],
                    Bill.billing_period_end == latest_period[1],
                ]
            )

    bills = list(
        db.scalars(
            select(Bill)
            .where(*filters)
            .order_by(Bill.billing_period_end.desc(), Bill.apartment_id)
        ).all()
    )
    payloads = [bill_payload(db, bill, include_line_items=False) for bill in bills]
    totals = _totals(payloads)

    period_rows = db.execute(
        select(
            Bill.billing_period_start,
            Bill.billing_period_end,
            Bill.billing_period_label,
            func.count(Bill.id),
        )
        .where(*_bill_filters(
            allocation_run_id=allocation_run_id,
            simulation_run_id=simulation_run_id,
            method=method,
            period_start=None,
            period_end=None,
            current_only=True,
            billing_month=billing_month,
        ), *([Bill.apartment_id == apartment.id] if apartment else []))
        .group_by(
            Bill.billing_period_start,
            Bill.billing_period_end,
            Bill.billing_period_label,
        )
        .order_by(Bill.billing_period_end.desc())
        .limit(24)
    ).all()

    audit_filters: list[Any] = []
    if apartment is not None:
        audit_filters.append(BillingAudit.apartment_id == apartment.id)
    pending_issues = int(
        db.scalar(
            select(func.count())
            .select_from(BillingAudit)
            .where(
                BillingAudit.status.in_(AuditStatus.OPEN),
                *audit_filters,
            )
        )
        or 0
    )
    last_audit_at = db.scalar(
        select(func.max(BillingAudit.created_at)).where(*audit_filters)
        if audit_filters
        else select(func.max(BillingAudit.created_at))
    )
    latest_bill_at = db.scalar(
        select(func.max(Bill.generated_at)).where(*filters)
    )

    configurations = list_configurations(db)
    return {
        "scope": "RESIDENT" if actor.role != UserRole.ADMIN else "ADMIN",
        "apartment": _apartment_payload(apartment) if apartment is not None else None,
        "totals": totals,
        "bills_generated": len(payloads),
        "apartments_billed": len({item["apartment_id"] for item in payloads}),
        "pending_audit_issues": pending_issues,
        "last_audit_at": last_audit_at,
        "latest_bill_at": latest_bill_at,
        "bills": payloads,
        "apartments": payloads,
        "periods": [
            {
                "start": row[0],
                "end": row[1],
                "label": row[2],
                "bills": int(row[3]),
            }
            for row in period_rows
        ],
        "available_runs": list_available_runs(db),
        "tariff_revisions": list_tariffs(db),
        "billing_configurations": configurations,
        "latest_configuration": configurations[-1] if configurations else None,
        "disclaimer": (
            "Grid charges are estimated from society tariff configuration and are "
            "not an official BESCOM bill. Solar credits and estimated savings are "
            "internal society benefits."
        ),
    }


def list_flats(
    db: Session,
    *,
    actor: User,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    apartment = _resolve_scope(db, actor, None)
    filters = _bill_filters(
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        period_start=billing_period_start,
        period_end=billing_period_end,
        current_only=False,
        billing_month=billing_month,
    )
    if apartment is not None:
        filters.append(Bill.apartment_id == apartment.id)
    if status:
        resolved = status.strip().upper()
        if resolved not in BillStatus.ALL:
            raise BadRequestError(f"Unknown bill status {status!r}.")
        filters.append(Bill.status == resolved)
    if search:
        filters.append(Apartment.flat_number.ilike(f"%{search.strip()}%"))

    stmt = (
        select(Bill, Apartment)
        .join(Apartment, Apartment.id == Bill.apartment_id)
        .where(*filters)
    )
    count_stmt = (
        select(func.count())
        .select_from(Bill)
        .join(Apartment, Apartment.id == Bill.apartment_id)
        .where(*filters)
    )
    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        stmt.order_by(
            Bill.billing_period_end.desc(),
            Apartment.flat_number,
            Bill.version.desc(),
        )
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        bill_payload(db, bill, include_line_items=False) for bill, _ in rows
    ]
    return {"total": total, "limit": limit, "offset": offset, "items": items}


def flat_detail(
    db: Session,
    *,
    actor: User,
    flat_ref: str | int,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: str | None = None,
) -> dict[str, Any]:
    apartment = resolve_apartment(db, flat_ref)
    enforce_apartment_scope(actor, apartment)
    filters = _bill_filters(
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        period_start=billing_period_start,
        period_end=billing_period_end,
        current_only=True,
        billing_month=billing_month,
    )
    filters.append(Bill.apartment_id == apartment.id)
    bills = list(
        db.scalars(
            select(Bill)
            .where(*filters)
            .order_by(Bill.billing_period_end.desc(), Bill.version.desc())
        ).all()
    )
    payloads = [bill_payload(db, bill, include_line_items=True) for bill in bills]
    return {
        "apartment": _apartment_payload(apartment),
        "resident": _actor_payload(_resident_for_apartment(db, apartment.id)),
        "bill": payloads[0] if payloads else None,
        "bills": payloads,
        "history_count": len(payloads),
        "filters": {
            "allocation_run_id": allocation_run_id,
            "simulation_run_id": simulation_run_id,
            "method": method,
            "billing_period_start": billing_period_start,
            "billing_period_end": billing_period_end,
            "billing_month": billing_month,
        },
    }


def history(
    db: Session,
    *,
    actor: User,
    flat_ref: str | int,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    apartment = resolve_apartment(db, flat_ref)
    enforce_apartment_scope(actor, apartment)
    filters = _bill_filters(
        allocation_run_id=allocation_run_id,
        simulation_run_id=simulation_run_id,
        method=method,
        period_start=billing_period_start,
        period_end=billing_period_end,
        current_only=False,
        billing_month=billing_month,
    )
    filters.append(Bill.apartment_id == apartment.id)
    total = int(
        db.scalar(
            select(func.count()).select_from(Bill).where(*filters)
        )
        or 0
    )
    bills = list(
        db.scalars(
            select(Bill)
            .where(*filters)
            .order_by(Bill.billing_period_end.desc(), Bill.version.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return {
        "apartment": _apartment_payload(apartment),
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            bill_payload(db, bill, include_line_items=False) for bill in bills
        ],
    }


def get_bill(db: Session, *, actor: User, bill_id: int) -> dict[str, Any]:
    bill = db.get(Bill, bill_id)
    if bill is None:
        raise NotFoundError(f"Bill {bill_id} was not found.")
    apartment = bill.apartment or db.get(Apartment, bill.apartment_id)
    if apartment is None:
        raise NotFoundError("The apartment for this bill was not found.")
    enforce_apartment_scope(actor, apartment)
    return bill_payload(db, bill)


def get_bill_model(db: Session, bill_id: int) -> Bill:
    bill = db.get(Bill, bill_id)
    if bill is None:
        raise NotFoundError(f"Bill {bill_id} was not found.")
    return bill
