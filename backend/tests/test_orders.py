# backend/tests/test_orders.py
import pytest
from sqlalchemy import select as _select
from app.models.tenant import Tenant
from app.models.user import User


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "password", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _setup_confirmed_config(client, email: str):
    """Create full fixture: material + furniture type + project + configuration + confirm.
    Returns (headers, cfg_id).
    """
    headers = await _register_and_login(client, email)

    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate",
            "name": "Oak",
            "sku": f"OAK-{email[:6]}",
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

    cfg_r = await client.post(
        "/configurations",
        json={
            "project_id": proj_id,
            "furniture_type_id": ft_id,
            "applied_config": {
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
                "hardware_list": [],
            },
        },
        headers=headers,
    )
    assert cfg_r.status_code == 201, cfg_r.text
    cfg_id = cfg_r.json()["id"]

    confirm_r = await client.post(f"/configurations/{cfg_id}/confirm", headers=headers)
    assert confirm_r.status_code == 200, confirm_r.text
    assert confirm_r.json()["status"] == "confirmed"

    return headers, cfg_id


# ── Confirm endpoint tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confirm_configuration(client):
    """Happy path: draft config transitions to confirmed."""
    headers = await _register_and_login(client, "conf1@example.com")
    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate", "name": "Oak", "sku": "OAK-C1",
            "thickness_options": [18], "price_per_m2": 10.0,
            "grain_direction": "none",
        },
        headers=headers,
    )
    mat_id = mat_r.json()["id"]
    ft_r = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": {"labor_rate": "0"}},
        headers=headers,
    )
    ft_id = ft_r.json()["id"]
    proj_r = await client.post("/projects", json={"name": "R"}, headers=headers)
    proj_id = proj_r.json()["id"]
    cfg_r = await client.post(
        "/configurations",
        json={
            "project_id": proj_id,
            "furniture_type_id": ft_id,
            "applied_config": {
                "dimensions": {"width": 600, "height": 2000, "depth": 300},
                "panels": [
                    {
                        "name": "P",
                        "material_id": mat_id,
                        "thickness_mm": 18,
                        "width_mm": 300,
                        "height_mm": 600,
                        "quantity": 1,
                        "grain_direction": "none",
                        "edge_banding": {"left": False, "right": False, "top": False, "bottom": False},
                    }
                ],
                "hardware_list": [],
            },
        },
        headers=headers,
    )
    cfg_id = cfg_r.json()["id"]

    r = await client.post(f"/configurations/{cfg_id}/confirm", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_confirm_already_confirmed_returns_409(client):
    headers, cfg_id = await _setup_confirmed_config(client, "conf2@example.com")
    r = await client.post(f"/configurations/{cfg_id}/confirm", headers=headers)
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_confirm_wrong_owner_returns_404(client):
    """User2 cannot confirm User1's draft configuration."""
    headers1 = await _register_and_login(client, "conf3a@example.com")
    headers2 = await _register_and_login(client, "conf3b@example.com")

    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate", "name": "Oak", "sku": "OAK-C3",
            "thickness_options": [18], "price_per_m2": 10.0, "grain_direction": "none",
        },
        headers=headers1,
    )
    mat_id = mat_r.json()["id"]
    ft_r = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": {"labor_rate": "0"}},
        headers=headers1,
    )
    ft_id = ft_r.json()["id"]
    proj_r = await client.post("/projects", json={"name": "R"}, headers=headers1)
    proj_id = proj_r.json()["id"]
    cfg_r = await client.post(
        "/configurations",
        json={
            "project_id": proj_id,
            "furniture_type_id": ft_id,
            "applied_config": {
                "dimensions": {"width": 600, "height": 2000, "depth": 300},
                "panels": [{
                    "name": "P", "material_id": mat_id, "thickness_mm": 18,
                    "width_mm": 300, "height_mm": 600, "quantity": 1,
                    "grain_direction": "none",
                    "edge_banding": {"left": False, "right": False, "top": False, "bottom": False},
                }],
                "hardware_list": [],
            },
        },
        headers=headers1,
    )
    cfg_id = cfg_r.json()["id"]
    # User2 tries to confirm User1's config
    r = await client.post(f"/configurations/{cfg_id}/confirm", headers=headers2)
    assert r.status_code == 404


