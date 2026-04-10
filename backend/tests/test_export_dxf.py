# backend/tests/test_export_dxf.py
import io
from decimal import Decimal

import pytest

from app.schemas.bom import BomPanelRow, BomResponse
from app.core.export_dxf import generate_dxf


def _make_panel(
    name: str = "Side",
    width: int = 580,
    height: int = 2100,
    qty: int = 1,
    grain: str = "none",
) -> BomPanelRow:
    area = Decimal(str(width)) * Decimal(str(height)) / Decimal("1000000") * qty
    return BomPanelRow(
        name=name,
        material_name="Oak",
        material_sku="OAK-18",
        thickness_mm=18,
        width_mm=width,
        height_mm=height,
        quantity=qty,
        grain_direction=grain,
        edge_left=False,
        edge_right=False,
        edge_top=False,
        edge_bottom=False,
        area_m2=area,
    )


def _make_bom(*panels: BomPanelRow) -> BomResponse:
    panel_list = list(panels)
    return BomResponse(
        panels=panel_list,
        hardware=[],
        total_panels=sum(p.quantity for p in panel_list),
        total_area_m2=sum((p.area_m2 for p in panel_list), Decimal("0")),
    )


def _parse_dxf(dxf_bytes: bytes):
    import ezdxf
    return ezdxf.read(io.StringIO(dxf_bytes.decode("utf-8")))


def test_dxf_panel_count():
    """BOM with 3 panels produces 3 closed LWPOLYLINE rectangles."""
    bom = _make_bom(_make_panel("A"), _make_panel("B"), _make_panel("C"))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    # Closed rectangles have 4 vertices; arrows have 2 vertices
    rects = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 4
    ]
    assert len(rects) == 3


def test_dxf_panel_dimensions():
    """LWPOLYLINE bounding box matches panel width_mm × height_mm."""
    bom = _make_bom(_make_panel("Side", width=580, height=2100))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    rects = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 4
    ]
    pts = list(rects[0].get_points(format="xy"))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    assert max(xs) - min(xs) == pytest.approx(580, abs=1)
    assert max(ys) - min(ys) == pytest.approx(2100, abs=1)


def test_dxf_grain_arrow_present():
    """Panel with grain direction produces an open LWPOLYLINE arrow."""
    bom = _make_bom(_make_panel("Side", grain="horizontal"))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    arrows = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 2
    ]
    assert len(arrows) >= 1


def test_dxf_no_grain_arrow():
    """Panel with grain_direction='none' produces no open LWPOLYLINE arrows."""
    bom = _make_bom(_make_panel("Side", grain="none"))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    arrows = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 2
    ]
    assert len(arrows) == 0
