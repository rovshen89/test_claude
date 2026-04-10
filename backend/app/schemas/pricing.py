# backend/app/schemas/pricing.py
from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel, field_serializer


class PricingRequest(BaseModel):
    configuration_id: UUID


class PanelPricingRow(BaseModel):
    name: str
    area_m2: Decimal
    panel_cost: Decimal
    edge_cost: Decimal

    @field_serializer("area_m2", "panel_cost", "edge_cost")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)


class PricingResponse(BaseModel):
    panel_cost: Decimal
    edge_cost: Decimal
    hardware_cost: Decimal
    labor_cost: Decimal
    subtotal: Decimal
    total: Decimal
    breakdown: List[PanelPricingRow]

    @field_serializer("panel_cost", "edge_cost", "hardware_cost", "labor_cost", "subtotal", "total")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)
