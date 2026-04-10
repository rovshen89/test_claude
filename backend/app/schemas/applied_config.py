# backend/app/schemas/applied_config.py
from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel


class EdgeBanding(BaseModel):
    left: bool = False
    right: bool = False
    top: bool = False
    bottom: bool = False

    def banded_perimeter_mm(self, width_mm: int, height_mm: int) -> int:
        total = 0
        if self.left:
            total += height_mm
        if self.right:
            total += height_mm
        if self.top:
            total += width_mm
        if self.bottom:
            total += width_mm
        return total


class PanelSpec(BaseModel):
    name: str
    material_id: UUID
    thickness_mm: int
    width_mm: int
    height_mm: int
    quantity: int
    grain_direction: str = "none"
    edge_banding: EdgeBanding = EdgeBanding()


class HardwareItem(BaseModel):
    name: str
    unit_price: Decimal
    quantity: int


class AppliedConfig(BaseModel):
    dimensions: dict
    panels: List[PanelSpec]
    hardware_list: List[HardwareItem] = []
