# backend/tests/test_tenants.py
import pytest


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "password", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_get_my_tenant(client):
    headers = await _register_and_login(client, "tenant_get@example.com")
    response = await client.get("/tenants/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "name" in data
    assert "margin_pct" in data
    assert data["webhook_url"] is None
    assert data["crm_config"] is None


@pytest.mark.asyncio
async def test_update_tenant(client):
    headers = await _register_and_login(client, "tenant_upd@example.com")
    response = await client.put(
        "/tenants/me",
        json={
            "name": "Acme Furniture",
            "webhook_url": "https://example.com/webhook",
            "margin_pct": 12.5,
            "crm_config": {"api_key": "secret"},
        },
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Acme Furniture"
    assert data["webhook_url"] == "https://example.com/webhook"
    assert data["margin_pct"] == 12.5
    assert data["crm_config"] == {"api_key": "secret"}


@pytest.mark.asyncio
async def test_get_tenant_no_tenant(client):
    """Admin without a tenant gets 404."""
    headers = await _register_and_login(client, "tenant_admin@example.com", role="admin")
    response = await client.get("/tenants/me", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_tenant_no_tenant(client):
    """Admin without a tenant gets 404 on PUT."""
    headers = await _register_and_login(client, "tenant_admin_put@example.com", role="admin")
    response = await client.put(
        "/tenants/me",
        json={"name": "Should Fail"},
        headers=headers,
    )
    assert response.status_code == 404
