"""Demo seed tests."""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.config import settings
from app.models.user import User, UserRole
from app.services.seed_service import seed_demo_users
from tests.helpers import login_headers


def test_seed_creates_three_demo_accounts_idempotently(db):
    first = seed_demo_users(db)
    second = seed_demo_users(db)

    assert len(first) == 3
    assert all(result.created for result in first)
    assert all(not result.created for result in second)
    assert db.scalar(select(func.count()).select_from(User)) == 3

    roles = {
        user.email: user.role
        for user in db.scalars(select(User)).all()
    }
    assert roles["admin@solarequity.com"] is UserRole.ADMIN
    assert roles["resident101@solarequity.com"] is UserRole.RESIDENT
    assert roles["resident102@solarequity.com"] is UserRole.RESIDENT


def test_seeded_accounts_can_log_in(client, db):
    seed_demo_users(db)

    admin_headers = login_headers(
        client,
        "admin@solarequity.com",
        settings.demo_admin_password,
    )
    resident_headers = login_headers(
        client,
        "resident101@solarequity.com",
        settings.demo_resident_password,
    )

    admin_me = client.get("/api/auth/me", headers=admin_headers)
    resident_me = client.get("/api/auth/me", headers=resident_headers)

    assert admin_me.json()["role"] == "ADMIN"
    assert resident_me.json()["role"] == "RESIDENT"
    assert client.get("/api/simulation/admin/status", headers=admin_headers).status_code == 200
    assert client.get("/api/simulation/admin/status", headers=resident_headers).status_code == 403
