# Material System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the material catalog API — CRUD for PBR materials with tenant isolation, manufacturer ZIP upload with texture validation, and S3-compatible storage.

**Architecture:** Material records live in PostgreSQL; four PBR texture maps (albedo, normal, roughness, AO) are stored in S3-compatible object storage. The S3 client is wrapped in `core/storage.py` and mocked with `moto` in tests. ZIP uploads are validated by `core/pbr.py` (Pillow for image dimension checks). Tenant isolation follows the same `tenant_id IS NULL OR tenant_id = user.tenant_id` pattern as FurnitureType.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, boto3, Pillow, moto[s3] (tests), pydantic v2, pytest-asyncio

---

## File Map

```
backend/
├── requirements.txt                      # add boto3>=1.34, Pillow>=10.0
├── requirements-dev.txt                  # add moto[s3]>=5.0
├── app/
│   ├── config.py                         # add S3 settings (s3_bucket, s3_access_key, etc.)
│   ├── models/
│   │   ├── material.py                   # Material ORM model
│   │   └── __init__.py                   # add Material import
│   ├── schemas/
│   │   └── material.py                   # MaterialCreate, MaterialUpdate, MaterialResponse
│   ├── core/
│   │   ├── storage.py                    # get_s3_client(), upload_bytes(), get_public_url()
│   │   └── pbr.py                        # validate_and_extract_pbr_zip()
│   └── api/
│       ├── materials.py                  # GET /materials, GET /materials/{id}, POST /materials/upload, PUT /materials/{id}
│       └── router.py                     # add materials router
├── alembic/versions/
│   └── 003_create_material_catalog.py
└── tests/
    ├── conftest.py                       # add Material import + s3_mock fixture
    ├── test_storage.py                   # unit tests for storage.py (moto)
    ├── test_pbr.py                       # unit tests for pbr.py (Pillow)
    └── test_materials.py                 # integration tests for /materials endpoints
```

---

### Task 1: Requirements + Material Model + Migration

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements-dev.txt`
- Create: `backend/app/models/material.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/003_create_material_catalog.py`

- [ ] **Step 1.1: Add boto3 and Pillow to requirements.txt**

Replace the contents of `backend/requirements.txt` with:

```
# backend/requirements.txt
fastapi>=0.115
uvicorn[standard]>=0.30
sqlalchemy[asyncio]>=2.0
alembic>=1.13
asyncpg>=0.29
aiosqlite>=0.19
pydantic[email]>=2.9
pydantic-settings>=2.4
PyJWT>=2.8
bcrypt>=4.0
python-multipart>=0.0.12
boto3>=1.34
Pillow>=10.0
```

- [ ] **Step 1.2: Add moto to requirements-dev.txt**

Replace the contents of `backend/requirements-dev.txt` with:

```
# backend/requirements-dev.txt
-r requirements.txt
pytest>=8.3
pytest-asyncio>=0.23,<0.25
httpx>=0.27
moto[s3]>=5.0
```

- [ ] **Step 1.3: Install new dev dependencies**

```bash
cd /path/to/backend
pip install -r requirements-dev.txt
```

Expected: boto3, Pillow, moto installed without errors.

- [ ] **Step 1.4: Create backend/app/models/material.py**

```python
# backend/app/models/material.py
import uuid
from typing import Optional

