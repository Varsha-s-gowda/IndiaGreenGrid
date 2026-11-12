"""Authentication and user schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole


class UserRegister(BaseModel):
    """Public registration payload.

    ``role`` may select a stakeholder portal (citizen, DISCOM, industry,
    financial institution or policymaker).  ``ADMIN`` can never be self-assigned;
    admin accounts are provisioned by an existing administrator or the seed
    script.
    """

    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: UserRole | None = None
    organization: str | None = Field(default=None, max_length=160)
    state: str | None = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Name must contain at least 2 characters.")
        return value

    @field_validator("password")
    @classmethod
    def _bcrypt_length_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 UTF-8 bytes.")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: UserRole
    organization: str | None = None
    state: str | None = None
    is_active: bool = True
    verification_status: str = "VERIFIED"
    verification_note: str = ""
    verified_at: datetime | None = None
    apartment_id: int | None = None
    flat_number: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds.")
    user: UserRead
