"""Independent BillFair audit.

This module intentionally does **not** call the billing service.  It reads the
original hourly allocation records, tariff revisions and billing configuration
rows again, recalculates each statement with :mod:`app.services.billing_engine`
and compares the result with the stored bill.

Audits are append-only.  They never modify issued bills, even when a
discrepancy is found; an administrator must review the finding explicitly.
"""

from __future__ import annotations

import calendar
import hashlib
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.allocation import (
    AllocationMethod,
    AllocationRecord,
    AllocationRun,
    AllocationSummary,
)
from app.models.apartment import Apartment
from app.models.billing import (
    AuditCheckType,
    AuditStatus,
    Bill,
    BillStatus,
    BillingAudit,
    BillingConfiguration,
)
from app.models.electricity_tariff import ElectricityTariff
from app.models.user import User, UserRole
from app.services import billing_engine

ENERGY_TOLERANCE = Decimal("0.001")
MONEY_TOLERANCE = Decimal("0.01")
RATE_TOLERANCE = Decimal("0.0001")
PERCENT_TOLERANCE = Decimal("0.01")


def _utc(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        candidate = value
    else:
        candidate = datetime.combine(value, time.min)
    if candidate.tzinfo is None:
        return candidate.replace(tzinfo=timezone.utc)
    return candidate.astimezone(timezone.utc)


def _period_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def _month_bounds(month: str) -> tuple[date, date]:
    try:
        year_text, month_text = month.split("-", 1)
        year = int(year_text)
        month_number = int(month_text)
        if len(year_text) != 4 or len(month_text) != 2:
            raise ValueError
        start = date(year, month_number, 1)
    except (TypeError, ValueError) as exc:
        raise BadRequestError("billing_month must be formatted as YYYY-MM.") from exc
    return start, date(
        year, month_number, calendar.monthrange(year, month_number)[1]
    )


def _resolve_run(
    db: Session,
    *,
    allocation_run_id: int | None,
    simulation_run_id: int | None,
    method: str | None,
) -> AllocationRun:
    if allocation_run_id is not None:
        run = db.get(AllocationRun, allocation_run_id)
        if run is None:
            raise NotFoundError(f"Allocation run {allocation_run_id} was not found.")
    else:
        stmt = (
            select(AllocationRun)
            .where(AllocationRun.is_hypothetical.is_(False))
            .order_by(AllocationRun.id.desc())
            .limit(1)
        )
        if simulation_run_id is not None:
            stmt = stmt.where(AllocationRun.simulation_run_id == simulation_run_id)
        if method:
            normalized = method.strip().upper()
            if normalized not in AllocationMethod.ALL:
                raise BadRequestError(f"Unknown allocation method {method!r}.")
            stmt = stmt.where(AllocationRun.method == normalized)
        run = db.scalar(stmt)
        if run is None:
            raise BadRequestError(
                "No saved allocation run is available for auditing."
            )
    if run.is_hypothetical:
        raise BadRequestError("Hypothetical allocation runs cannot be audited.")
    if simulation_run_id is not None and run.simulation_run_id != simulation_run_id:
        raise BadRequestError(
            "allocation_run_id and simulation_run_id refer to different runs."
        )
    if method:
        normalized = method.strip().upper()
        if normalized not in AllocationMethod.ALL:
            raise BadRequestError(f"Unknown allocation method {method!r}.")
        if run.method != normalized:
            raise BadRequestError(
                "allocation_run_id and method refer to different methods."
            )
    return run


def _resolve_period(
    run: AllocationRun,
    *,
    billing_period_start: date | None,
    billing_period_end: date | None,
    billing_month: str | None,
) -> tuple[date, date]:
    if billing_month and (billing_period_start or billing_period_end):
        raise BadRequestError(
            "Provide either billing_month or explicit billing period dates, not both."
        )
    if billing_month:
        month_start, month_end = _month_bounds(billing_month)
        start = max(month_start, run.date_from)
        end = min(month_end, run.date_to)
        if start > end:
            raise BadRequestError(
                f"Billing month {billing_month} does not overlap allocation run {run.id}."
            )
        return start, end
    start = billing_period_start or run.date_from
    end = billing_period_end or run.date_to
    if start > end:
        raise BadRequestError("billing_period_start must be on or before end.")
    if start < run.date_from or end > run.date_to:
        raise BadRequestError("The audit period falls outside the allocation run.")
    return start, end


def _tariffs_for_period(
    db: Session, start: date, end: date
) -> dict[date, ElectricityTariff]:
    revisions = list(
        db.scalars(
            select(ElectricityTariff)
            .where(
                ElectricityTariff.effective_from <= end,
                (ElectricityTariff.effective_to.is_(None))
                | (ElectricityTariff.effective_to >= start),
            )
            .order_by(ElectricityTariff.effective_from)
        ).all()
    )
    result: dict[date, ElectricityTariff] = {}
    for day in _period_days(start, end):
        applicable = [
            item
            for item in revisions
            if item.effective_from <= day
            and (item.effective_to is None or item.effective_to >= day)
        ]
        if not applicable:
            raise BadRequestError(
                "No electricity tariff covers the audit period.",
                details={"day": day.isoformat()},
            )
        result[day] = max(applicable, key=lambda item: (item.effective_from, item.id))
    return result


def _configurations_for_period(
    db: Session, start: date, end: date
) -> dict[date, BillingConfiguration]:
    revisions = list(
        db.scalars(
            select(BillingConfiguration)
            .where(
                BillingConfiguration.effective_from <= end,
                (BillingConfiguration.effective_to.is_(None))
                | (BillingConfiguration.effective_to >= start),
            )
            .order_by(BillingConfiguration.effective_from)
        ).all()
    )
    result: dict[date, BillingConfiguration] = {}
    for day in _period_days(start, end):
        applicable = [
            item
            for item in revisions
            if item.effective_from <= day
            and (item.effective_to is None or item.effective_to >= day)
        ]
        if not applicable:
            raise BadRequestError(
                "No billing configuration covers the audit period.",
                details={"day": day.isoformat()},
            )
        result[day] = max(applicable, key=lambda item: (item.effective_from, item.id))
    return result


def _usage_for_apartment(
    db: Session,
    run: AllocationRun,
    apartment_id: int,
    start: date,
    end: date,
) -> dict[date, dict[str, Decimal | int]]:
    rows = db.execute(
        select(
            AllocationRecord.reading_time,
            AllocationRecord.consumption_kwh,
            AllocationRecord.allocated_solar_kwh,
            AllocationRecord.grid_import_kwh,
        ).where(
            AllocationRecord.allocation_run_id == run.id,
            AllocationRecord.apartment_id == apartment_id,
            AllocationRecord.reading_time >= _utc(start),
            AllocationRecord.reading_time < _utc(end + timedelta(days=1)),
        )
    ).all()
    result: dict[date, dict[str, Decimal | int]] = {}
    for reading_time, consumption, solar, grid in rows:
        day = _utc(reading_time).date()
        bucket = result.setdefault(
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
        bucket["hours"] = int(bucket["hours"]) + 1
    return result


def _recalculate(
    db: Session,
    *,
    run: AllocationRun,
    apartment: Apartment,
    start: date,
    end: date,
) -> tuple[billing_engine.BillCalculation, dict[str, Any]]:
    tariff_by_day = _tariffs_for_period(db, start, end)
    config_by_day = _configurations_for_period(db, start, end)
    usage = _usage_for_apartment(db, run, apartment.id, start, end)
    if not usage:
        raise BadRequestError(
            "No allocation records exist for this apartment and period.",
            details={
                "apartment_id": apartment.id,
                "flat_number": apartment.flat_number,
                "period_start": str(start),
                "period_end": str(end),
            },
        )

    segments: list[billing_engine.ChargeSegment] = []
    current: dict[str, Any] | None = None
    for day in _period_days(start, end):
        tariff = tariff_by_day[day]
        configuration = config_by_day[day]
        key = (tariff.id, configuration.id)
        if current is None or current["key"] != key:
            if current is not None:
                segments.append(
                    billing_engine.ChargeSegment(
                        start_date=current["start"],
                        end_date=current["end"],
                        tariff_id=current["tariff"].id,
                        tariff_price_per_kwh=billing_engine.to_decimal(
                            current["tariff"].price_per_kwh
                        ),
                        config_id=current["configuration"].id,
                        solar_credit_rate_per_kwh=billing_engine.to_decimal(
                            current["configuration"].solar_credit_rate_per_kwh
                        ),
                        consumption_kwh=billing_engine.energy(current["consumption"]),
                        solar_allocation_kwh=billing_engine.energy(current["solar"]),
                        hour_count=int(current["hours"]),
                    )
                )
            current = {
                "key": key,
                "start": day,
                "end": day,
                "tariff": tariff,
                "configuration": configuration,
                "consumption": Decimal("0"),
                "solar": Decimal("0"),
                "hours": 0,
            }
        else:
            current["end"] = day
        day_usage = usage.get(day)
        if day_usage:
            current["consumption"] += day_usage["consumption"]
            current["solar"] += day_usage["solar"]
            current["hours"] = int(current["hours"]) + int(day_usage["hours"])

    if current is not None:
        segments.append(
            billing_engine.ChargeSegment(
                start_date=current["start"],
                end_date=current["end"],
                tariff_id=current["tariff"].id,
                tariff_price_per_kwh=billing_engine.to_decimal(
                    current["tariff"].price_per_kwh
                ),
                config_id=current["configuration"].id,
                solar_credit_rate_per_kwh=billing_engine.to_decimal(
                    current["configuration"].solar_credit_rate_per_kwh
                ),
                consumption_kwh=billing_engine.energy(current["consumption"]),
                solar_allocation_kwh=billing_engine.energy(current["solar"]),
                hour_count=int(current["hours"]),
            )
        )

    maintenance_raw = sum(
        (
            billing_engine.daily_prorated_amount(
                config_by_day[day].maintenance_charge, day
            )
            for day in _period_days(start, end)
        ),
        Decimal("0"),
    )
    other_raw = sum(
        (
            billing_engine.daily_prorated_amount(
                config_by_day[day].other_charges, day
            )
            for day in _period_days(start, end)
        ),
        Decimal("0"),
    )
    descriptions = sorted(
        {
            (config_by_day[day].other_charges_description or "").strip()
            for day in _period_days(start, end)
            if (config_by_day[day].other_charges_description or "").strip()
        }
    )
    calculation = billing_engine.calculate_bill(
        segments,
        maintenance_charge=billing_engine.money(maintenance_raw),
        other_charges=billing_engine.money(other_raw),
        other_charges_description=(
            "Other society charges" if not descriptions else "; ".join(descriptions)
        ),
    )
    meta = {
        "source_hour_count": sum(int(item["hours"]) for item in usage.values()),
        "source_days": len(usage),
        "tariff_ids": [tariff_by_day[day].id for day in _period_days(start, end)],
        "config_ids": [config_by_day[day].id for day in _period_days(start, end)],
        "usage": {
            day.isoformat(): {
                "consumption_kwh": float(values["consumption"]),
                "solar_allocation_kwh": float(values["solar"]),
                "grid_import_kwh": float(values["grid"]),
                "hours": int(values["hours"]),
            }
            for day, values in sorted(usage.items())
        },
    }
    return calculation, meta


def _audit_row(
    *,
    batch_id: str,
    bill: Bill | None,
    apartment_id: int | None,
    run_id: int | None,
    period_start: date | None,
    period_end: date | None,
    check_type: str,
    status: str,
    severity: str,
    explanation: str,
    expected: Decimal | None = None,
    calculated: Decimal | None = None,
    discrepancy: Decimal | None = None,
    details: dict[str, Any] | None = None,
    actor_id: int | None = None,
) -> BillingAudit:
    return BillingAudit(
        audit_batch_id=batch_id,
        bill_id=bill.id if bill is not None else None,
        apartment_id=apartment_id,
        allocation_run_id=run_id,
        billing_period_start=period_start,
        billing_period_end=period_end,
        check_type=check_type,
        status=status,
        severity=severity,
        expected_amount=billing_engine.money(expected) if expected is not None else None,
        calculated_amount=(
            billing_engine.money(calculated) if calculated is not None else None
        ),
        discrepancy=(
            billing_engine.money(discrepancy) if discrepancy is not None else None
        ),
        explanation=explanation,
        details=details or {},
        created_by_id=actor_id,
    )


def _compare(
    *,
    batch_id: str,
    bill: Bill,
    calculation: billing_engine.BillCalculation,
    meta: dict[str, Any],
    actor_id: int,
) -> list[BillingAudit]:
    findings: list[BillingAudit] = []

    def add(
        check_type: str,
        expected: Any,
        calculated: Any,
        *,
        tolerance: Any,
        unit: str,
        explanation: str,
    ) -> None:
        expected_decimal = billing_engine.to_decimal(expected)
        calculated_decimal = billing_engine.to_decimal(calculated)
        discrepancy = calculated_decimal - expected_decimal
        if abs(discrepancy) <= billing_engine.to_decimal(tolerance):
            return
        is_money = unit in ("₹", "INR")
        findings.append(
            _audit_row(
                batch_id=batch_id,
                bill=bill,
                apartment_id=bill.apartment_id,
                run_id=bill.allocation_run_id,
                period_start=bill.billing_period_start,
                period_end=bill.billing_period_end,
                check_type=check_type,
                status=AuditStatus.FAIL,
                severity="ERROR",
                expected=expected_decimal,
                calculated=calculated_decimal,
                discrepancy=discrepancy,
                explanation=explanation,
                details={
                    "unit": unit,
                    "tolerance": str(tolerance),
                    "stored_value": float(calculated_decimal),
                    "recalculated_value": float(expected_decimal),
                    "bill_number": bill.bill_number,
                },
                actor_id=actor_id,
            )
        )

    add(
        AuditCheckType.CONSUMPTION,
        calculation.consumption_kwh,
        bill.consumption_kwh,
        tolerance=ENERGY_TOLERANCE,
        unit="kWh",
        explanation=(
            "Stored consumption differs from the sum of the original hourly "
            "meter/allocation records."
        ),
    )
    add(
        AuditCheckType.SOLAR_ALLOCATION,
        calculation.solar_allocation_kwh,
        bill.solar_allocation_kwh,
        tolerance=ENERGY_TOLERANCE,
        unit="kWh",
        explanation=(
            "Stored solar allocation differs from the sum of the original hourly "
            "allocation records."
        ),
    )
    add(
        AuditCheckType.GRID_IMPORT,
        calculation.grid_import_kwh,
        bill.grid_import_kwh,
        tolerance=ENERGY_TOLERANCE,
        unit="kWh",
        explanation=(
            "Stored grid import differs from consumption minus solar allocation "
            "recalculated independently."
        ),
    )
    add(
        AuditCheckType.TARIFF,
        calculation.tariff_price_per_kwh,
        bill.tariff_price_per_kwh,
        tolerance=RATE_TOLERANCE,
        unit="INR/kWh",
        explanation=(
            "The stored weighted tariff differs from the tariff revisions that "
            "were effective on the billed days."
        ),
    )
    add(
        AuditCheckType.GRID_CHARGE,
        calculation.grid_charge,
        bill.grid_charge,
        tolerance=MONEY_TOLERANCE,
        unit="INR",
        explanation=(
            "Grid charge does not equal recalculated grid import at the applicable "
            "tariff revisions."
        ),
    )
    add(
        AuditCheckType.SOLAR_CREDIT,
        calculation.solar_credit,
        bill.solar_credit,
        tolerance=MONEY_TOLERANCE,
        unit="INR",
        explanation=(
            "Internal society solar credit does not equal allocation multiplied "
            "by the configured credit rate."
        ),
    )
    add(
        AuditCheckType.MAINTENANCE,
        calculation.maintenance_charge,
        bill.maintenance_charge,
        tolerance=MONEY_TOLERANCE,
        unit="INR",
        explanation=(
            "Maintenance charge differs from the configured monthly amount "
            "prorated across the billing days."
        ),
    )
    add(
        AuditCheckType.OTHER_CHARGES,
        calculation.other_charges,
        bill.other_charges,
        tolerance=MONEY_TOLERANCE,
        unit="INR",
        explanation=(
            "Other charges differ from the configured amount prorated across the "
            "billing days."
        ),
    )
    add(
        AuditCheckType.NET_PAYABLE,
        calculation.net_payable,
        bill.net_payable,
        tolerance=MONEY_TOLERANCE,
        unit="INR",
        explanation=(
            "Net payable does not equal grid charge minus solar credit plus "
            "maintenance and other charges."
        ),
    )
    add(
        AuditCheckType.SAVINGS,
        calculation.estimated_savings,
        bill.estimated_savings,
        tolerance=MONEY_TOLERANCE,
        unit="INR",
        explanation=(
            "Estimated savings do not equal the no-solar baseline minus actual "
            "estimated cost."
        ),
    )
    add(
        AuditCheckType.CONSUMPTION,
        Decimal(meta["source_hour_count"]),
        Decimal(bill.hour_count),
        tolerance=Decimal("0"),
        unit="hours",
        explanation=(
            "The bill's hour count differs from the number of original hourly "
            "allocation records for the apartment."
        ),
    )

    expected_by_type = {
        "GRID_CHARGE": calculation.grid_charge,
        "SOLAR_CREDIT": -calculation.solar_credit,
        "MAINTENANCE": calculation.maintenance_charge,
        "OTHER_CHARGE": calculation.other_charges,
    }
    stored_by_type: dict[str, Decimal] = {}
    for item in bill.line_items:
        stored_by_type[item.charge_type] = (
            stored_by_type.get(item.charge_type, Decimal("0"))
            + billing_engine.to_decimal(item.amount)
        )
    if not bill.line_items:
        findings.append(
            _audit_row(
                batch_id=batch_id,
                bill=bill,
                apartment_id=bill.apartment_id,
                run_id=bill.allocation_run_id,
                period_start=bill.billing_period_start,
                period_end=bill.billing_period_end,
                check_type=AuditCheckType.LINE_ITEMS,
                status=AuditStatus.FAIL,
                severity="ERROR",
                expected=bill.net_payable,
                calculated=Decimal("0"),
                discrepancy=-billing_engine.to_decimal(bill.net_payable),
                explanation="The bill has no line items, so its breakdown is incomplete.",
                details={"line_items_found": 0},
                actor_id=actor_id,
            )
        )
    for charge_type, expected_amount in expected_by_type.items():
        stored_amount = billing_engine.money(stored_by_type.get(charge_type, 0))
        if abs(stored_amount - expected_amount) > MONEY_TOLERANCE:
            findings.append(
                _audit_row(
                    batch_id=batch_id,
                    bill=bill,
                    apartment_id=bill.apartment_id,
                    run_id=bill.allocation_run_id,
                    period_start=bill.billing_period_start,
                    period_end=bill.billing_period_end,
                    check_type=AuditCheckType.LINE_ITEMS,
                    status=AuditStatus.FAIL,
                    severity="ERROR",
                    expected=expected_amount,
                    calculated=stored_amount,
                    discrepancy=stored_amount - expected_amount,
                    explanation=(
                        f"Line items of type {charge_type} do not sum to the "
                        "independently recalculated amount."
                    ),
                    details={
                        "charge_type": charge_type,
                        "stored_line_total": float(stored_amount),
                        "recalculated_line_total": float(expected_amount),
                    },
                    actor_id=actor_id,
                )
            )
    line_total = billing_engine.line_item_total(bill.line_items)
    if abs(line_total - billing_engine.to_decimal(bill.net_payable)) > MONEY_TOLERANCE:
        findings.append(
            _audit_row(
                batch_id=batch_id,
                bill=bill,
                apartment_id=bill.apartment_id,
                run_id=bill.allocation_run_id,
                period_start=bill.billing_period_start,
                period_end=bill.billing_period_end,
                check_type=AuditCheckType.LINE_ITEMS,
                status=AuditStatus.FAIL,
                severity="ERROR",
                expected=bill.net_payable,
                calculated=line_total,
                discrepancy=line_total - billing_engine.to_decimal(bill.net_payable),
                explanation=(
                    "Signed line-item amounts do not add up to the stored net "
                    "payable amount."
                ),
                details={
                    "line_items_total": float(line_total),
                    "net_payable": float(bill.net_payable),
                },
                actor_id=actor_id,
            )
        )

    if not findings:
        findings.append(
            _audit_row(
                batch_id=batch_id,
                bill=bill,
                apartment_id=bill.apartment_id,
                run_id=bill.allocation_run_id,
                period_start=bill.billing_period_start,
                period_end=bill.billing_period_end,
                check_type=AuditCheckType.BILL_RECALCULATION,
                status=AuditStatus.PASS,
                severity="INFO",
                expected=calculation.net_payable,
                calculated=bill.net_payable,
                discrepancy=Decimal("0"),
                explanation=(
                    "Independent recalculation matches the issued bill across "
                    "energy, tariff, credits, charges, savings and line items."
                ),
                details={
                    "source_hour_count": meta["source_hour_count"],
                    "tariff_ids": sorted(set(meta["tariff_ids"])),
                    "config_ids": sorted(set(meta["config_ids"])),
                    "recalculated": calculation.as_dict(),
                },
                actor_id=actor_id,
            )
        )
    return findings


def run_audit(
    db: Session,
    *,
    actor: User,
    allocation_run_id: int | None = None,
    simulation_run_id: int | None = None,
    method: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    billing_month: str | None = None,
    bill_ids: list[int] | None = None,
    include_passed: bool = True,
) -> dict[str, Any]:
    if actor.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can run billing audits.")

    if bill_ids:
        selected = list(
            db.scalars(
                select(Bill).where(Bill.id.in_(bill_ids)).order_by(Bill.id)
            ).all()
        )
        missing_ids = sorted(set(bill_ids) - {bill.id for bill in selected})
        if missing_ids:
            raise NotFoundError(
                "Some bills were not found.", details={"missing_bill_ids": missing_ids}
            )
        runs = {bill.allocation_run_id for bill in selected}
        if len(runs) != 1:
            raise BadRequestError("All audited bills must belong to one allocation run.")
        run = db.get(AllocationRun, runs.pop())
        if run is None:
            raise NotFoundError("The allocation run for these bills was not found.")
        periods = {(bill.billing_period_start, bill.billing_period_end) for bill in selected}
        if len(periods) != 1:
            raise BadRequestError("All audited bills must cover one billing period.")
        start, end = periods.pop()
        bills = selected
    else:
        run = _resolve_run(
            db,
            allocation_run_id=allocation_run_id,
            simulation_run_id=simulation_run_id,
            method=method,
        )
        start, end = _resolve_period(
            run,
            billing_period_start=billing_period_start,
            billing_period_end=billing_period_end,
            billing_month=billing_month,
        )
        bills = list(
            db.scalars(
                select(Bill).where(
                    Bill.allocation_run_id == run.id,
                    Bill.billing_period_start == start,
                    Bill.billing_period_end == end,
                    Bill.is_current.is_(True),
                )
            ).all()
        )

    batch_id = (
        f"BA-{datetime.now(timezone.utc):%Y%m%d%H%M%S}-"
        f"{uuid.uuid4().hex[:6].upper()}"
    )
    findings: list[BillingAudit] = []
    audited = 0
    passed = 0
    failed = 0

    for bill in bills:
        apartment = bill.apartment or db.get(Apartment, bill.apartment_id)
        if apartment is None:
            findings.append(
                _audit_row(
                    batch_id=batch_id,
                    bill=bill,
                    apartment_id=bill.apartment_id,
                    run_id=bill.allocation_run_id,
                    period_start=bill.billing_period_start,
                    period_end=bill.billing_period_end,
                    check_type=AuditCheckType.BILL_RECALCULATION,
                    status=AuditStatus.FAIL,
                    severity="ERROR",
                    explanation="The apartment for this bill no longer exists.",
                    actor_id=actor.id,
                )
            )
            failed += 1
            continue
        try:
            calculation, meta = _recalculate(
                db,
                run=run,
                apartment=apartment,
                start=bill.billing_period_start,
                end=bill.billing_period_end,
            )
        except BadRequestError as exc:
            findings.append(
                _audit_row(
                    batch_id=batch_id,
                    bill=bill,
                    apartment_id=apartment.id,
                    run_id=bill.allocation_run_id,
                    period_start=bill.billing_period_start,
                    period_end=bill.billing_period_end,
                    check_type=AuditCheckType.CONSUMPTION,
                    status=AuditStatus.FAIL,
                    severity="ERROR",
                    explanation=exc.message,
                    details=exc.details or {},
                    actor_id=actor.id,
                )
            )
            failed += 1
            audited += 1
            continue

        bill_findings = _compare(
            batch_id=batch_id,
            bill=bill,
            calculation=calculation,
            meta=meta,
            actor_id=actor.id,
        )
        findings.extend(bill_findings)
        audited += 1
        if any(item.status == AuditStatus.FAIL for item in bill_findings):
            failed += 1
        else:
            passed += 1

    missing = 0
    duplicates = 0
    if not bill_ids:
        target_apartment_ids = {bill.apartment_id for bill in bills}
        summary_rows = db.execute(
            select(AllocationSummary, Apartment)
            .join(Apartment, Apartment.id == AllocationSummary.apartment_id)
            .where(AllocationSummary.allocation_run_id == run.id)
            .order_by(Apartment.flat_number)
        ).all()
        for _, apartment in summary_rows:
            if apartment.id in target_apartment_ids:
                continue
            try:
                calculation, meta = _recalculate(
                    db, run=run, apartment=apartment, start=start, end=end
                )
                expected = calculation.net_payable
                details = {
                    "flat_number": apartment.flat_number,
                    "recalculated": calculation.as_dict(),
                    "source_hour_count": meta["source_hour_count"],
                }
            except BadRequestError as exc:
                expected = None
                details = {
                    "flat_number": apartment.flat_number,
                    "source_error": exc.message,
                    "source_details": exc.details or {},
                }
            missing += 1
            findings.append(
                _audit_row(
                    batch_id=batch_id,
                    bill=None,
                    apartment_id=apartment.id,
                    run_id=run.id,
                    period_start=start,
                    period_end=end,
                    check_type=AuditCheckType.MISSING_BILL,
                    status=AuditStatus.FAIL,
                    severity="ERROR",
                    expected=expected,
                    calculated=None,
                    discrepancy=None,
                    explanation=(
                        f"No current bill exists for flat {apartment.flat_number} in "
                        "this allocation run and billing period."
                    ),
                    details=details,
                    actor_id=actor.id,
                )
            )

        duplicate_rows = db.execute(
            select(Bill.apartment_id, func.count(Bill.id))
            .where(
                Bill.allocation_run_id == run.id,
                Bill.billing_period_start == start,
                Bill.billing_period_end == end,
                Bill.is_current.is_(True),
            )
            .group_by(Bill.apartment_id)
            .having(func.count(Bill.id) > 1)
        ).all()
        for apartment_id, count in duplicate_rows:
            apartment = db.get(Apartment, apartment_id)
            apartment_bills = list(
                db.scalars(
                    select(Bill).where(
                        Bill.allocation_run_id == run.id,
                        Bill.billing_period_start == start,
                        Bill.billing_period_end == end,
                        Bill.apartment_id == apartment_id,
                        Bill.is_current.is_(True),
                    )
                ).all()
            )
            duplicates += 1
            findings.append(
                _audit_row(
                    batch_id=batch_id,
                    bill=apartment_bills[-1] if apartment_bills else None,
                    apartment_id=apartment_id,
                    run_id=run.id,
                    period_start=start,
                    period_end=end,
                    check_type=AuditCheckType.DUPLICATE_BILL,
                    status=AuditStatus.FAIL,
                    severity="ERROR",
                    expected=(
                        apartment_bills[0].net_payable if apartment_bills else None
                    ),
                    calculated=(
                        sum(
                            billing_engine.to_decimal(item.net_payable)
                            for item in apartment_bills
                        )
                        if apartment_bills
                        else None
                    ),
                    discrepancy=(
                        billing_engine.to_decimal(apartment_bills[0].net_payable)
                        if apartment_bills
                        else None
                    ),
                    explanation=(
                        f"Flat {apartment.flat_number if apartment else apartment_id} "
                        f"has {count} current bills for the same run and period."
                    ),
                    details={
                        "bill_ids": [item.id for item in apartment_bills],
                        "bill_numbers": [
                            item.bill_number for item in apartment_bills
                        ],
                    },
                    actor_id=actor.id,
                )
            )

    if include_passed:
        db.add_all(findings)
    else:
        db.add_all(
            [item for item in findings if item.status != AuditStatus.PASS]
        )
    db.commit()
    for finding in findings:
        db.refresh(finding)

    stored_findings = (
        findings
        if include_passed
        else [item for item in findings if item.status != AuditStatus.PASS]
    )
    return {
        "audit_batch_id": batch_id,
        "allocation_run_id": run.id,
        "simulation_run_id": run.simulation_run_id,
        "allocation_method": run.method,
        "billing_period_start": start,
        "billing_period_end": end,
        "bills_audited": audited,
        "passed": passed,
        "failed": failed,
        "missing_bills": missing,
        "duplicate_bills": duplicates,
        "issues_found": failed + missing + duplicates,
        "include_passed": include_passed,
        "findings": [audit_payload(item) for item in stored_findings],
        "created_at": datetime.now(timezone.utc),
        "created_by": {
            "id": actor.id,
            "name": actor.name,
            "email": actor.email,
        },
        "message": (
            "Audit completed. No issued bill was modified. Discrepancies require "
            "administrator review."
        ),
    }


def audit_payload(audit: BillingAudit) -> dict[str, Any]:
    bill = audit.bill
    apartment = audit.apartment
    return {
        "id": audit.id,
        "audit_batch_id": audit.audit_batch_id,
        "bill_id": audit.bill_id,
        "bill_number": bill.bill_number if bill is not None else None,
        "apartment_id": audit.apartment_id,
        "flat_number": (
            apartment.flat_number
            if apartment is not None
            else (bill.apartment.flat_number if bill is not None and bill.apartment else None)
        ),
        "allocation_run_id": audit.allocation_run_id,
        "billing_period_start": audit.billing_period_start,
        "billing_period_end": audit.billing_period_end,
        "check_type": audit.check_type,
        "status": audit.status,
        "severity": audit.severity,
        "expected_amount": (
            float(audit.expected_amount)
            if audit.expected_amount is not None
            else None
        ),
        "calculated_amount": (
            float(audit.calculated_amount)
            if audit.calculated_amount is not None
            else None
        ),
        "discrepancy": (
            float(audit.discrepancy) if audit.discrepancy is not None else None
        ),
        "explanation": audit.explanation,
        "details": audit.details or {},
        "created_at": audit.created_at,
        "created_by": (
            {
                "id": audit.created_by.id,
                "name": audit.created_by.name,
                "email": audit.created_by.email,
            }
            if audit.created_by is not None
            else None
        ),
        "reviewed_at": audit.reviewed_at,
        "reviewed_by": (
            {
                "id": audit.reviewed_by.id,
                "name": audit.reviewed_by.name,
                "email": audit.reviewed_by.email,
            }
            if audit.reviewed_by is not None
            else None
        ),
        "review_note": audit.review_note,
    }


def list_audits(
    db: Session,
    *,
    audit_batch_id: str | None = None,
    bill_id: int | None = None,
    apartment_id: int | None = None,
    status: str | None = None,
    check_type: str | None = None,
    billing_period_start: date | None = None,
    billing_period_end: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    filters: list[Any] = []
    if audit_batch_id:
        filters.append(BillingAudit.audit_batch_id == audit_batch_id)
    if bill_id is not None:
        filters.append(BillingAudit.bill_id == bill_id)
    if apartment_id is not None:
        filters.append(BillingAudit.apartment_id == apartment_id)
    if status:
        normalized = status.strip().upper()
        if normalized not in AuditStatus.ALL:
            raise BadRequestError(f"Unknown audit status {status!r}.")
        filters.append(BillingAudit.status == normalized)
    if check_type:
        normalized = check_type.strip().upper()
        if normalized not in AuditCheckType.ALL:
            raise BadRequestError(f"Unknown audit check type {check_type!r}.")
        filters.append(BillingAudit.check_type == normalized)
    if billing_period_start is not None:
        filters.append(BillingAudit.billing_period_start == billing_period_start)
    if billing_period_end is not None:
        filters.append(BillingAudit.billing_period_end == billing_period_end)

    total = int(
        db.scalar(
            select(func.count()).select_from(BillingAudit).where(*filters)
        )
        or 0
    )
    rows = list(
        db.scalars(
            select(BillingAudit)
            .where(*filters)
            .order_by(BillingAudit.created_at.desc(), BillingAudit.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    counts = {
        row[0]: int(row[1])
        for row in db.execute(
            select(BillingAudit.status, func.count(BillingAudit.id))
            .where(*filters)
            .group_by(BillingAudit.status)
        ).all()
    }
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [audit_payload(item) for item in rows],
        "status_counts": counts,
    }


def review_audit(
    db: Session,
    *,
    actor: User,
    audit_id: int,
    note: str | None,
) -> dict[str, Any]:
    if actor.role != UserRole.ADMIN:
        raise ForbiddenError("Only administrators can review billing audits.")
    audit = db.get(BillingAudit, audit_id)
    if audit is None:
        raise NotFoundError(f"Billing audit {audit_id} was not found.")
    if audit.status == AuditStatus.REVIEWED:
        return audit_payload(audit)
    audit.status = AuditStatus.REVIEWED
    audit.reviewed_by_id = actor.id
    audit.reviewed_at = datetime.now(timezone.utc)
    audit.review_note = (note or "").strip() or None
    db.commit()
    db.refresh(audit)
    return audit_payload(audit)


def audit_checksum(payload: dict[str, Any]) -> str:
    """Stable checksum used by tests and diagnostics."""

    return hashlib.sha256(
        str(sorted(payload.items())).encode("utf-8")
    ).hexdigest()