from sqlalchemy import CheckConstraint, ForeignKey, JSON, Numeric, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Material(Base):
    __tablename__ = "material_catalog"
    __table_args__ = (
        CheckConstraint(
            "grain_direction IN ('horizontal','vertical','none')",
            name="ck_material_catalog_grain_direction",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True
    )  # NULL = global library
    category: Mapped[str] = mapped_column(Text, index=True)
    name: Mapped[str] = mapped_column(Text)
    sku: Mapped[str] = mapped_column(Text)
    thickness_options: Mapped[list] = mapped_column(JSON)  # e.g. [16, 18, 22]
    price_per_m2: Mapped[float] = mapped_column(Numeric)
    edgebanding_price_per_mm: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    s3_albedo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_normal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_roughness: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_ao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    grain_direction: Mapped[str] = mapped_column(Text, default="none")
```

- [ ] **Step 1.5: Update backend/app/models/__init__.py**

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.project import Project  # noqa: F401
from app.models.furniture_type import FurnitureType  # noqa: F401
from app.models.configuration import Configuration  # noqa: F401
from app.models.material import Material  # noqa: F401
```

- [ ] **Step 1.6: Create backend/alembic/versions/003_create_material_catalog.py**

```python
"""create material_catalog

Revision ID: 003
Revises: 002
Create Date: 2026-04-09

"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "material_catalog",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("sku", sa.Text(), nullable=False),
        sa.Column("thickness_options", sa.JSON(), nullable=False),
        sa.Column("price_per_m2", sa.Numeric(), nullable=False),
        sa.Column("edgebanding_price_per_mm", sa.Numeric(), nullable=True),
        sa.Column("s3_albedo", sa.Text(), nullable=True),
        sa.Column("s3_normal", sa.Text(), nullable=True),
        sa.Column("s3_roughness", sa.Text(), nullable=True),
        sa.Column("s3_ao", sa.Text(), nullable=True),
        sa.Column("grain_direction", sa.Text(), nullable=False, server_default="none"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "grain_direction IN ('horizontal','vertical','none')",
            name="ck_material_catalog_grain_direction",
        ),
    )
    op.create_index("ix_material_catalog_category", "material_catalog", ["category"])


def downgrade() -> None:
    op.drop_index("ix_material_catalog_category", table_name="material_catalog")
    op.drop_table("material_catalog")
```

- [ ] **Step 1.7: Verify existing tests still pass**

```bash
cd /path/to/backend
pytest tests/ -q
```

Expected: 28 passed (Material model registered with Base has no side effects on existing tests).

- [ ] **Step 1.8: Commit**

```bash
cd /path/to/backend
git add requirements.txt requirements-dev.txt \
        app/models/material.py app/models/__init__.py \
        alembic/versions/003_create_material_catalog.py
git commit -m "feat: add Material model and migration 003"
```

---

### Task 2: S3 Storage Client + Config Settings

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/core/storage.py`
- Create: `backend/tests/test_storage.py`

- [ ] **Step 2.1: Write failing storage tests**

```python
# backend/tests/test_storage.py
import boto3
import pytest
from moto import mock_aws

from app.config import settings
from app.core.storage import get_public_url, upload_bytes


@pytest.fixture
def _s3(monkeypatch):
    """Start moto mock, create the bucket, yield the boto3 client."""
    with mock_aws():
        s3 = boto3.client(
            "s3",
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        s3.create_bucket(Bucket=settings.s3_bucket)
        yield s3


def test_upload_bytes_stores_object(_s3):
    key = "tenant/abc/materials/mat1/albedo.png"
    data = b"fake-png-bytes"
    result_key = upload_bytes(key, data)
    assert result_key == key
    obj = _s3.get_object(Bucket=settings.s3_bucket, Key=key)
    assert obj["Body"].read() == data


def test_upload_bytes_sets_content_type(_s3):
    key = "tenant/abc/materials/mat1/normal.png"
    upload_bytes(key, b"data", content_type="image/png")
    obj = _s3.head_object(Bucket=settings.s3_bucket, Key=key)
    assert obj["ContentType"] == "image/png"


def test_get_public_url_returns_s3_url():
    key = "tenant/abc/materials/mat1/albedo.png"
    url = get_public_url(key)
    assert key in url
    assert settings.s3_bucket in url
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd /path/to/backend
pytest tests/test_storage.py -v
```

Expected: `ImportError: cannot import name 'upload_bytes' from 'app.core.storage'` (module doesn't exist yet).

- [ ] **Step 2.3: Add S3 settings to backend/app/config.py**

```python
# backend/app/config.py
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/furniture_constructor"
    secret_key: str = Field(default="change-me-in-production-replace-this-key", min_length=32)

    # S3-compatible storage
    s3_bucket: str = "furniture-constructor"
    s3_access_key: str = "test"
    s3_secret_key: str = "test"
    s3_endpoint_url: Optional[str] = None  # None = real AWS; set for MinIO/localstack
    aws_region: str = "us-east-1"


settings = Settings()
```

- [ ] **Step 2.4: Create backend/app/core/storage.py**

```python
# backend/app/core/storage.py
import boto3

from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.aws_region,
    )


def upload_bytes(key: str, data: bytes, content_type: str = "image/png") -> str:
    """Upload raw bytes to S3. Returns the key."""
    client = get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return key


def get_public_url(key: str) -> str:
    """Return the public URL for a stored object."""
    if settings.s3_endpoint_url:
        return f"{settings.s3_endpoint_url}/{settings.s3_bucket}/{key}"
    return f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"
```

- [ ] **Step 2.5: Run storage tests to verify they pass**

```bash
cd /path/to/backend
pytest tests/test_storage.py -v
```

Expected: 3 passed.

- [ ] **Step 2.6: Run full suite to confirm no regressions**

```bash
cd /path/to/backend
pytest tests/ -q
```

Expected: 31 passed.

- [ ] **Step 2.7: Commit**

```bash
cd /path/to/backend
git add app/config.py app/core/storage.py tests/test_storage.py
git commit -m "feat: add S3 storage client and config settings"
```

---

### Task 3: PBR ZIP Validator

**Files:**
- Create: `backend/app/core/pbr.py`
- Create: `backend/tests/test_pbr.py`

- [ ] **Step 3.1: Write failing PBR validator tests**

```python
# backend/tests/test_pbr.py
import io
import zipfile

import pytest
from PIL import Image

from app.core.pbr import validate_and_extract_pbr_zip


def _make_zip(maps: dict) -> bytes:
    """Build a ZIP from {filename: PIL.Image} dict."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, img in maps.items():
            img_buf = io.BytesIO()
            img.save(img_buf, format="PNG")
            zf.writestr(name, img_buf.getvalue())
    return buf.getvalue()


def _valid_maps(width: int = 1024, height: int = 1024) -> dict:
    """Return a dict of all 4 valid PBR maps as PIL Images."""
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    return {
        "albedo.png": img,
        "normal.png": img,
        "roughness.png": img,
        "ao.png": img,
    }


def test_valid_zip_returns_four_maps():
    zip_bytes = _make_zip(_valid_maps())
    result = validate_and_extract_pbr_zip(zip_bytes)
    assert set(result.keys()) == {"albedo.png", "normal.png", "roughness.png", "ao.png"}
    assert all(isinstance(v, bytes) for v in result.values())


def test_missing_map_raises_value_error():
    maps = _valid_maps()
    del maps["ao.png"]
    zip_bytes = _make_zip(maps)
    with pytest.raises(ValueError, match="Missing PBR maps"):
        validate_and_extract_pbr_zip(zip_bytes)


def test_low_resolution_raises_value_error():
    maps = _valid_maps(width=512, height=512)
    zip_bytes = _make_zip(maps)
    with pytest.raises(ValueError, match="at least 1024x1024"):
        validate_and_extract_pbr_zip(zip_bytes)


def test_invalid_zip_raises_value_error():
    with pytest.raises(ValueError, match="not a valid ZIP"):
        validate_and_extract_pbr_zip(b"this-is-not-a-zip")


def test_returns_bytes_for_each_map():
    zip_bytes = _make_zip(_valid_maps())
    result = validate_and_extract_pbr_zip(zip_bytes)
    # Verify each value is valid PNG bytes (starts with PNG magic bytes)
    for name, data in result.items():
        assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{name} is not a valid PNG"
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
cd /path/to/backend
pytest tests/test_pbr.py -v
```

Expected: `ImportError: cannot import name 'validate_and_extract_pbr_zip'`.

- [ ] **Step 3.3: Create backend/app/core/pbr.py**

```python
# backend/app/core/pbr.py
import io
import zipfile

from PIL import Image

REQUIRED_MAPS = {"albedo.png", "normal.png", "roughness.png", "ao.png"}
MIN_RESOLUTION = 1024


def validate_and_extract_pbr_zip(zip_bytes: bytes) -> dict:
    """
    Validate and extract PBR maps from a ZIP file.

    Returns a dict of {filename: raw_bytes} for all 4 required maps.
    Raises ValueError on missing maps, bad resolution, or invalid ZIP.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            # Normalise to lowercase filenames from ZIP
            name_map = {name.lower(): name for name in zf.namelist()}
            missing = REQUIRED_MAPS - set(name_map.keys())
            if missing:
                raise ValueError(f"Missing PBR maps: {', '.join(sorted(missing))}")

            result = {}
            for map_name in REQUIRED_MAPS:
                raw = zf.read(name_map[map_name])
                img = Image.open(io.BytesIO(raw))
                if img.width < MIN_RESOLUTION or img.height < MIN_RESOLUTION:
                    raise ValueError(
                        f"{map_name} must be at least {MIN_RESOLUTION}x{MIN_RESOLUTION},"
                        f" got {img.width}x{img.height}"
                    )
                result[map_name] = raw
            return result
    except zipfile.BadZipFile:
        raise ValueError("File is not a valid ZIP archive")
```

- [ ] **Step 3.4: Run PBR tests to verify they pass**

```bash
cd /path/to/backend
pytest tests/test_pbr.py -v
```

Expected: 5 passed.

- [ ] **Step 3.5: Run full suite**

```bash
cd /path/to/backend
pytest tests/ -q
```

Expected: 36 passed.

- [ ] **Step 3.6: Commit**

```bash
cd /path/to/backend
git add app/core/pbr.py tests/test_pbr.py
git commit -m "feat: add PBR ZIP validator with Pillow dimension checks"
```

---

### Task 4: Material Schemas + CRUD Endpoints (list, get, update)

**Files:**
- Create: `backend/app/schemas/material.py`
- Create: `backend/app/api/materials.py` (list, get, update only — upload is Task 5)
- Modify: `backend/app/api/router.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_materials.py`

- [ ] **Step 4.1: Write failing CRUD tests**

```python
# backend/tests/test_materials.py
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
async def test_get_other_tenant_material_returns_404(client):
    headers_a = await _register_and_login(client, "ta@example.com")
    headers_b = await _register_and_login(client, "tb@example.com")
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=headers_a)
    mat_id = r.json()["id"]

    # User B (different tenant, both have tenant_id=None in tests since no tenant created)
    # Both users have tenant_id=None, so they share access. Test cross-tenant isolation
    # by checking a non-existent ID instead.
    response = await client.get(
        "/materials/00000000-0000-0000-0000-000000000000", headers=headers_b
    )
    assert response.status_code == 404
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd /path/to/backend
pytest tests/test_materials.py -v
```

Expected: ImportError or 404 (materials router not registered).

- [ ] **Step 4.3: Create backend/app/schemas/material.py**

```python
# backend/app/schemas/material.py
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel


