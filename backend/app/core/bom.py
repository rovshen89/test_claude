# backend/app/core/bom.py
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict
from uuid import UUID

from app.schemas.applied_config import AppliedConfig
from app.schemas.bom import BomHardwareRow, BomPanelRow, BomResponse


@dataclass
class MaterialInfo:
    name: str
    sku: str


def generate_bom(
    config: AppliedConfig,
    materials: Dict[UUID, MaterialInfo],
) -> BomResponse:
    panel_rows = []
    total_area = Decimal("0")

    for panel in config.panels:
        mat = materials[panel.material_id]
        area_m2 = (
            Decimal(str(panel.width_mm)) * Decimal(str(panel.height_mm)) / Decimal("1000000")
        ) * panel.quantity
        total_area += area_m2
        panel_rows.append(
            BomPanelRow(
                name=panel.name,
                material_name=mat.name,
                material_sku=mat.sku,
                thickness_mm=panel.thickness_mm,
                width_mm=panel.width_mm,
                height_mm=panel.height_mm,
                quantity=panel.quantity,
                grain_direction=panel.grain_direction,
                edge_left=panel.edge_banding.left,
                edge_right=panel.edge_banding.right,
                edge_top=panel.edge_banding.top,
                edge_bottom=panel.edge_banding.bottom,
                area_m2=area_m2,
            )
        )

    hardware_rows = [
        BomHardwareRow(
            name=item.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_price=item.unit_price * item.quantity,
        )
        for item in config.hardware_list
    ]

    return BomResponse(
        panels=panel_rows,
        hardware=hardware_rows,
        total_panels=sum(p.quantity for p in config.panels),
        total_area_m2=total_area,
    )
