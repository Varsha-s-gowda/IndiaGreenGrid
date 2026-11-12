"""End-to-end coverage for the multi-stakeholder ecosystem workflows.

Workflow A: citizen <-> solar installer
Workflow B: DISCOM <-> renewable supplier (and RPO compliance)
Workflow C: citizen <-> financial institution
Workflow D: citizen <-> recycler
Workflow E: administrator <-> every stakeholder

The tests intentionally exercise the HTTP surface so authorisation, validation
and status transitions are covered exactly as the React client sees them.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.models.ecosystem import ApplicationDocument
from app.models.user import User, UserRole
from tests.helpers import DEFAULT_PASSWORD, create_user, login_headers

SOLAR_PAYLOAD = {
    "project_title": "Rooftop 5 kW installation",
    "property_type": "RESIDENTIAL",
    "address": "12 Green Street",
    "city": "Pune",
    "state": "Maharashtra",
    "pincode": "411001",
    "roof_area_sqm": 45,
    "monthly_consumption_kwh": 600,
    "desired_capacity_kwp": 5,
}

QUOTATION_PAYLOAD = {
    "price": 285000,
    "system_capacity_kwp": 5,
    "equipment_details": "Mono PERC 540 Wp x 10",
    "panel_details": "Waaree 540 Wp",
    "inverter_details": "5 kW string inverter",
    "installation_duration_days": 21,
    "warranty_years": 5,
    "description": "Turnkey rooftop installation with net metering support.",
}


def _headers(client, user: User, password: str = DEFAULT_PASSWORD) -> dict[str, str]:
    return login_headers(client, user.email, password)


def _org_user(
    db,
    *,
    email: str,
    role: UserRole,
    org_type: str | None = None,
    verified: bool = True,
    state: str = "Maharashtra",
    serviceable_states: list[str] | None = None,
):
    user = create_user(db, email=email, role=role, name=f"{role.value.title()} Account")
    user.organization = f"{role.value.title()} Demo"
    user.state = state
    user.verification_status = "VERIFIED" if verified else "PENDING"
    db.add(user)

    from app.models.ecosystem import OrganisationProfile

    profile = OrganisationProfile(
        owner_id=user.id,
        organisation_type=org_type or role.value,
        name=f"{role.value.title()} Demo",
        city="Pune",
        state=state,
        contact_email=email,
        description="Test organisation",
        services=["INSTALLATION"] if role == UserRole.SOLAR_INSTALLER else [],
        serviceable_states=(
            serviceable_states if serviceable_states is not None else [state]
        ),
        energy_types=["SOLAR"],
        accepted_categories=[
            "SOLAR_PANEL",
            "EWASTE",
            "LITHIUM_ION",
            "EV_BATTERY",
            "LEAD_ACID",
            "OTHER",
        ],
        verification_status="VERIFIED" if verified else "PENDING",
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    db.refresh(profile)
    return user, profile


def _admin(db) -> User:
    return create_user(db, email="admin@example.com", role=UserRole.ADMIN, name="Admin")


def _create_solar_request(client, headers) -> dict:
    response = client.post("/api/solar-requests", json=SOLAR_PAYLOAD, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Workflow A - citizen <-> solar installer
# --------------------------------------------------------------------------- #


def test_solar_workflow_end_to_end(client, db):
    citizen = create_user(db, email="citizen@example.com", role=UserRole.CITIZEN)
    installer, _ = _org_user(db, email="installer@example.com", role=UserRole.SOLAR_INSTALLER)
    admin = _admin(db)
    other_citizen = create_user(db, email="other@example.com", role=UserRole.CITIZEN)

    citizen_headers = _headers(client, citizen)
    installer_headers = _headers(client, installer)
    admin_headers = _headers(client, admin)
    other_headers = _headers(client, other_citizen)

    created = _create_solar_request(client, citizen_headers)
    request_id = created["id"]
    assert created["status"] == "REQUESTED"

    # The installer sees the open request in their scoped listing.
    listing = client.get("/api/solar-requests", headers=installer_headers).json()
    assert any(item["id"] == request_id for item in listing["items"])

    accepted = client.post(
        f"/api/solar-requests/{request_id}/accept",
        json={"note": "We can deliver this."},
        headers=installer_headers,
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "ACCEPTED"

    # Cannot accept twice.
    duplicate = client.post(
        f"/api/solar-requests/{request_id}/accept",
        json={"note": ""},
        headers=installer_headers,
    )
    assert duplicate.status_code == 400

    quote = client.post(
        f"/api/solar-requests/{request_id}/quotations",
        json=QUOTATION_PAYLOAD,
        headers=installer_headers,
    )
    assert quote.status_code == 201, quote.text
    quotation_id = quote.json()["id"]

    detail = client.get(f"/api/solar-requests/{request_id}", headers=citizen_headers)
    assert detail.json()["status"] == "QUOTATION_SUBMITTED"
    assert len(detail.json()["quotations"]) == 1

    # A different citizen cannot read this record or its documents.
    forbidden = client.get(f"/api/solar-requests/{request_id}", headers=other_headers)
    assert forbidden.status_code == 403

    accepted_quote = client.post(
        f"/api/solar-quotations/{quotation_id}/accept", headers=citizen_headers
    )
    assert accepted_quote.status_code == 200, accepted_quote.text
    assert accepted_quote.json()["status"] == "QUOTE_ACCEPTED"
    assert accepted_quote.json()["installation"]["status"] == "PENDING"

    started = client.post(
        f"/api/solar-requests/{request_id}/progress",
        json={"status": "STARTED", "progress_pct": 40, "milestone": "Mounting structure"},
        headers=installer_headers,
    )
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "INSTALLATION_STARTED"

    completed = client.post(
        f"/api/solar-requests/{request_id}/progress",
        json={"status": "COMPLETED", "completion_notes": "Commissioned and net-metered."},
        headers=installer_headers,
    )
    assert completed.status_code == 200, completed.text
    body = completed.json()
    assert body["status"] == "INSTALLATION_COMPLETED"
    assert body["installation"]["progress_pct"] == 100

    # Citizen dashboard carries live workflow activity and unread notifications.
    dashboard = client.get("/api/dashboard/overview", headers=citizen_headers).json()
    assert dashboard["ecosystem"]["solar_requests"] == 1
    assert dashboard["ecosystem"]["unread_notifications"] >= 1
    assert dashboard["ecosystem"]["is_sample"] is False

    # Administrator sees the aggregate installed capacity.
    overview = client.get("/api/platform/overview", headers=admin_headers).json()
    assert overview["completed_installations"] == 1
    assert overview["registered_capacity_kwp"] == 5.0

    audit = client.get("/api/admin/activity", headers=admin_headers).json()
    actions = {entry["action"] for entry in audit["items"]}
    assert {
        "SOLAR_REQUEST_CREATED",
        "SOLAR_REQUEST_ACCEPTED",
        "SOLAR_QUOTE_ACCEPTED",
        "SOLAR_INSTALLATION_UPDATED",
    } <= actions


def test_unverified_installer_cannot_write_until_admin_approves(client, db):
    citizen = create_user(db, email="citizen2@example.com", role=UserRole.CITIZEN)
    admin = _admin(db)
    citizen_headers = _headers(client, citizen)
    admin_headers = _headers(client, admin)
    request_id = _create_solar_request(client, citizen_headers)["id"]

    register = client.post(
        "/api/auth/register",
        json={
            "name": "Pending installer",
            "email": "pending@example.com",
            "password": "Installer#Test2026",
            "role": "SOLAR_INSTALLER",
            "organization": "Pending Solar Co",
            "state": "Maharashtra",
        },
    )
    assert register.status_code == 201, register.text
    pending_headers = login_headers(client, "pending@example.com", "Installer#Test2026")

    profile = client.get("/api/organisations/me", headers=pending_headers).json()
    assert profile["verification_status"] == "PENDING"

    blocked = client.post(
        f"/api/solar-requests/{request_id}/accept", json={"note": ""}, headers=pending_headers
    )
    assert blocked.status_code == 403

    # Registration notified the administrator.
    notifications = client.get(
        "/api/notifications", params={"category": "ORGANISATION"}, headers=admin_headers
    ).json()
    assert notifications["total"] >= 1

    pending = client.get(
        "/api/organisations", params={"status": "PENDING"}, headers=admin_headers
    ).json()
    assert pending["total"] == 1
    organisation_id = pending["items"][0]["id"]

    approval = client.post(
        f"/api/organisations/{organisation_id}/review",
        json={"action": "APPROVE", "note": "Documents verified."},
        headers=admin_headers,
    )
    assert approval.status_code == 200, approval.text
    assert approval.json()["verification_status"] == "VERIFIED"

    unlocked = client.post(
        f"/api/solar-requests/{request_id}/accept", json={"note": ""}, headers=pending_headers
    )
    assert unlocked.status_code == 200, unlocked.text


# --------------------------------------------------------------------------- #
# Workflow B - DISCOM <-> supplier and RPO compliance
# --------------------------------------------------------------------------- #


def test_compliance_filing_review_and_policymaker_visibility(client, db):
    discom, _ = _org_user(db, email="discom@example.com", role=UserRole.DISCOM, org_type="DISCOM")
    admin = _admin(db)
    policymaker = create_user(
        db, email="policy@example.com", role=UserRole.POLICYMAKER, name="Policy Office"
    )
    discom_headers = _headers(client, discom)
    admin_headers = _headers(client, admin)
    policy_headers = _headers(client, policymaker)

    payload = {
        "entity_name": "Maharashtra State Distribution Utility",
        "state": "Maharashtra",
        "period_year": 2026,
        "period_month": 3,
        "obligated_energy_mwh": 1000,
        "solar_mwh": 150,
        "wind_mwh": 30,
        "hydro_mwh": 10,
        "other_mwh": 10,
        "rpo_target_pct": 20,
    }
    created = client.post("/api/compliance/records", json=payload, headers=discom_headers)
    assert created.status_code == 201, created.text
    record = created.json()
    assert record["status"] == "DRAFT"
    assert record["required_mwh"] == 200.0
    assert record["actual_renewable_mwh"] == 200.0
    assert record["compliance_pct"] == 100.0
    assert record["shortfall_mwh"] == 0.0

    duplicate = client.post("/api/compliance/records", json=payload, headers=discom_headers)
    assert duplicate.status_code == 409

    submitted = client.post(
        f"/api/compliance/records/{record['id']}/submit", headers=discom_headers
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "SUBMITTED"

    # Policymakers only see verified filings.
    visible = client.get("/api/compliance/records", headers=policy_headers).json()
    assert visible["total"] == 0

    reviewed = client.post(
        f"/api/compliance/records/{record['id']}/review",
        json={"status": "VERIFIED", "note": "Checked against state returns."},
        headers=admin_headers,
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "VERIFIED"

    visible = client.get("/api/compliance/records", headers=policy_headers).json()
    assert visible["total"] == 1

    summary = client.get("/api/compliance/summary", headers=policy_headers).json()
    assert summary["totals"]["records"] == 1
    assert summary["totals"]["required_mwh"] == 200.0
    assert summary["totals"]["compliance_pct"] == 100.0

    # A verified filing is immutable.
    edit = client.put(
        f"/api/compliance/records/{record['id']}", json=payload, headers=discom_headers
    )
    assert edit.status_code == 400


def test_procurement_marketplace_and_supplier_isolation(client, db):
    discom, _ = _org_user(db, email="discom2@example.com", role=UserRole.DISCOM, org_type="DISCOM")
    supplier_a, _ = _org_user(
        db, email="supplier-a@example.com", role=UserRole.RENEWABLE_SUPPLIER
    )
    supplier_b, _ = _org_user(
        db, email="supplier-b@example.com", role=UserRole.RENEWABLE_SUPPLIER
    )
    admin = _admin(db)

    discom_headers = _headers(client, discom)
    a_headers = _headers(client, supplier_a)
    b_headers = _headers(client, supplier_b)
    admin_headers = _headers(client, admin)

    created = client.post(
        "/api/procurement/requests",
        json={
            "title": "500 MWh solar power procurement",
            "energy_type": "SOLAR",
            "quantity_mwh": 500,
            "delivery_location": "Maharashtra",
            "max_price_per_mwh": 4200,
            "description": "Monthly solar energy purchase.",
        },
        headers=discom_headers,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    assert created.json()["status"] == "DRAFT"

    published = client.post(
        f"/api/procurement/requests/{request_id}/publish", headers=discom_headers
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "OPEN"

    quote_a = client.post(
        f"/api/procurement/requests/{request_id}/quotations",
        json={"quantity_mwh": 500, "price_per_mwh": 3900, "delivery_period_days": 30},
        headers=a_headers,
    )
    assert quote_a.status_code == 201, quote_a.text
    quote_a_id = quote_a.json()["id"]
    assert quote_a.json()["total_price"] == 1_950_000.0

    quote_b = client.post(
        f"/api/procurement/requests/{request_id}/quotations",
        json={"quantity_mwh": 480, "price_per_mwh": 4050, "delivery_period_days": 45},
        headers=b_headers,
    )
    assert quote_b.status_code == 201, quote_b.text

    # Each supplier only sees their own offer.
    detail_a = client.get(f"/api/procurement/requests/{request_id}", headers=a_headers).json()
    assert [item["id"] for item in detail_a["quotations"]] == [quote_a_id]
    detail_discom = client.get(
        f"/api/procurement/requests/{request_id}", headers=discom_headers
    ).json()
    assert len(detail_discom["quotations"]) == 2

    awarded = client.post(
        f"/api/procurement/requests/{request_id}/award",
        json={"quotation_id": quote_a_id, "note": "Lowest price."},
        headers=discom_headers,
    )
    assert awarded.status_code == 200, awarded.text
    assert awarded.json()["status"] == "AWARDED"

    double_award = client.post(
        f"/api/procurement/requests/{request_id}/award",
        json={"quotation_id": quote_a_id, "note": ""},
        headers=discom_headers,
    )
    assert double_award.status_code == 400

    closed = client.post(
        f"/api/procurement/requests/{request_id}/close", headers=discom_headers
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "CLOSED"

    # Supplier B was told the contract went elsewhere.
    b_notifications = client.get(
        "/api/notifications", params={"category": "PROCUREMENT"}, headers=b_headers
    ).json()
    assert b_notifications["total"] >= 1

    marketplace = client.get("/api/platform/policy-aggregates", headers=admin_headers).json()
    assert marketplace["monitoring"]["verified_organisations"] >= 3


# --------------------------------------------------------------------------- #
# Workflow C - citizen <-> financial institution
# --------------------------------------------------------------------------- #


def test_green_loan_workflow_and_decisions(client, db):
    financier, _ = _org_user(
        db, email="bank@example.com", role=UserRole.FINANCIAL_INSTITUTION
    )
    other_bank, _ = _org_user(
        db, email="other-bank@example.com", role=UserRole.FINANCIAL_INSTITUTION
    )
    citizen = create_user(db, email="borrower@example.com", role=UserRole.CITIZEN)
    financier_headers = _headers(client, financier)
    other_headers = _headers(client, other_bank)
    citizen_headers = _headers(client, citizen)

    product = client.post(
        "/api/loan-products",
        json={
            "name": "Rooftop Solar Loan 2026",
            "description": "Collateral-light rooftop financing.",
            "interest_rate_min": 8.5,
            "interest_rate_max": 11.5,
            "min_amount": 50000,
            "max_amount": 500000,
            "tenure_months_min": 12,
            "tenure_months_max": 84,
            "eligibility": "Residential rooftop owners",
            "required_documents": ["Aadhaar", "Electricity bill"],
            "processing_fee_pct": 1.0,
            "is_active": True,
        },
        headers=financier_headers,
    )
    assert product.status_code == 201, product.text
    product_id = product.json()["id"]
    assert product.json()["status"] == "ACTIVE"

    marketplace = client.get("/api/loan-products", headers=citizen_headers).json()
    assert marketplace["total"] == 1
    assert marketplace["items"][0]["institution"]["role"] == "FINANCIAL_INSTITUTION"

    application = client.post(
        "/api/loan-applications",
        json={
            "product_id": product_id,
            "loan_amount": 250000,
            "project_purpose": "5 kW rooftop solar",
            "location": "Pune",
            "state": "Maharashtra",
        },
        headers=citizen_headers,
    )
    assert application.status_code == 201, application.text
    application_id = application.json()["id"]
    assert application.json()["status"] == "SUBMITTED"

    # Another institution cannot see or decide this application.
    other_pipeline = client.get(
        "/api/loan-applications/summary/financier", headers=other_headers
    ).json()
    assert other_pipeline["applications"] == 0
    blocked = client.post(
        f"/api/loan-applications/{application_id}/decision",
        json={"status": "APPROVED", "note": "Looks good."},
        headers=other_headers,
    )
    assert blocked.status_code == 403

    review = client.post(
        f"/api/loan-applications/{application_id}/decision",
        json={"status": "UNDER_REVIEW", "note": "Verifying documents."},
        headers=financier_headers,
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "UNDER_REVIEW"

    missing_note = client.post(
        f"/api/loan-applications/{application_id}/decision",
        json={"status": "APPROVED", "note": ""},
        headers=financier_headers,
    )
    assert missing_note.status_code == 400

    approved = client.post(
        f"/api/loan-applications/{application_id}/decision",
        json={"status": "APPROVED", "note": "Repayment capacity verified."},
        headers=financier_headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"

    withdraw = client.post(
        f"/api/loan-applications/{application_id}/withdraw", headers=citizen_headers
    )
    assert withdraw.status_code == 400

    pipeline = client.get(
        "/api/loan-applications/summary/financier", headers=financier_headers
    ).json()
    assert pipeline["applications"] == 1
    assert pipeline["approved_amount"] == 250000.0
    assert pipeline["by_status"]["APPROVED"] == 1


def test_unverified_financial_institution_cannot_publish_products(client, db):
    financier, _ = _org_user(
        db, email="pending-bank@example.com", role=UserRole.FINANCIAL_INSTITUTION, verified=False
    )
    headers = _headers(client, financier)
    response = client.post(
        "/api/loan-products",
        json={
            "name": "Blocked product",
            "interest_rate_min": 9,
            "interest_rate_max": 10,
            "min_amount": 10000,
            "max_amount": 100000,
        },
        headers=headers,
    )
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Workflow D - citizen <-> recycler
# --------------------------------------------------------------------------- #


def test_recycling_workflow_timeline_and_analytics(client, db):
    recycler, _ = _org_user(db, email="recycler@example.com", role=UserRole.RECYCLER)
    other_recycler, _ = _org_user(
        db, email="other-recycler@example.com", role=UserRole.RECYCLER
    )
    citizen = create_user(db, email="waste@example.com", role=UserRole.CITIZEN)
    recycler_headers = _headers(client, recycler)
    other_headers = _headers(client, other_recycler)
    citizen_headers = _headers(client, citizen)

    created = client.post(
        "/api/recycling-requests",
        json={
            "waste_category": "LITHIUM_ION",
            "estimated_weight_kg": 120,
            "address": "45 Circular Avenue",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "preferred_pickup_date": "2026-12-05",
            "description": "Old inverter batteries from a rooftop system.",
        },
        headers=citizen_headers,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    assert created.json()["status"] == "REQUESTED"
    assert len(created.json()["events"]) == 1

    accepted = client.post(
        f"/api/recycling-requests/{request_id}/accept",
        json={"note": "Pickup team assigned."},
        headers=recycler_headers,
    )
    assert accepted.status_code == 200, accepted.text

    # Completion before collection is rejected even once accepted.
    too_early = client.post(
        f"/api/recycling-requests/{request_id}/complete",
        json={"note": ""},
        headers=recycler_headers,
    )
    assert too_early.status_code == 400

    # A different facility cannot read a request assigned elsewhere.
    denied = client.get(f"/api/recycling-requests/{request_id}", headers=other_headers)
    assert denied.status_code == 403

    scheduled = client.post(
        f"/api/recycling-requests/{request_id}/schedule",
        json={
            "scheduled_pickup_at": "2026-12-06T09:30:00+00:00",
            "assigned_personnel": "Team A",
            "note": "Morning slot",
        },
        headers=recycler_headers,
    )
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["status"] == "PICKUP_SCHEDULED"

    collected = client.post(
        f"/api/recycling-requests/{request_id}/collect",
        json={"actual_weight_kg": 118.5, "note": "Weighed at facility."},
        headers=recycler_headers,
    )
    assert collected.status_code == 200, collected.text
    assert collected.json()["actual_weight_kg"] == 118.5

    processed = client.post(
        f"/api/recycling-requests/{request_id}/process",
        json={
            "processing_details": "Mechanical separation and hydrometallurgical recovery.",
            "recovered_materials": [
                {"material": "Lithium", "quantity_kg": 8.4},
                {"material": "Cobalt", "quantity_kg": 5.2},
            ],
        },
        headers=recycler_headers,
    )
    assert processed.status_code == 200, processed.text
    assert processed.json()["status"] == "PROCESSING"

    completed = client.post(
        f"/api/recycling-requests/{request_id}/complete",
        json={"note": "Recovery certificate issued."},
        headers=recycler_headers,
    )
    assert completed.status_code == 200, completed.text
    body = completed.json()
    assert body["status"] == "COMPLETED"
    assert body["certificate_code"] == f"CERT-{body['reference']}"
    assert [event["status"] for event in body["events"]] == [
        "REQUESTED",
        "ACCEPTED",
        "PICKUP_SCHEDULED",
        "COLLECTED",
        "PROCESSING",
        "COMPLETED",
    ]

    analytics = client.get(
        "/api/recycling-requests/analytics", headers=recycler_headers
    ).json()
    assert analytics["completed"] == 1
    assert analytics["collected_weight_kg"] == 118.5
    assert analytics["recovered_material_kg"] == 13.6
    assert analytics["certificates"] == 1

    # Circular-economy analytics surface the same live recovery block.
    circular = client.get("/api/circular/summary", headers=citizen_headers).json()
    assert circular["ecosystem_recycling"]["completed_requests"] == 1


# --------------------------------------------------------------------------- #
# Workflow E - documents, notifications and platform analytics
# --------------------------------------------------------------------------- #


def test_document_upload_permissions_and_validation(client, db):
    citizen = create_user(db, email="docs@example.com", role=UserRole.CITIZEN)
    installer, _ = _org_user(db, email="docs-installer@example.com", role=UserRole.SOLAR_INSTALLER)
    other_citizen = create_user(db, email="docs-other@example.com", role=UserRole.CITIZEN)
    citizen_headers = _headers(client, citizen)
    installer_headers = _headers(client, installer)
    other_headers = _headers(client, other_citizen)
    request_id = _create_solar_request(client, citizen_headers)["id"]
    accepted = client.post(
        f"/api/solar-requests/{request_id}/accept",
        json={"note": "Assigned for document sharing."},
        headers=installer_headers,
    )
    assert accepted.status_code == 200, accepted.text

    uploaded = client.post(
        "/api/documents/upload",
        data={
            "entity_type": "SOLAR_REQUEST",
            "entity_id": str(request_id),
            "document_type": "ELECTRICITY_BILL",
        },
        files={"file": ("bill.pdf", b"%PDF-1.4 sample", "application/pdf")},
        headers=citizen_headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    document_id = uploaded.json()["id"]

    listing = client.get(
        "/api/documents",
        params={"entity_type": "SOLAR_REQUEST", "entity_id": request_id},
        headers=installer_headers,
    ).json()
    assert len(listing["items"]) == 1

    download = client.get(f"/api/documents/{document_id}/download", headers=citizen_headers)
    assert download.status_code == 200
    assert download.content.startswith(b"%PDF")

    denied = client.get(
        "/api/documents",
        params={"entity_type": "SOLAR_REQUEST", "entity_id": request_id},
        headers=other_headers,
    )
    assert denied.status_code == 403

    rejected = client.post(
        "/api/documents/upload",
        data={"entity_type": "SOLAR_REQUEST", "entity_id": str(request_id)},
        files={"file": ("payload.exe", b"MZ", "application/octet-stream")},
        headers=citizen_headers,
    )
    assert rejected.status_code == 400

    self_review = client.post(
        f"/api/documents/{document_id}/review",
        params={"status": "ACCEPTED", "note": "Self"},
        headers=citizen_headers,
    )
    assert self_review.status_code == 403

    # ApplicationDocument rows are cleaned up with their temp files.
    for document in db.scalars(select(ApplicationDocument)).all():
        Path(document.file_path).unlink(missing_ok=True)


def test_notifications_can_be_marked_read(client, db):
    citizen = create_user(db, email="notify@example.com", role=UserRole.CITIZEN)
    installer, _ = _org_user(db, email="notify-installer@example.com", role=UserRole.SOLAR_INSTALLER)
    client_headers = _headers(client, citizen)
    request_id = _create_solar_request(client, client_headers)["id"]

    installer_headers = _headers(client, installer)
    client.post(
        f"/api/solar-requests/{request_id}/accept", json={"note": ""}, headers=installer_headers
    )

    inbox = client.get(
        "/api/notifications", params={"unread_only": True}, headers=client_headers
    ).json()
    assert inbox["total"] >= 1
    notification_id = inbox["items"][0]["id"]

    marked = client.post(f"/api/notifications/{notification_id}/read", headers=client_headers)
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True

    count = client.get("/api/notifications/unread-count", headers=client_headers).json()
    assert count["unread_count"] == inbox["total"] - 1

    bulk = client.post("/api/notifications/read-all", headers=client_headers)
    assert bulk.status_code == 200
    count = client.get("/api/notifications/unread-count", headers=client_headers).json()
    assert count["unread_count"] == 0

    # A notification belongs to exactly one account.
    others = client.get("/api/notifications", headers=installer_headers).json()
    assert all(item["id"] != notification_id for item in others["items"])


def test_platform_analytics_are_provenance_labelled(client, db):
    admin = _admin(db)
    policymaker = create_user(
        db, email="policy-agg@example.com", role=UserRole.POLICYMAKER, name="Policy Analyst"
    )
    citizen = create_user(db, email="citizen-agg@example.com", role=UserRole.CITIZEN)
    admin_headers = _headers(client, admin)
    policy_headers = _headers(client, policymaker)
    citizen_headers = _headers(client, citizen)

    aggregates = client.get("/api/platform/policy-aggregates", headers=policy_headers)
    assert aggregates.status_code == 200
    body = aggregates.json()
    assert body["monitoring"]["note"]
    assert "SOLAR_INSTALLER" in body["users_by_role"]

    forbidden = client.get("/api/platform/policy-aggregates", headers=citizen_headers)
    assert forbidden.status_code == 403

    impact = client.get("/api/impact/overview", headers=policy_headers)
    if impact.status_code == 200:
        ecosystem = impact.json()["platform_ecosystem"]
        assert ecosystem["installed_capacity"]["provenance"]["is_sample"] is False
        assert ecosystem["compliance"]["provenance"]["classification"] == "PLATFORM_RECORDED"

    overview = client.get("/api/admin/overview", headers=admin_headers).json()
    assert overview["ecosystem"]["is_sample"] is False
    assert "installed_capacity" in overview["ecosystem"]

    finance = client.get("/api/finance/admin/all", headers=admin_headers).json()
    assert finance["loan_marketplace"]["provenance"]["classification"] == "PLATFORM_RECORDED"
