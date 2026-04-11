# backend/tests/test_configurations.py
import pytest
import uuid as _uuid

_WARDROBE_SCHEMA = {
    "category": "wardrobe",
    "dimensions": {"width": {"min": 600, "max": 3000, "step": 100, "default": 1200},
                   "height": {"min": 1800, "max": 2700, "step": 100, "default": 2100},
                   "depth": {"min": 400, "max": 700, "step": 50, "default": 580}},
    "columns": 2, "rows": 3, "slots": [], "hardware_rules": [], "edge_banding_map": {},
}


async def _setup(client) -> tuple[dict, str, str]:
    """Returns auth headers, project_id, furniture_type_id."""
    email = f"cfg_{_uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "password", "role": "manufacturer"})
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await client.post("/projects", json={"name": "Project"}, headers=headers)
    project_id = r.json()["id"]

    r = await client.post("/furniture-types",
                          json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA},
                          headers=headers)
    ft_id = r.json()["id"]
    return headers, project_id, ft_id


@pytest.mark.asyncio
async def test_create_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    response = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200, "height": 2100, "depth": 580},
    }, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["applied_config"]["width"] == 1200


@pytest.mark.asyncio
async def test_get_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 900},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.get(f"/configurations/{config_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == config_id


@pytest.mark.asyncio
async def test_update_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.put(f"/configurations/{config_id}", json={
        "applied_config": {"width": 1500, "height": 2100, "depth": 580},
        "placement": {"x": 0, "y": 0, "z": 0, "rotation": 0},
    }, headers=headers)
    assert response.status_code == 200
    assert response.json()["applied_config"]["width"] == 1500
    assert response.json()["placement"]["x"] == 0


@pytest.mark.asyncio
async def test_confirm_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.post(f"/configurations/{config_id}/confirm", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_confirm_already_confirmed_returns_409(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]
    await client.post(f"/configurations/{config_id}/confirm", headers=headers)

    response = await client.post(f"/configurations/{config_id}/confirm", headers=headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_update_confirmed_configuration_returns_400(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]
    await client.post(f"/configurations/{config_id}/confirm", headers=headers)

    response = await client.put(f"/configurations/{config_id}", json={
        "applied_config": {"width": 1500},
    }, headers=headers)
    assert response.status_code == 400
