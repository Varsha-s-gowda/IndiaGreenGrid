"""End-to-end tests for the BillFair billing and audit APIs."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select

from app.models.allocation import AllocationRecord
from app.models.apartment import Apartment
from app.models.billing import Bill, BillLineItem, BillStatus
from app.models.electricity_tariff import ElectricityTariff
from tests.allocation_helpers import create_linked_resident
from tests.billing_helpers import setup_billing_world
from tests.helpers import DEFAULT_PASSWORD, login_headers

ADMIN_EMAIL = "billing.admin@example.com"


def _admin_headers(client) -> dict[str, str]:
    return login_headers(client, ADMIN_EMAIL, DEFAULT_PASSWORD)


def _apartment(db, flat_number: str) -> Apartment:
    apartment = db.scalar(
        select(Apartment).where(Apartment.flat_number == flat_number)
    )
    assert apartment is not None
    return apartment


def _bill_for(db, flat_number: str, *, version: int | None = None) -> Bill:
    apartment = _apartment(db, flat_number)
    stmt = select(Bill).where(Bill.apartment_id == apartment.id)
    if version is not None:
        stmt = stmt.where(Bill.version == version)
    else:
        stmt = stmt.where(Bill.is_current.is_(True))
    bill = db.scalar(stmt)
    assert bill is not None
    return bill


def _generate(client, headers, **overrides):
    payload = {"save": False, **overrides}
    response = client.post("/api/billing/generate", json=payload, headers=headers)
    return response


def _assert_bill_math(bill: dict) -> None:
    consumption = Decimal(str(bill["consumption_kwh"]))
    solar = Decimal(str(bill["solar_allocation_kwh"]))
    grid = Decimal(str(bill["grid_import_kwh"]))
    assert grid == (consumption - solar).quantize(Decimal("0.000001"))
    assert Decimal(str(bill["net_payable"])) == (
        Decimal(str(bill["grid_charge"]))
        - Decimal(str(bill["solar_credit"]))
        + Decimal(str(bill["maintenance_charge"]))
        + Decimal(str(bill["other_charges"]))
    ).quantize(Decimal("0.01"))
    assert Decimal(str(bill["estimated_savings"])) == (
        Decimal(str(bill["no_solar_baseline_cost"]))
        - Decimal(str(bill["actual_estimated_cost"]))
    ).quantize(Decimal("0.01"))
    line_total = sum(Decimal(str(item["amount"])) for item in bill["line_items"])
    assert line_total == Decimal(str(bill["net_payable"]))


def test_preview_generates_all_apartments_without_writing(client, db):
    setup_billing_world(db, days=2)
    headers = _admin_headers(client)

    response = _generate(client, headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["saved"] is False
    assert body["status"] == "PREVIEW"
    assert body["apartments_generated"] == 60
    assert len(body["bills"]) == 60
    assert db.scalar(select(func.count()).select_from(Bill)) == 0
    assert db.scalar(select(func.count()).select_from(BillLineItem)) == 0

    for bill in body["bills"]:
        assert bill["status"] == "PREVIEW"
        assert bill["billing_period_start"] == "2026-03-01"
        assert bill["billing_period_end"] == "2026-03-02"
        assert bill["hour_count"] == 48
        _assert_bill_math(bill)


def test_save_persists_issued_bills_with_complete_breakdown(client, db):
    setup_billing_world(db, days=1)
    headers = _admin_headers(client)

    response = _generate(client, headers, save=True)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["saved"] is True
    assert body["apartments_generated"] == 60
    assert body["status"] == "ISSUED"

    bills = list(db.scalars(select(Bill)).all())
    assert len(bills) == 60
    assert all(bill.status == BillStatus.ISSUED for bill in bills)
    assert all(bill.is_current for bill in bills)
    assert all(bill.version == 1 for bill in bills)
    assert all(bill.issued_at is not None for bill in bills)
    assert db.scalar(select(func.count()).select_from(BillLineItem)) >= 60 * 4

    for bill in bills:
        assert bill.line_items
        signed = sum(Decimal(item.amount) for item in bill.line_items)
        assert signed == Decimal(bill.net_payable)

    a101 = next(bill for bill in bills if bill.apartment.flat_number == "A-101")
    assert a101.consumption_kwh == Decimal("24.000000")
    assert a101.maintenance_charge == Decimal("16.13")
    assert a101.grid_charge == Decimal(
        (a101.grid_import_kwh * Decimal("7.5000")).quantize(Decimal("0.01"))
    )
    assert a101.solar_credit == Decimal(
        (a101.solar_allocation_kwh * Decimal("4.0000")).quantize(Decimal("0.01"))
    )


def test_duplicate_save_returns_existing_bills_without_new_rows(client, db):
    setup_billing_world(db, days=1)
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200

    response = _generate(client, headers, save=True)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["duplicate"] is True
    assert body["duplicate_count"] == 60
    assert body["apartments_generated"] == 0
    assert db.scalar(select(func.count()).select_from(Bill)) == 60


def test_recalculation_supersedes_and_keeps_version_history(client, db):
    setup_billing_world(db, days=1)
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200

    response = _generate(client, headers, save=True, recalculate=True)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["recalculated"] is True
    assert body["superseded_count"] == 60
    assert body["apartments_generated"] == 60

    bills = list(db.scalars(select(Bill)).all())
    assert len(bills) == 120
    version_1 = [bill for bill in bills if bill.version == 1]
    version_2 = [bill for bill in bills if bill.version == 2]
    assert len(version_1) == 60 and len(version_2) == 60
    assert all(
        bill.status == BillStatus.SUPERSEDED and not bill.is_current
        for bill in version_1
    )
    assert all(
        bill.status == BillStatus.ISSUED and bill.is_current for bill in version_2
    )
    assert all(bill.supersedes_bill_id is not None for bill in version_2)

    history = client.get("/api/billing/history/A-101", headers=headers)
    assert history.status_code == 200
    assert history.json()["total"] == 2
    assert [item["version"] for item in history.json()["items"]] == [2, 1]


def test_tariff_change_mid_period_is_applied_per_calendar_day(client, db):
    _, _, simulation_run, _ = setup_billing_world(db, days=2)
    headers = _admin_headers(client)
    db.add(
        ElectricityTariff(
            price_per_kwh=Decimal("8.2500"),
            effective_from=simulation_run.start_date + timedelta(days=1),
            effective_to=simulation_run.end_date,
        )
    )
    db.commit()

    response = _generate(client, headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert any("tariff revisions" in warning for warning in body["warnings"])

    for bill in body["bills"]:
        snapshot = bill["tariff_snapshot"]
        assert len(snapshot) == 2
        assert {segment["tariff_price_per_kwh"] for segment in snapshot} == {
            7.5,
            8.25,
        }
        assert Decimal(str(bill["grid_charge"])) == sum(
            Decimal(str(segment["grid_charge"])) for segment in snapshot
        ).quantize(Decimal("0.01"))
        _assert_bill_math(bill)


def test_month_filter_applies_to_stored_bill_queries(client, db):
    setup_billing_world(db, days=2)  # 1-2 March 2026
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200

    matching = client.get(
        "/api/billing/summary?billing_month=2026-03", headers=headers
    )
    assert matching.status_code == 200, matching.text
    assert matching.json()["bills_generated"] == 60

    empty = client.get("/api/billing/summary?billing_month=2026-04", headers=headers)
    assert empty.status_code == 200, empty.text
    assert empty.json()["bills_generated"] == 0

    flats = client.get("/api/billing/flats?billing_month=2026-04", headers=headers)
    assert flats.status_code == 200
    assert flats.json()["total"] == 0

    conflict = client.get(
        "/api/billing/flats?billing_month=2026-03&billing_period_start=2026-03-01",
        headers=headers,
    )
    assert conflict.status_code == 400, conflict.text


def test_partial_billing_month_is_reported_and_prorated(client, db):
    setup_billing_world(db, days=2, start=date(2026, 3, 31))
    headers = _admin_headers(client)

    response = _generate(client, headers, billing_month="2026-04")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["billing_period"]["start"] == "2026-04-01"
    assert body["billing_period"]["end"] == "2026-04-01"
    assert body["billing_period"]["partial_month"] is True
    assert body["billing_period"]["days"] == 1
    bill = body["bills"][0]
    assert bill["maintenance_charge"] == 16.67  # Rs 500 / 30 April days


def test_missing_allocation_records_require_explicit_allow_incomplete(client, db):
    setup_billing_world(db, days=2)
    headers = _admin_headers(client)
    apartment = _apartment(db, "A-101")
    db.execute(
        delete(AllocationRecord).where(
            AllocationRecord.apartment_id == apartment.id,
            AllocationRecord.reading_time
            >= datetime(2026, 3, 2, tzinfo=timezone.utc),
        )
    )
    db.commit()

    rejected = _generate(client, headers)
    assert rejected.status_code == 400, rejected.text
    details = rejected.json()["error"]["details"]
    assert details["incomplete_count"] == 1
    assert details["incomplete_apartments"][0]["flat_number"] == "A-101"

    allowed = _generate(client, headers, allow_incomplete=True)
    assert allowed.status_code == 200, allowed.text
    body = allowed.json()
    incomplete_bill = next(
        bill for bill in body["bills"] if bill["apartment"]["flat_number"] == "A-101"
    )
    assert incomplete_bill["hour_count"] == 24
    assert any("fewer allocation records" in warning for warning in body["warnings"])


def test_audit_matches_issued_bills_and_detects_tampering(client, db):
    setup_billing_world(db, days=1)
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200

    passed = client.post("/api/billing/audits", json={}, headers=headers)
    assert passed.status_code == 200, passed.text
    body = passed.json()
    assert body["bills_audited"] == 60
    assert body["passed"] == 60
    assert body["failed"] == 0
    assert body["missing_bills"] == 0
    assert body["duplicate_bills"] == 0
    assert all(item["status"] == "PASS" for item in body["findings"])

    bill = _bill_for(db, "A-101")
    original_grid_charge = bill.grid_charge
    bill.net_payable = Decimal(bill.net_payable) + Decimal("100.00")
    db.commit()
    tampered_value = bill.net_payable

    failed = client.post("/api/billing/audits", json={}, headers=headers)
    assert failed.status_code == 200, failed.text
    body = failed.json()
    assert body["failed"] >= 1
    assert body["issues_found"] >= 1
    check_types = {item["check_type"] for item in body["findings"]}
    assert "NET_PAYABLE" in check_types
    assert "LINE_ITEMS" in check_types

    db.refresh(bill)
    assert bill.net_payable == tampered_value
    assert bill.grid_charge == original_grid_charge


def test_audit_detects_missing_and_duplicate_bills(client, db):
    setup_billing_world(db, days=1)
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200

    missing_bill = _bill_for(db, "A-101")
    db.delete(missing_bill)
    db.commit()

    duplicate_source = _bill_for(db, "A-102")
    data = {
        column.name: getattr(duplicate_source, column.name)
        for column in Bill.__table__.columns
        if column.name != "id"
    }
    data.update(
        {
            "bill_number": f"{duplicate_source.bill_number}-DUP",
            "version": duplicate_source.version + 1,
            "is_current": True,
            "status": BillStatus.ISSUED,
            "supersedes_bill_id": None,
        }
    )
    db.add(Bill(**data))
    db.commit()

    response = client.post("/api/billing/audits", json={}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["missing_bills"] >= 1
    assert body["duplicate_bills"] >= 1
    check_types = {item["check_type"] for item in body["findings"]}
    assert "MISSING_BILL" in check_types
    assert "DUPLICATE_BILL" in check_types

    audit_list = client.get("/api/billing/audits", headers=headers)
    assert audit_list.status_code == 200
    assert audit_list.json()["total"] >= 1


def test_audit_can_be_scoped_to_explicit_bill_ids(client, db):
    setup_billing_world(db, days=1)
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200
    bill = _bill_for(db, "A-101")

    response = client.post(
        "/api/billing/audits", json={"bill_ids": [bill.id]}, headers=headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["bills_audited"] == 1
    assert body["passed"] == 1
    assert body["missing_bills"] == 0
    assert body["duplicate_bills"] == 0
    assert all(item["bill_id"] == bill.id for item in body["findings"])


def test_roles_and_resident_isolation(client, db):
    setup_billing_world(db, days=1)
    create_linked_resident(db, email="owner@example.com", flat_number="A-101")
    create_linked_resident(db, email="other@example.com", flat_number="A-102")
    admin_headers = _admin_headers(client)
    assert _generate(client, admin_headers, save=True).status_code == 200

    owner_headers = login_headers(
        client, "owner@example.com", DEFAULT_PASSWORD
    )
    other_headers = login_headers(
        client, "other@example.com", DEFAULT_PASSWORD
    )

    assert (
        client.post("/api/billing/generate", json={}, headers=owner_headers).status_code
        == 403
    )
    assert (
        client.post("/api/billing/audits", json={}, headers=owner_headers).status_code
        == 403
    )

    summary = client.get("/api/billing/summary", headers=owner_headers)
    assert summary.status_code == 200
    assert summary.json()["scope"] == "RESIDENT"
    assert summary.json()["apartments_billed"] == 1
    assert summary.json()["bills"][0]["apartment"]["flat_number"] == "A-101"

    own_detail = client.get("/api/billing/flats/A-101", headers=owner_headers)
    assert own_detail.status_code == 200
    assert own_detail.json()["apartment"]["flat_number"] == "A-101"

    forbidden_flat = client.get("/api/billing/flats/A-102", headers=owner_headers)
    assert forbidden_flat.status_code == 403

    other_bill = _bill_for(db, "A-102")
    forbidden_bill = client.get(
        f"/api/billing/bills/{other_bill.id}", headers=owner_headers
    )
    assert forbidden_bill.status_code == 403

    own_bill = _bill_for(db, "A-101")
    forbidden_other_way = client.get(
        f"/api/billing/bills/{own_bill.id}", headers=other_headers
    )
    assert forbidden_other_way.status_code == 403


def test_pdf_download_is_branded_and_role_scoped(client, db):
    setup_billing_world(db, days=1)
    create_linked_resident(db, email="owner@example.com", flat_number="A-101")
    headers = _admin_headers(client)
    assert _generate(client, headers, save=True).status_code == 200

    own_bill = _bill_for(db, "A-101")
    other_bill = _bill_for(db, "A-102")

    admin_pdf = client.get(
        f"/api/billing/bills/{own_bill.id}/pdf", headers=headers
    )
    assert admin_pdf.status_code == 200
    assert admin_pdf.headers["content-type"] == "application/pdf"
    assert admin_pdf.content.startswith(b"%PDF-1.4")
    assert b"BillFair" in admin_pdf.content
    assert b"Net payable" in admin_pdf.content
    assert f"BillFair-{own_bill.bill_number}.pdf" in admin_pdf.headers[
        "content-disposition"
    ]

    owner_headers = login_headers(client, "owner@example.com", DEFAULT_PASSWORD)
    owner_pdf = client.get(
        f"/api/billing/bills/{own_bill.id}/pdf", headers=owner_headers
    )
    assert owner_pdf.status_code == 200
    assert owner_pdf.content.startswith(b"%PDF-1.4")

    forbidden = client.get(
        f"/api/billing/bills/{other_bill.id}/pdf", headers=owner_headers
    )
    assert forbidden.status_code == 403
