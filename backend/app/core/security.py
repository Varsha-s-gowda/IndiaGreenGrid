"""Password hashing and JWT helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import UnauthorizedError


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt and a configurable cost factor."""

    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes.")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time bcrypt verification that never raises for bad hashes."""

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str | int, role: str, expires_delta: timedelta | None = None) -> str:
    """Create a signed short-lived access token."""

    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token.

    Raises ``UnauthorizedError`` for expired, malformed or non-access tokens.
    """

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid access token.") from exc

    if payload.get("type") != "access" or not payload.get("sub"):
        raise UnauthorizedError("Invalid access token payload.")
    return payload


def access_token_expires_in_seconds() -> int:
    return settings.access_token_expire_minutes * 60
