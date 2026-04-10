# backend/tests/test_pricing_core.py
import pytest
from decimal import Decimal
from uuid import uuid4

from app.core.pricing import MaterialPricing, calculate_pricing
from app.schemas.applied_config import AppliedConfig, EdgeBanding, HardwareItem, PanelSpec


def _make_config(mat_id, with_edge=False, with_hardware=False) -> AppliedConfig:
    edge = EdgeBanding(top=True, bottom=True) if with_edge else EdgeBanding()
    hardware = (
        [HardwareItem(name="Hinge", unit_price=Decimal("0.50"), quantity=4)]
        if with_hardware
        else []
    )
    return AppliedConfig(
        dimensions={"width": 1200, "height": 2100, "depth": 600},
        panels=[
            PanelSpec(
                name="Side",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=580,
                height_mm=2100,
                quantity=2,
                edge_banding=edge,
            )
        ],
        hardware_list=hardware,
    )


def test_panel_cost_no_edge():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    # area = 0.580 * 2.100 * 2 = 2.436 m²; cost = 24.36
    assert float(result.panel_cost) == pytest.approx(24.36, rel=1e-3)
    assert float(result.edge_cost) == pytest.approx(0.0, abs=1e-9)
    assert float(result.hardware_cost) == pytest.approx(0.0, abs=1e-9)
    assert float(result.labor_cost) == pytest.approx(0.0, abs=1e-9)
    assert float(result.total) == pytest.approx(24.36, rel=1e-3)


def test_edge_banding_cost():
    mat_id = uuid4()
    config = _make_config(mat_id, with_edge=True)
    materials = {
        mat_id: MaterialPricing(
            price_per_m2=Decimal("10.00"),
            edgebanding_price_per_mm=Decimal("0.003"),
        )
    }
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    # top(580) + bottom(580) = 1160mm per panel × 2 qty = 2320mm × 0.003 = 6.96
    assert float(result.edge_cost) == pytest.approx(6.96, rel=1e-3)


def test_hardware_cost():
    mat_id = uuid4()
    config = _make_config(mat_id, with_hardware=True)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    # 0.50 × 4 = 2.00
    assert float(result.hardware_cost) == pytest.approx(2.00, rel=1e-3)


def test_labor_cost():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("2.50"), margin_pct=Decimal("0"))
    # 2.50 × len(panels)=1 = 2.50
    assert float(result.labor_cost) == pytest.approx(2.50, rel=1e-3)


def test_margin_applied_to_total():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("20"))
    # panel_cost=24.36, subtotal=24.36, total = 24.36 × 1.20 = 29.232
    assert float(result.subtotal) == pytest.approx(24.36, rel=1e-3)
    assert float(result.total) == pytest.approx(29.232, rel=1e-3)


def test_breakdown_has_one_row_per_panel_spec():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    assert len(result.breakdown) == 1
    assert result.breakdown[0].name == "Side"
    # area_m2 in breakdown accounts for quantity: 2.436
    assert float(result.breakdown[0].area_m2) == pytest.approx(2.436, rel=1e-3)
