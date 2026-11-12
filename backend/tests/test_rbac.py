"""Role-based access control tests for direct API requests.

The workspace guard protects the React routes; these tests prove the backend
enforces the same audiences so a direct request cannot bypass the UI.
"""

from __future__ import annotations

from app.models.green_grid import AuditLog
from app.models.user import UserRole
from tests.helpers import DEFAULT_PASSWORD, create_user, login_headers


def _headers(client, db, email: str, role: UserRole) -> dict[str, str]:
    create_user(db, email=email, role=role)
    return login_headers(client, email, DEFAULT_PASSWORD)


def test_resident_cannot_read_national_analytics(client, db):
    resident = _headers(client, db, "resident@example.com", UserRole.RESIDENT)
    discom = _headers(client, db, "discom@example.com", UserRole.DISCOM)

    for path in ("/api/energy/overview", "/api/impact/overview", "/api/forecast/history"):
        denied = client.get(path, headers=resident)
        allowed = client.get(path, headers=discom)

        assert denied.status_code == 403, path
        assert denied.json()["error"]["code"] == "forbidden"
        assert allowed.status_code == 200, path


def test_simulation_reads_are_limited_to_admin_and_discom(client, db):
    resident = _headers(client, db, "resident@example.com", UserRole.RESIDENT)
    discom = _headers(client, db, "discom@example.com", UserRole.DISCOM)
    policy = _headers(client, db, "policy@example.com", UserRole.POLICYMAKER)

    denied_resident = client.get("/api/simulation/runs", headers=resident)
    denied_policy = client.get("/api/simulation/runs", headers=policy)
    allowed_discom = client.get("/api/simulation/runs", headers=discom)

    assert denied_resident.status_code == 403
    assert denied_policy.status_code == 403
    assert allowed_discom.status_code == 200

    assert client.get("/api/simulation/status", headers=resident).status_code == 200


def test_community_and_billing_are_not_available_to_industry(client, db):
    industry = _headers(client, db, "industry@example.com", UserRole.INDUSTRY)
    resident = _headers(client, db, "resident@example.com", UserRole.RESIDENT)
    discom = _headers(client, db, "discom@example.com", UserRole.DISCOM)
    admin = _headers(client, db, "admin@example.com", UserRole.ADMIN)

    assert client.get("/api/billing/summary", headers=industry).status_code == 403
    assert client.get("/api/allocation/status", headers=industry).status_code == 403
    assert client.get("/api/billing/summary", headers=admin).status_code == 200

    assert client.get("/api/solar/calculations", headers=resident).status_code == 200

    assert client.get("/api/apartments", headers=resident).status_code == 403
    assert client.get("/api/apartments", headers=discom).status_code == 200


def test_financial_institution_cannot_read_jobs_or_circular(client, db):
    finance = _headers(
        client, db, "finance@example.com", UserRole.FINANCIAL_INSTITUTION
    )
    industry = _headers(client, db, "industry@example.com", UserRole.INDUSTRY)
    policy = _headers(client, db, "policy@example.com", UserRole.POLICYMAKER)

    assert client.get("/api/jobs", headers=finance).status_code == 403
    assert client.get("/api/circular/summary", headers=finance).status_code == 403

    assert client.get("/api/jobs", headers=industry).status_code == 200
    assert client.get("/api/circular/summary", headers=policy).status_code == 200


def test_resident_cannot_reach_admin_endpoints(client, db):
    resident = _headers(client, db, "resident@example.com", UserRole.RESIDENT)
    admin = _headers(client, db, "admin@example.com", UserRole.ADMIN)

    denied = client.get("/api/admin/overview", headers=resident)
    allowed = client.get("/api/admin/overview", headers=admin)

    assert denied.status_code == 403
    assert allowed.status_code == 200


def test_dashboard_overview_exposes_role_specific_focus(client, db):
    expected = {
        UserRole.RESIDENT: "solar_calculations",
        UserRole.DISCOM: "rpo_compliance",
        UserRole.INDUSTRY: "recycling",
        UserRole.FINANCIAL_INSTITUTION: "finance_catalogue",
        UserRole.POLICYMAKER: "renewable_share",
    }

    for role, focus_key in expected.items():
        email = f"{role.value.lower()}@example.com"
        headers = _headers(client, db, email, role)

        response = client.get("/api/dashboard/overview", headers=headers)

        assert response.status_code == 200, role
        body = response.json()
        assert body["user"]["role"] == role.value
        keys = {item["key"] for item in body["role_focus"]}
        assert focus_key in keys, role


def test_dashboard_activity_is_scoped_to_the_signed_in_user(client, db):
    resident = create_user(
        db, email="resident@example.com", role=UserRole.RESIDENT
    )
    neighbour = create_user(
        db, email="neighbour@example.com", role=UserRole.RESIDENT
    )
    admin = create_user(db, email="admin@example.com", role=UserRole.ADMIN)

    db.add_all(
        [
            AuditLog(
                user_id=resident.id,
                user_email=resident.email,
                action="VIEW",
                module="billing",
                description="Resident viewed their statement",
            ),
            AuditLog(
                user_id=neighbour.id,
                user_email=neighbour.email,
                action="VIEW",
                module="billing",
                description="Neighbour viewed their statement",
            ),
        ]
    )
    db.commit()

    resident_headers = login_headers(client, resident.email, DEFAULT_PASSWORD)
    admin_headers = login_headers(client, admin.email, DEFAULT_PASSWORD)

    own = client.get("/api/dashboard/overview", headers=resident_headers)
    global_view = client.get("/api/dashboard/overview", headers=admin_headers)

    assert own.status_code == 200
    assert global_view.status_code == 200

    own_emails = {entry["user_email"] for entry in own.json()["activity"]}
    global_emails = {entry["user_email"] for entry in global_view.json()["activity"]}

    assert own_emails == {resident.email}
    assert {resident.email, neighbour.email} <= global_emails
