"""Authentication, JWT and role-protection tests."""

from __future__ import annotations

from datetime import timedelta

from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import UserRole
from tests.helpers import (
    DEFAULT_PASSWORD,
    create_user,
    get_user,
    login_headers,
    register_payload,
)


def test_register_creates_resident_with_hashed_password(client, db):
    payload = register_payload("New.Resident@Example.com", name="  New   Resident  ")

    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.resident@example.com"
    assert body["name"] == "New Resident"
    assert body["role"] == "RESIDENT"
    assert "password" not in body
    assert "hashed_password" not in body

    user = get_user(db, "new.resident@example.com")
    assert user is not None
    assert user.hashed_password != DEFAULT_PASSWORD
    assert user.hashed_password.startswith("$2")


def test_public_registration_cannot_escalate_to_admin(client, db):
    payload = {**register_payload("sneaky@example.com"), "role": "ADMIN"}

    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 201
    assert response.json()["role"] == "RESIDENT"
    assert get_user(db, "sneaky@example.com").role is UserRole.RESIDENT


def test_duplicate_email_is_case_insensitive(client):
    assert client.post("/api/auth/register", json=register_payload("dupe@example.com")).status_code == 201

    response = client.post("/api/auth/register", json=register_payload("DUPE@example.com"))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_registration_validation_error_envelope(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "A", "email": "not-an-email", "password": "short"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    fields = {error["field"] for error in body["error"]["details"]}
    assert "body.email" in fields
    assert "body.password" in fields


def test_login_and_me(client):
    client.post("/api/auth/register", json=register_payload("login@example.com"))
    headers = login_headers(client, "login@example.com", DEFAULT_PASSWORD)

    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "login@example.com"
    assert body["role"] == "RESIDENT"
    assert "hashed_password" not in body


def test_login_returns_token_metadata(client):
    client.post("/api/auth/register", json=register_payload("token@example.com"))

    response = client.post(
        "/api/auth/login",
        json={"email": "token@example.com", "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.access_token_expire_minutes * 60
    assert body["user"]["email"] == "token@example.com"
    assert body["access_token"].count(".") == 2


def test_wrong_password_and_unknown_email_have_same_error(client):
    client.post("/api/auth/register", json=register_payload("known@example.com"))

    wrong_password = client.post(
        "/api/auth/login",
        json={"email": "known@example.com", "password": "WrongPassword#1"},
    )
    unknown_email = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "WrongPassword#1"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json()["error"]["message"] == unknown_email.json()["error"]["message"]


def test_me_requires_bearer_token(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "unauthorized"


def test_invalid_and_expired_tokens_are_rejected(client):
    invalid = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert invalid.status_code == 401

    expired_token = create_access_token(
        subject=999,
        role="RESIDENT",
        expires_delta=timedelta(seconds=-5),
    )
    expired = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert expired.status_code == 401
    assert "expired" in expired.json()["error"]["message"].lower()


def test_admin_route_rejects_resident_and_allows_admin(client, db):
    resident = create_user(db, email="resident101@example.com", role=UserRole.RESIDENT)
    admin = create_user(db, email="admin@example.com", role=UserRole.ADMIN)
    assert resident.role is UserRole.RESIDENT

    resident_headers = login_headers(client, "resident101@example.com", DEFAULT_PASSWORD)
    admin_headers = login_headers(client, "admin@example.com", DEFAULT_PASSWORD)

    denied = client.get("/api/simulation/admin/status", headers=resident_headers)
    allowed = client.get("/api/simulation/admin/status", headers=admin_headers)

    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "forbidden"
    assert allowed.status_code == 200
    assert allowed.json()["module"] == "simulation"
    assert admin.email == "admin@example.com"
