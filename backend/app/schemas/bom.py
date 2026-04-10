# backend/app/schemas/bom.py
from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel, field_serializer


class BomRequest(BaseModel):
    configuration_id: UUID


class BomPanelRow(BaseModel):
    name: str
    material_name: str
    material_sku: str
    thickness_mm: int
    width_mm: int
    height_mm: int
    quantity: int
    grain_direction: str
    edge_left: bool
    edge_right: bool
    edge_top: bool
    edge_bottom: bool
    area_m2: Decimal  # total area for all qty combined

    @field_serializer("area_m2")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)


class BomHardwareRow(BaseModel):
    name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal

    @field_serializer("unit_price", "total_price")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)


class BomResponse(BaseModel):
    panels: List[BomPanelRow]
    hardware: List[BomHardwareRow]
    total_panels: int
    total_area_m2: Decimal

    @field_serializer("total_area_m2")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)
