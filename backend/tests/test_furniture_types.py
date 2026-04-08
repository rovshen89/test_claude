# backend/tests/test_furniture_types.py
import pytest

_WARDROBE_SCHEMA = {
    "category": "wardrobe",
    "dimensions": {
        "width": {"min": 600, "max": 3000, "step": 100, "default": 1200},
        "height": {"min": 1800, "max": 2700, "step": 100, "default": 2100},
        "depth": {"min": 400, "max": 700, "step": 50, "default": 580},
    },
    "columns": 2,
    "rows": 3,
    "slots": [],
    "hardware_rules": [],
    "edge_banding_map": {},
}


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "pass", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "pass"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_furniture_type(client):
    headers = await _register_and_login(client, "mfr@example.com")
    response = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "wardrobe"
    assert data["schema"]["columns"] == 2


@pytest.mark.asyncio
async def test_consumer_cannot_create_furniture_type(client):
    headers = await _register_and_login(client, "consumer@example.com", role="consumer")
    response = await client.post(
        "/furniture-types",
        json={"category": "shelving", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_furniture_types_by_category(client):
    headers = await _register_and_login(client, "list@example.com")
    await client.post("/furniture-types", json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA}, headers=headers)
    await client.post("/furniture-types", json={"category": "shelving", "schema": _WARDROBE_SCHEMA}, headers=headers)

    response = await client.get("/furniture-types?category=wardrobe", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category"] == "wardrobe"


@pytest.mark.asyncio
async def test_get_furniture_type_by_id(client):
    headers = await _register_and_login(client, "get_ft@example.com")
    r = await client.post("/furniture-types", json={"category": "kitchen", "schema": _WARDROBE_SCHEMA}, headers=headers)
    ft_id = r.json()["id"]

    response = await client.get(f"/furniture-types/{ft_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == ft_id
