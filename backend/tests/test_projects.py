# backend/tests/test_projects.py
import pytest


async def _register_and_login(client, email: str, role: str = "designer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "pass", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "pass"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_project(client):
    headers = await _register_and_login(client, "proj1@example.com")
    response = await client.post("/projects", json={"name": "My Room"}, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Room"
    assert data["room_schema"] is None


@pytest.mark.asyncio
async def test_list_projects_returns_own_only(client):
    headers_a = await _register_and_login(client, "a@example.com")
    headers_b = await _register_and_login(client, "b@example.com")
    await client.post("/projects", json={"name": "Room A"}, headers=headers_a)
    await client.post("/projects", json={"name": "Room B"}, headers=headers_a)
    await client.post("/projects", json={"name": "Room C"}, headers=headers_b)

    response = await client.get("/projects", headers=headers_a)
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_get_project(client):
    headers = await _register_and_login(client, "get@example.com")
    r = await client.post("/projects", json={"name": "Get Me"}, headers=headers)
    project_id = r.json()["id"]

    response = await client.get(f"/projects/{project_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == project_id


@pytest.mark.asyncio
async def test_update_room_schema(client):
    headers = await _register_and_login(client, "schema@example.com")
    r = await client.post("/projects", json={"name": "Schema Room"}, headers=headers)
    project_id = r.json()["id"]

    schema = {
        "walls": [{"start": [0, 0], "end": [3000, 0], "height": 2600}],
        "openings": [],
        "floor_material_id": None,
        "ceiling_material_id": None,
    }
    response = await client.put(
        f"/projects/{project_id}/room-schema",
        json={"room_schema": schema},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["room_schema"]["walls"][0]["end"] == [3000, 0]


@pytest.mark.asyncio
async def test_get_other_users_project_returns_404(client):
    headers_a = await _register_and_login(client, "owner@example.com")
    headers_b = await _register_and_login(client, "other@example.com")
    r = await client.post("/projects", json={"name": "Private"}, headers=headers_a)
    project_id = r.json()["id"]

    response = await client.get(f"/projects/{project_id}", headers=headers_b)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_403(client):
    response = await client.get("/projects")
    assert response.status_code in (401, 403)
