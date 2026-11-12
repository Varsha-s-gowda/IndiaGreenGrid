"""Small helpers shared by API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.models.user import User, UserRole
from app.services.auth_service import get_user_by_email

DEFAULT_PASSWORD = "Resident#Test2026"


def register_payload(
    email: str = "resident@example.com",
    *,
    name: str = "Test Resident",
    password: str = DEFAULT_PASSWORD,
) -> dict[str, str]:
    return {"name": name, "email": email, "password": password}


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_user(
    db,
    *,
    email: str,
    role: UserRole,
    password: str = DEFAULT_PASSWORD,
    name: str = "Test User",
) -> User:
    from app.core.security import hash_password

    user = User(
        name=name,
        email=email.lower(),
        hashed_password=hash_password(password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db, email: str) -> User | None:
    return get_user_by_email(db, email)