# ── Orders endpoint tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_order_happy_path(client, s3_mock):
    headers, cfg_id = await _setup_confirmed_config(client, "ord1@example.com")
    r = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["configuration_id"] == cfg_id
    assert "dxf" in data["export_urls"]
    assert "pdf" in data["export_urls"]
    assert data["export_urls"]["dxf"] is not None
    assert data["export_urls"]["pdf"] is not None
    assert "pricing_snapshot" in data
    assert "bom_snapshot" in data


@pytest.mark.asyncio
async def test_create_order_unconfirmed_returns_422(client, s3_mock):
    """Cannot create order for a draft (unconfirmed) configuration."""
    headers = await _register_and_login(client, "ord2@example.com")
    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate", "name": "Oak", "sku": "OAK-O2",
            "thickness_options": [18], "price_per_m2": 10.0, "grain_direction": "none",
        },
        headers=headers,
    )
    mat_id = mat_r.json()["id"]
    ft_r = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": {"labor_rate": "0"}},
        headers=headers,
    )
    ft_id = ft_r.json()["id"]
    proj_r = await client.post("/projects", json={"name": "R"}, headers=headers)
    proj_id = proj_r.json()["id"]
    cfg_r = await client.post(
        "/configurations",
        json={
            "project_id": proj_id,
            "furniture_type_id": ft_id,
            "applied_config": {
                "dimensions": {"width": 600, "height": 2000, "depth": 300},
                "panels": [{
                    "name": "P", "material_id": mat_id, "thickness_mm": 18,
                    "width_mm": 300, "height_mm": 600, "quantity": 1,
                    "grain_direction": "none",
                    "edge_banding": {"left": False, "right": False, "top": False, "bottom": False},
                }],
                "hardware_list": [],
            },
        },
        headers=headers,
    )
    cfg_id = cfg_r.json()["id"]
    # Config is in draft — do NOT confirm
    r = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_order_duplicate_returns_409(client, s3_mock):
    headers, cfg_id = await _setup_confirmed_config(client, "ord3@example.com")
    r1 = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_create_order_wrong_owner_returns_404(client, s3_mock):
    headers1, cfg_id = await _setup_confirmed_config(client, "ord4a@example.com")
    headers2 = await _register_and_login(client, "ord4b@example.com")
    r = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers2)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_orders_returns_only_callers_orders(client, s3_mock):
    headers1, cfg_id1 = await _setup_confirmed_config(client, "ord5a@example.com")
    headers2, cfg_id2 = await _setup_confirmed_config(client, "ord5b@example.com")

    r1 = await client.post("/orders", json={"configuration_id": cfg_id1}, headers=headers1)
    assert r1.status_code == 201
    r2 = await client.post("/orders", json={"configuration_id": cfg_id2}, headers=headers2)
    assert r2.status_code == 201

    list_r = await client.get("/orders", headers=headers1)
    assert list_r.status_code == 200
    data = list_r.json()
    assert len(data) == 1
    assert data[0]["configuration_id"] == cfg_id1


@pytest.mark.asyncio
async def test_get_order_by_id(client, s3_mock):
    headers, cfg_id = await _setup_confirmed_config(client, "ord6@example.com")
    create_r = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)
    order_id = create_r.json()["id"]

    r = await client.get(f"/orders/{order_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == order_id


@pytest.mark.asyncio
async def test_get_order_wrong_owner_returns_404(client, s3_mock):
    headers1, cfg_id = await _setup_confirmed_config(client, "ord7a@example.com")
    headers2 = await _register_and_login(client, "ord7b@example.com")
    create_r = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers1)
    order_id = create_r.json()["id"]

    r = await client.get(f"/orders/{order_id}", headers=headers2)
    assert r.status_code == 404


# ── Dispatch endpoint tests ─────────────────────────────────────────────────

async def _setup_order_with_webhook(
    client, db_session, email: str, webhook_url: str, crm_config: dict
):
    """Create user, link to a tenant with webhook_url, confirm config, create order.

    The test must request both `client` and `db_session` fixtures (they share the same
    underlying session). The `s3_mock` fixture must be active in the calling test.

    Returns (headers, order_id).
    """
    headers, cfg_id = await _setup_confirmed_config(client, email)

    # Create tenant with webhook configuration
    tenant = Tenant(
        name="Test Tenant",
        webhook_url=webhook_url,
        crm_config=crm_config,
    )
    db_session.add(tenant)
    await db_session.flush()  # populate tenant.id without committing yet

    # Associate the registered user with the tenant
    result = await db_session.execute(_select(User).where(User.email == email))
    user = result.scalar_one()
    user.tenant_id = tenant.id
    await db_session.commit()

    # Create the order (s3_mock must be active in the calling test)
    order_r = await client.post(
        "/orders", json={"configuration_id": cfg_id}, headers=headers
    )
    assert order_r.status_code == 201, order_r.text
    return headers, order_r.json()["id"]


