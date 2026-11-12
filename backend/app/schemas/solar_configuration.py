"""Rooftop solar configuration schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SolarConfigurationBase(BaseModel):
    capacity_kwp: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    rooftop_area: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    installation_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class SolarConfigurationCreate(SolarConfigurationBase):
    pass


class SolarConfigurationRead(SolarConfigurationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
