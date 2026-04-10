# backend/tests/test_export_pdf.py
from decimal import Decimal

from app.schemas.bom import BomHardwareRow, BomPanelRow, BomResponse
from app.schemas.pricing import PanelPricingRow, PricingResponse
from app.core.export_pdf import generate_pdf


def _make_bom() -> BomResponse:
    panel = BomPanelRow(
        name="Side",
        material_name="Oak",
        material_sku="OAK-18",
        thickness_mm=18,
        width_mm=580,
        height_mm=2100,
        quantity=2,
        grain_direction="none",
        edge_left=False,
        edge_right=False,
        edge_top=True,
        edge_bottom=True,
        area_m2=Decimal("2.436"),
    )
    return BomResponse(
        panels=[panel],
        hardware=[
            BomHardwareRow(
                name="Hinge",
                quantity=4,
                unit_price=Decimal("0.50"),
                total_price=Decimal("2.00"),
            )
        ],
        total_panels=2,
        total_area_m2=Decimal("2.436"),
    )


def _make_pricing() -> PricingResponse:
    return PricingResponse(
        panel_cost=Decimal("24.36"),
        edge_cost=Decimal("6.96"),
        hardware_cost=Decimal("2.00"),
        labor_cost=Decimal("2.50"),
        subtotal=Decimal("35.82"),
        total=Decimal("35.82"),
        breakdown=[
            PanelPricingRow(
                name="Side",
                area_m2=Decimal("2.436"),
                panel_cost=Decimal("24.36"),
                edge_cost=Decimal("6.96"),
            )
        ],
    )


def test_pdf_returns_bytes():
    result = generate_pdf(_make_bom(), _make_pricing())
    assert isinstance(result, bytes)


def test_pdf_is_valid_pdf():
    result = generate_pdf(_make_bom(), _make_pricing())
    assert result[:4] == b"%PDF"
