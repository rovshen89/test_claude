import pytest


_MATERIAL_BASE = {
    "category": "laminate",
    "name": "Oak Natural",
    "sku": "OAK-NAT-18",
    "thickness_options": [16, 18, 22],
    "price_per_m2": 12.50,
    "edgebanding_price_per_mm": 0.003,
    "grain_direction": "horizontal",
}


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post(
        "/auth/register",
        json={"email": email, "password": "password", "role": role},
    )
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_material(client):
    headers = await _register_and_login(client, "mat1@example.com")
    response = await client.post("/materials", json=_MATERIAL_BASE, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Oak Natural"
    assert data["category"] == "laminate"
    assert data["thickness_options"] == [16, 18, 22]
    assert data["grain_direction"] == "horizontal"


@pytest.mark.asyncio
async def test_consumer_cannot_create_material(client):
    headers = await _register_and_login(client, "con1@example.com", role="consumer")
    response = await client.post("/materials", json=_MATERIAL_BASE, headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_materials_includes_own_tenant(client):
    headers = await _register_and_login(client, "list1@example.com")
    await client.post("/materials", json={**_MATERIAL_BASE, "name": "Mat A"}, headers=headers)
    await client.post("/materials", json={**_MATERIAL_BASE, "name": "Mat B"}, headers=headers)

    response = await client.get("/materials", headers=headers)
    assert response.status_code == 200
    names = [m["name"] for m in response.json()]
    assert "Mat A" in names
    assert "Mat B" in names


@pytest.mark.asyncio
async def test_list_materials_filter_by_category(client):
    headers = await _register_and_login(client, "cat1@example.com")
    await client.post("/materials", json={**_MATERIAL_BASE, "category": "laminate"}, headers=headers)
    await client.post("/materials", json={**_MATERIAL_BASE, "category": "veneer"}, headers=headers)

    response = await client.get("/materials?category=laminate", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category"] == "laminate"


@pytest.mark.asyncio
async def test_get_material_by_id(client):
    headers = await _register_and_login(client, "get1@example.com")
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=headers)
    mat_id = r.json()["id"]

    response = await client.get(f"/materials/{mat_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == mat_id


@pytest.mark.asyncio
async def test_update_material(client):
    headers = await _register_and_login(client, "upd1@example.com")
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=headers)
    mat_id = r.json()["id"]

    response = await client.put(
        f"/materials/{mat_id}",
        json={"price_per_m2": 15.00, "name": "Oak Natural Updated"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["price_per_m2"] == 15.00
    assert data["name"] == "Oak Natural Updated"


@pytest.mark.asyncio
async def test_get_nonexistent_material_returns_404(client):
    headers = await _register_and_login(client, "tb@example.com")
    response = await client.get(
        "/materials/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert response.status_code == 404
