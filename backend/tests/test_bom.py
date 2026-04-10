# backend/tests/test_bom.py
import pytest
from decimal import Decimal
from uuid import uuid4

from app.core.bom import MaterialInfo, generate_bom
from app.schemas.applied_config import AppliedConfig, EdgeBanding, HardwareItem, PanelSpec


def _make_config(mat_id) -> AppliedConfig:
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
                grain_direction="vertical",
                edge_banding=EdgeBanding(top=True, bottom=True),
            ),
            PanelSpec(
                name="Shelf",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=544,
                height_mm=400,
                quantity=6,
                edge_banding=EdgeBanding(left=True, right=True),
            ),
        ],
        hardware_list=[HardwareItem(name="Hinge", unit_price=Decimal("0.50"), quantity=4)],
    )


def test_bom_panel_rows():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    assert len(result.panels) == 2
    side = result.panels[0]
    assert side.name == "Side"
    assert side.quantity == 2
    assert side.material_name == "Oak Laminate"
    assert side.material_sku == "OAK-18"
    assert side.thickness_mm == 18
    assert side.width_mm == 580
    assert side.height_mm == 2100
    assert side.grain_direction == "vertical"
    assert side.edge_top is True
    assert side.edge_bottom is True
    assert side.edge_left is False
    assert side.edge_right is False


def test_bom_total_panels():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    # 2 sides + 6 shelves = 8 total physical pieces
    assert result.total_panels == 8


def test_bom_total_area():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    # Sides: 0.580 × 2.100 × 2 = 2.436
    # Shelves: 0.544 × 0.400 × 6 = 1.3056
    # Total = 3.7416
    assert float(result.total_area_m2) == pytest.approx(3.7416, rel=1e-3)


def test_bom_hardware_rows():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    assert len(result.hardware) == 1
    assert result.hardware[0].name == "Hinge"
    assert result.hardware[0].quantity == 4
    assert float(result.hardware[0].unit_price) == pytest.approx(0.50, rel=1e-3)
    # total_price = 0.50 × 4 = 2.00
    assert float(result.hardware[0].total_price) == pytest.approx(2.00, rel=1e-3)


def test_bom_empty_hardware():
    mat_id = uuid4()
    config = AppliedConfig(
        dimensions={"width": 600, "height": 800, "depth": 300},
        panels=[
            PanelSpec(
                name="Top",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=600,
                height_mm=300,
                quantity=1,
            )
        ],
        hardware_list=[],
    )
    materials = {mat_id: MaterialInfo(name="MDF", sku="MDF-18")}
    result = generate_bom(config, materials)
    assert result.hardware == []
    assert result.total_panels == 1


# ── Integration tests ────────────────────────────────────────────────────────


async def _register_and_login(client, email: str, role: str = "consumer") -> dict:
    await client.post(
        "/auth/register",
        json={"email": email, "password": "password", "role": role},
    )
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _setup_bom_fixture(client, email: str):
    headers = await _register_and_login(client, email, role="manufacturer")

    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate",
            "name": "Oak Laminate",
            "sku": "OAK-18",
            "thickness_options": [18],
            "price_per_m2": 10.00,
            "grain_direction": "none",
        },
        headers=headers,
    )
    assert mat_r.status_code == 201, mat_r.text
    mat_id = mat_r.json()["id"]

    ft_r = await client.post(
        "/furniture-types",
        json={"category": "shelving", "schema": {"labor_rate": "0"}},
        headers=headers,
    )
    assert ft_r.status_code == 201, ft_r.text
    ft_id = ft_r.json()["id"]

    proj_r = await client.post("/projects", json={"name": "Room"}, headers=headers)
    assert proj_r.status_code == 201, proj_r.text
    proj_id = proj_r.json()["id"]

    applied_config = {
        "dimensions": {"width": 600, "height": 800, "depth": 300},
        "panels": [
            {
                "name": "Shelf",
                "material_id": mat_id,
                "thickness_mm": 18,
                "width_mm": 544,
                "height_mm": 300,
                "quantity": 3,
                "grain_direction": "none",
                "edge_banding": {
                    "left": True,
                    "right": True,
                    "top": False,
                    "bottom": False,
                },
            }
        ],
        "hardware_list": [],
    }
    cfg_r = await client.post(
        "/configurations",
        json={
            "project_id": proj_id,
            "furniture_type_id": ft_id,
            "applied_config": applied_config,
        },
        headers=headers,
    )
    assert cfg_r.status_code == 201, cfg_r.text
    cfg_id = cfg_r.json()["id"]
    return headers, cfg_id, mat_id


@pytest.mark.asyncio
async def test_bom_generate_returns_cut_list(client):
    headers, cfg_id, _ = await _setup_bom_fixture(client, "bom1@example.com")
    r = await client.post("/bom/generate", json={"configuration_id": cfg_id}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["panels"]) == 1
    panel = data["panels"][0]
    assert panel["name"] == "Shelf"
    assert panel["quantity"] == 3
    assert panel["material_name"] == "Oak Laminate"
    assert panel["material_sku"] == "OAK-18"
    assert panel["edge_left"] is True
    assert panel["edge_right"] is True
    assert panel["edge_top"] is False
    assert data["total_panels"] == 3
    # area = 0.544 × 0.300 × 3 = 0.4896
    assert data["total_area_m2"] == pytest.approx(0.4896, rel=1e-3)
    assert data["hardware"] == []


@pytest.mark.asyncio
async def test_bom_nonexistent_config_returns_404(client):
    headers = await _register_and_login(client, "bom2@example.com")
    r = await client.post(
        "/bom/generate",
        json={"configuration_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_bom_other_users_config_returns_404(client):
    headers1, cfg_id, _ = await _setup_bom_fixture(client, "bom3a@example.com")
    headers2 = await _register_and_login(client, "bom3b@example.com")
    r = await client.post(
        "/bom/generate", json={"configuration_id": cfg_id}, headers=headers2
    )
    assert r.status_code == 404
