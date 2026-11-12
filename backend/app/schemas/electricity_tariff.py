"""Electricity tariff schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ElectricityTariffBase(BaseModel):
    price_per_kwh: Decimal = Field(gt=0, max_digits=10, decimal_places=4)
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def _validate_period(self) -> "ElectricityTariffBase":
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to must be on or after effective_from.")
        return self


class ElectricityTariffCreate(ElectricityTariffBase):
    pass


class ElectricityTariffRead(ElectricityTariffBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