@pytest.mark.asyncio
async def test_dispatch_happy_path(client, db_session, s3_mock, httpx_mock):
    """CRM returns 200 with crm_ref — order is updated and result returned."""
    headers, order_id = await _setup_order_with_webhook(
        client,
        db_session,
        "disp1@example.com",
        webhook_url="https://crm.example.com/webhook",
        crm_config={"payload_fields": ["order_id"], "crm_ref_path": "id"},
    )
    httpx_mock.add_response(
        url="https://crm.example.com/webhook",
        json={"id": "CRM-123"},
        status_code=200,
    )
    r = await client.post(f"/orders/{order_id}/dispatch", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["http_status"] == 200
    assert data["crm_ref"] == "CRM-123"
    assert data["order_id"] == order_id

    # Verify order was updated in the DB
    order_r = await client.get(f"/orders/{order_id}", headers=headers)
    assert order_r.json()["crm_ref"] == "CRM-123"
    assert order_r.json()["last_dispatch"]["http_status"] == 200


@pytest.mark.asyncio
async def test_dispatch_records_non_2xx(client, db_session, s3_mock, httpx_mock):
    """CRM returns 500 — attempt is recorded, crm_ref is NOT set."""
    headers, order_id = await _setup_order_with_webhook(
        client,
        db_session,
        "disp2@example.com",
        webhook_url="https://crm.example.com/webhook",
        crm_config={"crm_ref_path": "id"},
    )
    httpx_mock.add_response(
        url="https://crm.example.com/webhook",
        status_code=500,
        text="Internal Server Error",
    )
    r = await client.post(f"/orders/{order_id}/dispatch", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["http_status"] == 500
    assert data["crm_ref"] is None

    # Verify last_dispatch recorded but crm_ref not set
    order_r = await client.get(f"/orders/{order_id}", headers=headers)
    assert order_r.json()["crm_ref"] is None
    assert order_r.json()["last_dispatch"]["http_status"] == 500


@pytest.mark.asyncio
async def test_dispatch_no_webhook_url_returns_422(client, s3_mock):
    """User has no tenant → 422 before any HTTP call is made."""
    # _setup_confirmed_config creates a user with no tenant
    headers, cfg_id = await _setup_confirmed_config(client, "disp3@example.com")
    order_r = await client.post(
        "/orders", json={"configuration_id": cfg_id}, headers=headers
    )
    assert order_r.status_code == 201, order_r.text
    order_id = order_r.json()["id"]

    r = await client.post(f"/orders/{order_id}/dispatch", headers=headers)
    assert r.status_code == 422
    assert "webhook" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_dispatch_wrong_owner_returns_404(client, db_session, s3_mock):
    """User2 cannot dispatch User1's order."""
    headers1, order_id = await _setup_order_with_webhook(
        client,
        db_session,
        "disp4a@example.com",
        webhook_url="https://crm.example.com/webhook",
        crm_config={},
    )
    headers2 = await _register_and_login(client, "disp4b@example.com")
    r = await client.post(f"/orders/{order_id}/dispatch", headers=headers2)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_dispatch_overwrites_last_dispatch(client, db_session, s3_mock, httpx_mock):
    """Dispatching twice — second call's result is stored in last_dispatch."""
    headers, order_id = await _setup_order_with_webhook(
        client,
        db_session,
        "disp5@example.com",
        webhook_url="https://crm.example.com/webhook",
        crm_config={"crm_ref_path": "id"},
    )
    httpx_mock.add_response(
        url="https://crm.example.com/webhook",
        json={"id": "CRM-FIRST"},
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://crm.example.com/webhook",
        json={"id": "CRM-SECOND"},
        status_code=200,
    )
    await client.post(f"/orders/{order_id}/dispatch", headers=headers)
    r2 = await client.post(f"/orders/{order_id}/dispatch", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["crm_ref"] == "CRM-SECOND"

    order_r = await client.get(f"/orders/{order_id}", headers=headers)
    assert order_r.json()["crm_ref"] == "CRM-SECOND"


@pytest.mark.asyncio
async def test_dispatch_unauthenticated_returns_403(client):
    r = await client.post("/orders/00000000-0000-0000-0000-000000000001/dispatch")
    assert r.status_code == 403
