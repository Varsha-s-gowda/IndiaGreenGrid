"""Apartment request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConsumptionProfile = Literal["LOW", "MEDIUM", "HIGH", "WORK_FROM_HOME", "NIGHT_HEAVY"]


class ApartmentBase(BaseModel):
    flat_number: str = Field(min_length=1, max_length=20)
    floor_number: int = Field(ge=0)
    residents_count: int = Field(ge=0)
    apartment_category: str = Field(min_length=1, max_length=50)
    consumption_profile: ConsumptionProfile = "MEDIUM"


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentRead(ApartmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ApartmentListResponse(BaseModel):
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
    items: list[ApartmentRead]


class ApartmentSummaryResponse(BaseModel):
    total_apartments: int = Field(ge=0)
    total_residents: int = Field(ge=0)
    average_residents_per_apartment: float = Field(ge=0)
    apartments_by_floor: dict[str, int]
    apartments_by_category: dict[str, int]
    apartments_by_profile: dict[str, int]
