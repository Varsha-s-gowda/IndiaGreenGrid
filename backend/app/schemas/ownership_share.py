"""Ownership share schemas."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class OwnershipShareBase(BaseModel):
    apartment_id: int = Field(gt=0)
    contribution_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    ownership_percentage: Decimal = Field(ge=0, le=100, max_digits=7, decimal_places=3)


class OwnershipShareCreate(OwnershipShareBase):
    pass


class OwnershipShareRead(OwnershipShareBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
