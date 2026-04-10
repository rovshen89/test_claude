# backend/app/core/pricing.py
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Optional
from uuid import UUID

from app.schemas.applied_config import AppliedConfig
from app.schemas.pricing import PanelPricingRow, PricingResponse


@dataclass
class MaterialPricing:
    price_per_m2: Decimal
    edgebanding_price_per_mm: Optional[Decimal]


def calculate_pricing(
    config: AppliedConfig,
    materials: Dict[UUID, MaterialPricing],
    labor_rate: Decimal,
    margin_pct: Decimal,
) -> PricingResponse:
    panel_rows = []
    total_panel_cost = Decimal("0")
    total_edge_cost = Decimal("0")

    for panel in config.panels:
        mat = materials[panel.material_id]
        area_m2 = (
            Decimal(str(panel.width_mm)) * Decimal(str(panel.height_mm)) / Decimal("1000000")
        )
        panel_cost = area_m2 * mat.price_per_m2 * panel.quantity

        banded_mm = panel.edge_banding.banded_perimeter_mm(panel.width_mm, panel.height_mm)
        edge_cost = Decimal("0")
        if mat.edgebanding_price_per_mm and banded_mm > 0:
            edge_cost = Decimal(str(banded_mm)) * mat.edgebanding_price_per_mm * panel.quantity

        panel_rows.append(
            PanelPricingRow(
                name=panel.name,
                area_m2=area_m2 * panel.quantity,
                panel_cost=panel_cost,
                edge_cost=edge_cost,
            )
        )
        total_panel_cost += panel_cost
        total_edge_cost += edge_cost

    hardware_cost = sum(
        (item.unit_price * item.quantity for item in config.hardware_list),
        Decimal("0"),
    )
    labor_cost = labor_rate * len(config.panels)
    subtotal = total_panel_cost + total_edge_cost + hardware_cost + labor_cost
    total = subtotal * (1 + margin_pct / Decimal("100"))

    return PricingResponse(
        panel_cost=total_panel_cost,
        edge_cost=total_edge_cost,
        hardware_cost=hardware_cost,
        labor_cost=labor_cost,
        subtotal=subtotal,
        total=total,
        breakdown=panel_rows,
    )