class MaterialCreate(BaseModel):
    category: str
    name: str
    sku: str
    thickness_options: List[int]
    price_per_m2: float
    edgebanding_price_per_mm: Optional[float] = None
    grain_direction: str = "none"
    tenant_id: Optional[UUID] = None


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    thickness_options: Optional[List[int]] = None
    price_per_m2: Optional[float] = None
    edgebanding_price_per_mm: Optional[float] = None
    grain_direction: Optional[str] = None


class MaterialResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    tenant_id: Optional[UUID]
    category: str
    name: str
    sku: str
    thickness_options: List[Any]
    price_per_m2: float
    edgebanding_price_per_mm: Optional[float]
    s3_albedo: Optional[str]
    s3_normal: Optional[str]
    s3_roughness: Optional[str]
    s3_ao: Optional[str]
    grain_direction: str
```

- [ ] **Step 4.4: Create backend/app/api/materials.py (CRUD only, no upload yet)**

```python
# backend/app/api/materials.py
import json
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.material import Material
from app.models.user import User
from app.schemas.material import MaterialCreate, MaterialResponse, MaterialUpdate

router = APIRouter()


def _check_tenant_access(material: Material, user: User) -> None:
    """Raise 404 if material is tenant-private and caller doesn't belong to that tenant."""
    if material.tenant_id is not None and material.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Material not found")


