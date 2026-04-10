import io
import zipfile
from typing import Optional

import pytest
from PIL import Image

from app.config import settings


_MATERIAL_BASE = {
    "category": "laminate",
    "name": "Oak Natural",
    "sku": "OAK-NAT-18",
    "thickness_options": [16, 18, 22],
    "price_per_m2": 12.50,
    "edgebanding_price_per_mm": 0.003,
    "grain_direction": "horizontal",
}


async def _register_and_login(
    client, email: str, role: str = "manufacturer", tenant_id: Optional[str] = None
) -> dict:
    payload: dict = {"email": email, "password": "password", "role": role}
    if tenant_id is not None:
        payload["tenant_id"] = tenant_id
    await client.post("/auth/register", json=payload)
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
    tenant_uuid = "11111111-1111-1111-1111-111111111111"
    headers = await _register_and_login(client, "upd1@example.com", tenant_id=tenant_uuid)
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=headers)
    assert r.status_code == 201
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


def _make_pbr_zip(width: int = 1024, height: int = 1024) -> bytes:
    """Create a valid 4-map PBR ZIP with synthetic PNG images."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name in ["albedo.png", "normal.png", "roughness.png", "ao.png"]:
            img_buf = io.BytesIO()
            Image.new("RGB", (width, height), color=(128, 128, 128)).save(img_buf, format="PNG")
            zf.writestr(name, img_buf.getvalue())
    return buf.getvalue()


@pytest.mark.asyncio
async def test_upload_material_creates_record(client, s3_mock):
    headers = await _register_and_login(client, "upl1@example.com")
    zip_data = _make_pbr_zip()

    response = await client.post(
        "/materials/upload",
        headers=headers,
        data={
            "name": "Oak Veneer PBR",
            "sku": "OAK-V-PBR",
            "category": "veneer",
            "price_per_m2": 28.00,
            "thickness_options": "[6, 8, 12]",
            "grain_direction": "vertical",
        },
        files={"file": ("textures.zip", zip_data, "application/zip")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Oak Veneer PBR"
    assert data["s3_albedo"] is not None
    assert data["s3_normal"] is not None
    assert data["s3_roughness"] is not None
    assert data["s3_ao"] is not None


@pytest.mark.asyncio
async def test_upload_material_stores_textures_in_s3(client, s3_mock):
    headers = await _register_and_login(client, "upl2@example.com")
    zip_data = _make_pbr_zip()

    r = await client.post(
        "/materials/upload",
        headers=headers,
        data={
            "name": "Test Mat",
            "sku": "TST-001",
            "category": "mdf",
            "price_per_m2": 10.0,
            "thickness_options": "[18]",
        },
        files={"file": ("textures.zip", zip_data, "application/zip")},
    )
    assert r.status_code == 201
    mat_id = r.json()["id"]

    # Verify all 4 texture objects exist in mocked S3
    objects = s3_mock.list_objects_v2(Bucket=settings.s3_bucket, Prefix=f"materials/{mat_id}/")
    keys = [o["Key"] for o in objects.get("Contents", [])]
    assert any("albedo.png" in k for k in keys)
    assert any("normal.png" in k for k in keys)
    assert any("roughness.png" in k for k in keys)
    assert any("ao.png" in k for k in keys)


@pytest.mark.asyncio
async def test_upload_bad_zip_returns_422(client, s3_mock):
    headers = await _register_and_login(client, "upl3@example.com")
    response = await client.post(
        "/materials/upload",
        headers=headers,
        data={
            "name": "Bad Mat",
            "sku": "BAD-001",
            "category": "laminate",
            "price_per_m2": 10.0,
            "thickness_options": "[18]",
        },
        files={"file": ("bad.zip", b"not-a-zip", "application/zip")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_low_res_zip_returns_422(client, s3_mock):
    headers = await _register_and_login(client, "upl4@example.com")
    zip_data = _make_pbr_zip(width=512, height=512)
    response = await client.post(
        "/materials/upload",
        headers=headers,
        data={
            "name": "Low Res",
            "sku": "LOW-001",
            "category": "laminate",
            "price_per_m2": 10.0,
            "thickness_options": "[18]",
        },
        files={"file": ("textures.zip", zip_data, "application/zip")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_consumer_cannot_upload_material(client, s3_mock):
    headers = await _register_and_login(client, "upl5@example.com", role="consumer")
    response = await client.post(
        "/materials/upload",
        headers=headers,
        data={
            "name": "X",
            "sku": "X",
            "category": "laminate",
            "price_per_m2": 10.0,
            "thickness_options": "[18]",
        },
        files={"file": ("textures.zip", b"data", "application/zip")},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_manufacturer_cannot_update_global_material(client):
    """A manufacturer must receive 403 when attempting to update a global (tenant_id=None) material."""
    # Admin creates a global material (no tenant_id)
    admin_headers = await _register_and_login(client, "admin_glob@example.com", role="admin")
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=admin_headers)
    assert r.status_code == 201
    mat_id = r.json()["id"]
    # The material is global: admin doesn't supply tenant_id so it defaults to None for admins
    assert r.json()["tenant_id"] is None

    # Manufacturer tries to update the global material
    mfr_headers = await _register_and_login(client, "mfr_glob@example.com", role="manufacturer")
    response = await client.put(
        f"/materials/{mat_id}",
        json={"name": "Hacked Name"},
        headers=mfr_headers,
    )
    assert response.status_code == 403
