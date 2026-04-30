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


@pytest.mark.asyncio
async def test_list_configurations_by_project(client):
    """GET /configurations?project_id= returns only configs for that project."""
    headers, project_id, ft_id = await _setup(client)

    # Create a second project
    r = await client.post("/projects", json={"name": "Other Project"}, headers=headers)
    other_project_id = r.json()["id"]

    # Create one config in each project
    c1 = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    c2 = await client.post("/configurations", json={
        "project_id": other_project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 900},
    }, headers=headers)
    assert c1.status_code == 201
    assert c2.status_code == 201

    r = await client.get(f"/configurations?project_id={project_id}", headers=headers)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert c1.json()["id"] in ids
    assert c2.json()["id"] not in ids


@pytest.mark.asyncio
async def test_delete_draft_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.delete(f"/configurations/{config_id}", headers=headers)
    assert response.status_code == 204

    get_response = await client.get(f"/configurations/{config_id}", headers=headers)
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_confirmed_configuration_rejected(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {},
    }, headers=headers)
    config_id = r.json()["id"]
    await client.post(f"/configurations/{config_id}/confirm", headers=headers)

    response = await client.delete(f"/configurations/{config_id}", headers=headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_list_configurations_wrong_owner_returns_404(client):
    """GET /configurations?project_id= returns 404 for another user's project."""
    headers_a, project_id, _ = await _setup(client)

    email_b = f"cfg_b_{_uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email_b, "password": "password", "role": "manufacturer"})
    r = await client.post("/auth/login", json={"email": email_b, "password": "password"})
    headers_b = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await client.get(f"/configurations?project_id={project_id}", headers=headers_b)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_all_configurations(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/projects", json={"name": "Second"}, headers=headers)
    project_id_2 = r.json()["id"]
    await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200, "height": 2100, "depth": 580},
    }, headers=headers)
    await client.post("/configurations", json={
        "project_id": project_id_2,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1000, "height": 2000, "depth": 500},
    }, headers=headers)

    response = await client.get("/configurations", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_list_all_configurations_isolation(client):
    headers_a, project_id_a, ft_id_a = await _setup(client)
    headers_b, _, _ = await _setup(client)
    await client.post("/configurations", json={
        "project_id": project_id_a,
        "furniture_type_id": ft_id_a,
        "applied_config": {"width": 1200, "height": 2100, "depth": 580},
    }, headers=headers_a)

    response = await client.get("/configurations", headers=headers_b)
    assert response.status_code == 200
    assert len(response.json()) == 0