@router.get("", response_model=List[MaterialResponse])
async def list_materials(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Material).where(
        or_(Material.tenant_id.is_(None), Material.tenant_id == user.tenant_id)
    )
    if category:
        stmt = stmt.where(Material.category == category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def create_material(
    body: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = Material(
        category=body.category,
        name=body.name,
        sku=body.sku,
        thickness_options=body.thickness_options,
        price_per_m2=body.price_per_m2,
        edgebanding_price_per_mm=body.edgebanding_price_per_mm,
        grain_direction=body.grain_direction,
        tenant_id=body.tenant_id if user.role == "admin" else user.tenant_id,
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return mat


@router.get("/{mat_id}", response_model=MaterialResponse)
async def get_material(
    mat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)
    return mat


@router.put("/{mat_id}", response_model=MaterialResponse)
async def update_material(
    mat_id: UUID,
    body: MaterialUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(mat, field, value)

    await db.commit()
    await db.refresh(mat)
    return mat
```

- [ ] **Step 4.5: Update backend/app/api/router.py**

```python
# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth, configurations, furniture_types, materials, projects

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
```

- [ ] **Step 4.6: Update backend/tests/conftest.py to import Material**

Replace line 7 (the models import) with:

```python
from app.models import Tenant, User, Project, FurnitureType, Configuration, Material  # noqa: F401 — ensures all models are registered with Base
```

Also add the `s3_mock` fixture at the bottom of `conftest.py`:

```python
import boto3
from moto import mock_aws
from app.config import settings


@pytest.fixture
def s3_mock():
    """Provide a moto-mocked S3 environment with the configured bucket created."""
    with mock_aws():
        s3 = boto3.client(
            "s3",
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        s3.create_bucket(Bucket=settings.s3_bucket)
        yield s3
```

The full updated `backend/tests/conftest.py`:

```python
# backend/tests/conftest.py
import boto3
import pytest
from httpx import ASGITransport, AsyncClient
from moto import mock_aws
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.base import Base
from app.models import Tenant, User, Project, FurnitureType, Configuration, Material  # noqa: F401
from app.main import app
from app.core.deps import get_db

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        del app.dependency_overrides[get_db]


@pytest.fixture
def s3_mock():
    """Provide a moto-mocked S3 environment with the configured bucket created."""
    with mock_aws():
        s3 = boto3.client(
            "s3",
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        s3.create_bucket(Bucket=settings.s3_bucket)
        yield s3
```

- [ ] **Step 4.7: Run material CRUD tests**

```bash
cd /path/to/backend
pytest tests/test_materials.py -v
```

Expected: 7 passed.

- [ ] **Step 4.8: Run full suite**

```bash
cd /path/to/backend
pytest tests/ -q
```

Expected: 43 passed.

- [ ] **Step 4.9: Commit**

```bash
cd /path/to/backend
git add app/schemas/material.py app/api/materials.py app/api/router.py \
        tests/conftest.py tests/test_materials.py
git commit -m "feat: add Material schemas and CRUD endpoints (list, get, update)"
```

---

### Task 5: Material Upload Endpoint

**Files:**
- Modify: `backend/app/api/materials.py` (add `/upload` route)
- Modify: `backend/tests/test_materials.py` (add upload tests)

- [ ] **Step 5.1: Write failing upload tests**

Add these tests to the bottom of `backend/tests/test_materials.py`:

```python
import io
import zipfile
from PIL import Image


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
    mat_id = r.json()["id"]

    # Verify objects exist in S3 mock
    from app.config import settings as cfg
    objects = s3_mock.list_objects_v2(Bucket=cfg.s3_bucket, Prefix=f"materials/{mat_id}/")
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
```

- [ ] **Step 5.2: Run upload tests to verify they fail**

```bash
cd /path/to/backend
pytest tests/test_materials.py::test_upload_material_creates_record -v
```

Expected: 404 (route not registered yet).

- [ ] **Step 5.3: Add upload endpoint to backend/app/api/materials.py**

Add this import at the top (alongside existing imports):

```python
import json
import uuid as _uuid

from fastapi import File, Form, UploadFile

from app.core.pbr import validate_and_extract_pbr_zip
from app.core.storage import get_public_url, upload_bytes
```

Add this route to `backend/app/api/materials.py` **before** the `GET /{mat_id}` route (FastAPI matches routes top-to-bottom; `/upload` must come before `/{mat_id}` to avoid treating "upload" as a UUID):

```python
@router.post("/upload", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_material(
    name: str = Form(...),
    sku: str = Form(...),
    category: str = Form(...),
    price_per_m2: float = Form(...),
    thickness_options: str = Form(...),  # JSON string, e.g. "[16, 18, 22]"
    edgebanding_price_per_mm: Optional[float] = Form(None),
    grain_direction: str = Form("none"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    # Parse thickness_options JSON string
    try:
        thickness_list = json.loads(thickness_options)
        if not isinstance(thickness_list, list):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="thickness_options must be a JSON array of integers")

    # Read and validate ZIP
    zip_bytes = await file.read()
    try:
        pbr_maps = validate_and_extract_pbr_zip(zip_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Generate material ID for S3 key namespace
    mat_id = _uuid.uuid4()
    s3_urls = {}
    for map_name, data in pbr_maps.items():
        key = f"materials/{mat_id}/{map_name}"
        upload_bytes(key, data, content_type="image/png")
        s3_urls[map_name] = get_public_url(key)

    mat = Material(
        id=mat_id,
        category=category,
        name=name,
        sku=sku,
        thickness_options=thickness_list,
        price_per_m2=price_per_m2,
        edgebanding_price_per_mm=edgebanding_price_per_mm,
        grain_direction=grain_direction,
        tenant_id=user.tenant_id,
        s3_albedo=s3_urls.get("albedo.png"),
        s3_normal=s3_urls.get("normal.png"),
        s3_roughness=s3_urls.get("roughness.png"),
        s3_ao=s3_urls.get("ao.png"),
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return mat
```

The full `backend/app/api/materials.py` after this step:

```python
# backend/app/api/materials.py
import json
import uuid as _uuid
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.core.pbr import validate_and_extract_pbr_zip
from app.core.storage import get_public_url, upload_bytes
from app.models.material import Material
from app.models.user import User
from app.schemas.material import MaterialCreate, MaterialResponse, MaterialUpdate

router = APIRouter()


def _check_tenant_access(material: Material, user: User) -> None:
    """Raise 404 if material is tenant-private and caller doesn't belong to that tenant."""
    if material.tenant_id is not None and material.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Material not found")


@router.get("", response_model=List[MaterialResponse])
async def list_materials(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Material).where(
        or_(Material.tenant_id.is_(None), Material.tenant_id == user.tenant_id)
    )
    if category:
        stmt = stmt.where(Material.category == category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def create_material(
    body: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = Material(
        category=body.category,
        name=body.name,
        sku=body.sku,
        thickness_options=body.thickness_options,
        price_per_m2=body.price_per_m2,
        edgebanding_price_per_mm=body.edgebanding_price_per_mm,
        grain_direction=body.grain_direction,
        tenant_id=body.tenant_id if user.role == "admin" else user.tenant_id,
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return mat


@router.post("/upload", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_material(
    name: str = Form(...),
    sku: str = Form(...),
    category: str = Form(...),
    price_per_m2: float = Form(...),
    thickness_options: str = Form(...),
    edgebanding_price_per_mm: Optional[float] = Form(None),
    grain_direction: str = Form("none"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    try:
        thickness_list = json.loads(thickness_options)
        if not isinstance(thickness_list, list):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="thickness_options must be a JSON array of integers")

    zip_bytes = await file.read()
    try:
        pbr_maps = validate_and_extract_pbr_zip(zip_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    mat_id = _uuid.uuid4()
    s3_urls = {}
    for map_name, data in pbr_maps.items():
        key = f"materials/{mat_id}/{map_name}"
        upload_bytes(key, data, content_type="image/png")
        s3_urls[map_name] = get_public_url(key)

    mat = Material(
        id=mat_id,
        category=category,
        name=name,
        sku=sku,
        thickness_options=thickness_list,
        price_per_m2=price_per_m2,
        edgebanding_price_per_mm=edgebanding_price_per_mm,
        grain_direction=grain_direction,
        tenant_id=user.tenant_id,
        s3_albedo=s3_urls.get("albedo.png"),
        s3_normal=s3_urls.get("normal.png"),
        s3_roughness=s3_urls.get("roughness.png"),
        s3_ao=s3_urls.get("ao.png"),
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return mat


@router.get("/{mat_id}", response_model=MaterialResponse)
async def get_material(
    mat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)
    return mat


@router.put("/{mat_id}", response_model=MaterialResponse)
async def update_material(
    mat_id: UUID,
    body: MaterialUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(mat, field, value)

    await db.commit()
    await db.refresh(mat)
    return mat
```

- [ ] **Step 5.4: Run upload tests**

```bash
cd /path/to/backend
pytest tests/test_materials.py -v
```

Expected: all material tests pass (12 total).

- [ ] **Step 5.5: Run full suite**

```bash
cd /path/to/backend
pytest tests/ -q
```

Expected: 48 passed.

- [ ] **Step 5.6: Commit**

```bash
cd /path/to/backend
git add app/api/materials.py tests/test_materials.py
git commit -m "feat: add material upload endpoint with PBR ZIP validation and S3 storage"
```

---

### Task 6: Full Test Suite Smoke Test

**Files:** None (read-only verification)

- [ ] **Step 6.1: Run full test suite**

```bash
cd /path/to/backend
pytest tests/ -v
```

Expected: all tests pass across test_auth_core, test_auth, test_projects, test_furniture_types, test_configurations, test_storage, test_pbr, test_materials.

- [ ] **Step 6.2: Verify OpenAPI routes include /materials**

```bash
cd /path/to/backend
python -c "
from app.main import app
routes = [r.path for r in app.routes]
print('Routes:', routes)
assert any('/materials' in r for r in routes), 'Missing /materials routes'
print('OK')
"
```

Expected: `OK` printed, `/materials` routes visible.

- [ ] **Step 6.3: Final commit (if any uncommitted changes)**

If there are uncommitted changes:

```bash
cd /path/to/backend
git add .
git commit -m "feat: complete material system — catalog CRUD, PBR ZIP upload, S3 storage"
```

---

## What's Next

| Plan | Subsystem |
|---|---|
| **Plan 3** | Frontend + Room Planner — Next.js 15, Babylon.js SceneProvider, 2D canvas → 3D scene |
| **Plan 4** | Furniture Configurator — FurnitureSchema compiler, ParametricBuilder, CSG, hardware |
| **Plan 5** | Production Pipeline — Pricing Engine, BOM Engine, DXF/PDF/SVG export |
| **Plan 6** | ERP/CRM Integration — webhook dispatcher, Bitrix24, 1C |
