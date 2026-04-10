# backend/tests/test_pricing_api.py
import pytest


async def _register_and_login(client, email: str, role: str = "consumer") -> dict:
    await client.post(
        "/auth/register",
        json={"email": email, "password": "password", "role": role},
    )
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _setup_pricing_fixture(client, email: str):
    """Register manufacturer, create material + furniture type + project + configuration.
    Returns (headers, configuration_id, material_id)."""
    headers = await _register_and_login(client, email, role="manufacturer")

    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate",
            "name": "Oak",
            "sku": "OAK-18",
            "thickness_options": [18],
            "price_per_m2": 10.00,
            "edgebanding_price_per_mm": 0.003,
            "grain_direction": "none",
        },
        headers=headers,
    )
    assert mat_r.status_code == 201, mat_r.text
    mat_id = mat_r.json()["id"]

    ft_r = await client.post(
        "/furniture-types",
        json={
            "category": "wardrobe",
            "schema": {
                "labor_rate": "2.50",
                "dimensions": {
                    "width": {"min": 400, "max": 3000, "step": 100, "default": 1200}
                },
            },
        },
        headers=headers,
    )
    assert ft_r.status_code == 201, ft_r.text
    ft_id = ft_r.json()["id"]

    proj_r = await client.post("/projects", json={"name": "Test Room"}, headers=headers)
    assert proj_r.status_code == 201, proj_r.text
    proj_id = proj_r.json()["id"]

    applied_config = {
        "dimensions": {"width": 1200, "height": 2100, "depth": 600},
        "panels": [
            {
                "name": "Side",
                "material_id": mat_id,
                "thickness_mm": 18,
                "width_mm": 580,
                "height_mm": 2100,
                "quantity": 2,
                "grain_direction": "none",
                "edge_banding": {
                    "left": False,
                    "right": False,
                    "top": True,
                    "bottom": True,
                },
            }
        ],
        "hardware_list": [{"name": "Hinge", "unit_price": "0.50", "quantity": 4}],
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
async def test_pricing_calculate_returns_breakdown(client):
    headers, cfg_id, _ = await _setup_pricing_fixture(client, "price1@example.com")
    r = await client.post(
        "/pricing/calculate", json={"configuration_id": cfg_id}, headers=headers
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # area = 0.580 × 2.100 × 2 = 2.436 m²; panel_cost = 24.36
    assert data["panel_cost"] == pytest.approx(24.36, rel=1e-3)
    # edge: top(580)+bottom(580) = 1160mm × 2 qty × 0.003 = 6.96
    assert data["edge_cost"] == pytest.approx(6.96, rel=1e-3)
    # hardware: 0.50 × 4 = 2.00
    assert data["hardware_cost"] == pytest.approx(2.00, rel=1e-3)
    # labor: 2.50 × len(panels)=1 = 2.50
    assert data["labor_cost"] == pytest.approx(2.50, rel=1e-3)
    # subtotal = 24.36 + 6.96 + 2.00 + 2.50 = 35.82
    assert data["subtotal"] == pytest.approx(35.82, rel=1e-3)
    # total = 35.82 (user has no tenant → 0% margin)
    assert data["total"] == pytest.approx(35.82, rel=1e-3)
    assert len(data["breakdown"]) == 1
    assert data["breakdown"][0]["name"] == "Side"


@pytest.mark.asyncio
async def test_pricing_nonexistent_config_returns_404(client):
    headers = await _register_and_login(client, "price2@example.com")
    r = await client.post(
        "/pricing/calculate",
        json={"configuration_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_pricing_other_users_config_returns_404(client):
    headers1, cfg_id, _ = await _setup_pricing_fixture(client, "price3a@example.com")
    headers2 = await _register_and_login(client, "price3b@example.com")
    r = await client.post(
        "/pricing/calculate", json={"configuration_id": cfg_id}, headers=headers2
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_pricing_unauthenticated_returns_401(client):
    r = await client.post(
        "/pricing/calculate",
        json={"configuration_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert r.status_code == 401
