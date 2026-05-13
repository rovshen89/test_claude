# Pricing Engine & BOM Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Pricing Engine (`POST /pricing/calculate`) and BOM Engine (`POST /bom/generate`) that compute furniture costs and cut lists from a saved Configuration's `applied_config` JSON.

**Architecture:** Two pure-function computation modules (`app/core/pricing.py`, `app/core/bom.py`) consume a shared `AppliedConfig` Pydantic schema parsed from `configurations.applied_config` JSONB. REST endpoints load the DB records, call the pure functions, and return structured responses. No new DB tables or migrations required — all data lives in existing columns.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2 (Decimal + field_serializer), Python 3.9, pytest-asyncio.

---

## Background: Key Existing Facts

- `configurations.applied_config` is a JSONB dict. This plan defines its schema via Pydantic for the first time.
- `furniture_types.schema` (JSONB dict) may contain a `"labor_rate"` key (string-encoded Decimal). Default `"0"` if absent.
- `tenants.margin_pct` is `Numeric(5,2)`, already on the Tenant model. Users registered without a `tenant_id` have `user.tenant_id = None`; treat as 0% margin.
- `materials.price_per_m2` and `materials.edgebanding_price_per_mm` are `Numeric(10,2)` → SQLAlchemy returns `Decimal`.
- Only `admin` and `manufacturer` roles can create materials and furniture types. Any authenticated user can create projects and configurations.
- All tests run against SQLite in-memory; no PostgreSQL needed.
- Working directory: `/Users/rovshennurybayev/claude_agents/backend`
- Run tests: `python3 -m pytest tests/ -v`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/schemas/applied_config.py` | Create | Shared types: `EdgeBanding`, `PanelSpec`, `HardwareItem`, `AppliedConfig` |
| `backend/app/schemas/pricing.py` | Create | `PricingRequest`, `PanelPricingRow`, `PricingResponse` |
| `backend/app/core/pricing.py` | Create | `MaterialPricing` dataclass + `calculate_pricing()` pure function |
| `backend/app/schemas/bom.py` | Create | `BomRequest`, `BomPanelRow`, `BomHardwareRow`, `BomResponse` |
| `backend/app/core/bom.py` | Create | `MaterialInfo` dataclass + `generate_bom()` pure function |
| `backend/app/api/pricing.py` | Create | `POST /pricing/calculate` endpoint |
| `backend/app/api/bom.py` | Create | `POST /bom/generate` endpoint |
| `backend/app/api/router.py` | Modify | Register pricing and bom routers |
| `backend/tests/test_pricing_core.py` | Create | Unit tests for `calculate_pricing()` |
| `backend/tests/test_pricing_api.py` | Create | Integration tests for the pricing endpoint |
| `backend/tests/test_bom.py` | Create | Unit + integration tests for the BOM engine and endpoint |

---

## Task 1: AppliedConfig Schema + Pricing Pure Function

**Files:**
- Create: `backend/app/schemas/applied_config.py`
- Create: `backend/app/schemas/pricing.py`
- Create: `backend/app/core/pricing.py`
- Create: `backend/tests/test_pricing_core.py`

**Context:** These are pure Python — no DB, no HTTP. `calculate_pricing()` accepts parsed config + a `Dict[UUID, MaterialPricing]` dict + scalar rates. It returns a `PricingResponse` with per-panel breakdown. Use `Decimal` arithmetic throughout to preserve precision. `sum(..., Decimal("0"))` is the correct identity for Decimal sums over an empty iterator (plain `sum()` returns `int(0)`).

- [x] **Step 1: Write the failing unit tests**

Create `backend/tests/test_pricing_core.py`:

```python
# backend/tests/test_pricing_core.py
import pytest
from decimal import Decimal
from uuid import uuid4

from app.core.pricing import MaterialPricing, calculate_pricing
from app.schemas.applied_config import AppliedConfig, EdgeBanding, HardwareItem, PanelSpec


def _make_config(mat_id, with_edge=False, with_hardware=False) -> AppliedConfig:
    edge = EdgeBanding(top=True, bottom=True) if with_edge else EdgeBanding()
    hardware = (
        [HardwareItem(name="Hinge", unit_price=Decimal("0.50"), quantity=4)]
        if with_hardware
        else []
    )
    return AppliedConfig(
        dimensions={"width": 1200, "height": 2100, "depth": 600},
        panels=[
            PanelSpec(
                name="Side",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=580,
                height_mm=2100,
                quantity=2,
                edge_banding=edge,
            )
        ],
        hardware_list=hardware,
    )


def test_panel_cost_no_edge():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    # area = 0.580 * 2.100 * 2 = 2.436 m²; cost = 24.36
    assert float(result.panel_cost) == pytest.approx(24.36, rel=1e-3)
    assert float(result.edge_cost) == pytest.approx(0.0, abs=1e-9)
    assert float(result.hardware_cost) == pytest.approx(0.0, abs=1e-9)
    assert float(result.labor_cost) == pytest.approx(0.0, abs=1e-9)
    assert float(result.total) == pytest.approx(24.36, rel=1e-3)


def test_edge_banding_cost():
    mat_id = uuid4()
    config = _make_config(mat_id, with_edge=True)
    materials = {
        mat_id: MaterialPricing(
            price_per_m2=Decimal("10.00"),
            edgebanding_price_per_mm=Decimal("0.003"),
        )
    }
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    # top(580) + bottom(580) = 1160mm per panel × 2 qty = 2320mm × 0.003 = 6.96
    assert float(result.edge_cost) == pytest.approx(6.96, rel=1e-3)


def test_hardware_cost():
    mat_id = uuid4()
    config = _make_config(mat_id, with_hardware=True)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    # 0.50 × 4 = 2.00
    assert float(result.hardware_cost) == pytest.approx(2.00, rel=1e-3)


def test_labor_cost():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("2.50"), margin_pct=Decimal("0"))
    # 2.50 × len(panels)=1 = 2.50
    assert float(result.labor_cost) == pytest.approx(2.50, rel=1e-3)


def test_margin_applied_to_total():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("20"))
    # panel_cost=24.36, subtotal=24.36, total = 24.36 × 1.20 = 29.232
    assert float(result.subtotal) == pytest.approx(24.36, rel=1e-3)
    assert float(result.total) == pytest.approx(29.232, rel=1e-3)


def test_breakdown_has_one_row_per_panel_spec():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialPricing(price_per_m2=Decimal("10.00"), edgebanding_price_per_mm=None)}
    result = calculate_pricing(config, materials, labor_rate=Decimal("0"), margin_pct=Decimal("0"))
    assert len(result.breakdown) == 1
    assert result.breakdown[0].name == "Side"
    # area_m2 in breakdown accounts for quantity: 2.436
    assert float(result.breakdown[0].area_m2) == pytest.approx(2.436, rel=1e-3)
```

- [x] **Step 2: Run to verify they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend
python3 -m pytest tests/test_pricing_core.py -v
```

Expected: `ImportError` — `app.core.pricing` does not exist yet.

- [x] **Step 3: Create `backend/app/schemas/applied_config.py`**

```python
# backend/app/schemas/applied_config.py
from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel


class EdgeBanding(BaseModel):
    left: bool = False
    right: bool = False
    top: bool = False
    bottom: bool = False

    def banded_perimeter_mm(self, width_mm: int, height_mm: int) -> int:
        total = 0
        if self.left:
            total += height_mm
        if self.right:
            total += height_mm
        if self.top:
            total += width_mm
        if self.bottom:
            total += width_mm
        return total


class PanelSpec(BaseModel):
    name: str
    material_id: UUID
    thickness_mm: int
    width_mm: int
    height_mm: int
    quantity: int
    grain_direction: str = "none"
    edge_banding: EdgeBanding = EdgeBanding()


class HardwareItem(BaseModel):
    name: str
    unit_price: Decimal
    quantity: int


class AppliedConfig(BaseModel):
    dimensions: dict
    panels: List[PanelSpec]
    hardware_list: List[HardwareItem] = []
```

- [x] **Step 4: Create `backend/app/schemas/pricing.py`**

```python
# backend/app/schemas/pricing.py
from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel, field_serializer


class PricingRequest(BaseModel):
    configuration_id: UUID


class PanelPricingRow(BaseModel):
    name: str
    area_m2: Decimal
    panel_cost: Decimal
    edge_cost: Decimal

    @field_serializer("area_m2", "panel_cost", "edge_cost")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)


class PricingResponse(BaseModel):
    panel_cost: Decimal
    edge_cost: Decimal
    hardware_cost: Decimal
    labor_cost: Decimal
    subtotal: Decimal
    total: Decimal
    breakdown: List[PanelPricingRow]

    @field_serializer("panel_cost", "edge_cost", "hardware_cost", "labor_cost", "subtotal", "total")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)
```

- [x] **Step 5: Create `backend/app/core/pricing.py`**

```python
# backend/app/core/pricing.py
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Optional
from uuid import UUID

from app.schemas.applied_config import AppliedConfig
from app.schemas.pricing import PanelPricingRow, PricingResponse


@dataclass
class MaterialPricing:
    price_per_m2: Decimal
    edgebanding_price_per_mm: Optional[Decimal]


def calculate_pricing(
    config: AppliedConfig,
    materials: Dict[UUID, MaterialPricing],
    labor_rate: Decimal,
    margin_pct: Decimal,
) -> PricingResponse:
    panel_rows = []
    total_panel_cost = Decimal("0")
    total_edge_cost = Decimal("0")

    for panel in config.panels:
        mat = materials[panel.material_id]
        area_m2 = (
            Decimal(str(panel.width_mm)) * Decimal(str(panel.height_mm)) / Decimal("1000000")
        )
        panel_cost = area_m2 * mat.price_per_m2 * panel.quantity

        banded_mm = panel.edge_banding.banded_perimeter_mm(panel.width_mm, panel.height_mm)
        edge_cost = Decimal("0")
        if mat.edgebanding_price_per_mm and banded_mm > 0:
            edge_cost = Decimal(str(banded_mm)) * mat.edgebanding_price_per_mm * panel.quantity

        panel_rows.append(
            PanelPricingRow(
                name=panel.name,
                area_m2=area_m2 * panel.quantity,
                panel_cost=panel_cost,
                edge_cost=edge_cost,
            )
        )
        total_panel_cost += panel_cost
        total_edge_cost += edge_cost

    hardware_cost = sum(
        (item.unit_price * item.quantity for item in config.hardware_list),
        Decimal("0"),
    )
    labor_cost = labor_rate * len(config.panels)
    subtotal = total_panel_cost + total_edge_cost + hardware_cost + labor_cost
    total = subtotal * (1 + margin_pct / Decimal("100"))

    return PricingResponse(
        panel_cost=total_panel_cost,
        edge_cost=total_edge_cost,
        hardware_cost=hardware_cost,
        labor_cost=labor_cost,
        subtotal=subtotal,
        total=total,
        breakdown=panel_rows,
    )
```

- [x] **Step 6: Run tests — expect PASS**

```bash
python3 -m pytest tests/test_pricing_core.py -v
```

Expected: `6 passed`

- [x] **Step 7: Commit**

```bash
git add app/schemas/applied_config.py app/schemas/pricing.py app/core/pricing.py tests/test_pricing_core.py
git commit -m "feat: add AppliedConfig schema and Pricing Engine pure function"
```

---

## Task 2: Pricing REST Endpoint

**Files:**
- Create: `backend/app/api/pricing.py`
- Create: `backend/tests/test_pricing_api.py`
- Modify: `backend/app/api/router.py`

**Context:** `POST /pricing/calculate` verifies project ownership the same way `GET /configurations/{id}` does: load project, check `project.user_id == user.id` (admin bypasses). `user.tenant_id` may be `None` — skip the tenant lookup and use `margin_pct = Decimal("0")`. `furniture_type.schema.get("labor_rate", "0")` is a string stored in JSON; wrap in `Decimal(str(...))` for precision. The test setup user must be a **manufacturer** (required by `POST /materials` and `POST /furniture-types`).

- [x] **Step 1: Write the failing integration tests**

Create `backend/tests/test_pricing_api.py`:

```python
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
async def test_pricing_unauthenticated_returns_403(client):
    r = await client.post(
        "/pricing/calculate",
        json={"configuration_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert r.status_code == 403
```

- [x] **Step 2: Run to verify they fail**

```bash
python3 -m pytest tests/test_pricing_api.py -v
```

Expected: tests fail — `POST /pricing/calculate` returns 404 (route not registered yet).

- [x] **Step 3: Create `backend/app/api/pricing.py`**

```python
# backend/app/api/pricing.py
from decimal import Decimal
from typing import Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.pricing import MaterialPricing, calculate_pricing
from app.models.configuration import Configuration
from app.models.furniture_type import FurnitureType
from app.models.material import Material
from app.models.project import Project
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.applied_config import AppliedConfig
from app.schemas.pricing import PricingRequest, PricingResponse

router = APIRouter()


@router.post("/calculate", response_model=PricingResponse)
async def calculate_price(
    body: PricingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await db.get(Configuration, body.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = await db.get(Project, cfg.project_id)
    if not project or (project.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Configuration not found")

    margin_pct = Decimal("0")
    if user.tenant_id:
        tenant = await db.get(Tenant, user.tenant_id)
        if tenant:
            margin_pct = tenant.margin_pct

    ft = await db.get(FurnitureType, cfg.furniture_type_id)
    labor_rate = Decimal(str(ft.schema.get("labor_rate", "0")))

    try:
        applied = AppliedConfig.model_validate(cfg.applied_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    material_ids = {p.material_id for p in applied.panels}
    materials: Dict[UUID, MaterialPricing] = {}
    for mid in material_ids:
        mat = await db.get(Material, mid)
        if not mat:
            raise HTTPException(status_code=422, detail=f"Material {mid} not found")
        materials[mid] = MaterialPricing(
            price_per_m2=mat.price_per_m2,
            edgebanding_price_per_mm=mat.edgebanding_price_per_mm,
        )

    return calculate_pricing(applied, materials, labor_rate, margin_pct)
```

- [x] **Step 4: Add pricing router to `backend/app/api/router.py`**

```python
# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth, configurations, furniture_types, materials, pricing, projects

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(pricing.router, prefix="/pricing", tags=["pricing"])
```

- [x] **Step 5: Run tests — expect PASS**

```bash
python3 -m pytest tests/test_pricing_api.py tests/test_pricing_core.py -v
```

Expected: `10 passed`

- [x] **Step 6: Commit**

```bash
git add app/api/pricing.py app/api/router.py tests/test_pricing_api.py
git commit -m "feat: add POST /pricing/calculate endpoint"
```

---

## Task 3: BOM Engine + Endpoint

**Files:**
- Create: `backend/app/schemas/bom.py`
- Create: `backend/app/core/bom.py`
- Create: `backend/app/api/bom.py`
- Create: `backend/tests/test_bom.py`
- Modify: `backend/app/api/router.py` (add bom router, keeping pricing)

**Context:** BOM needs only material `name` and `sku` — no pricing data. `BomResponse` has one `BomPanelRow` per `PanelSpec`, `total_panels` = sum of quantities (total physical boards), and `total_area_m2` = sum of (width × height × qty / 1,000,000). The endpoint mirrors pricing's ownership check. `test_bom.py` contains both pure unit tests (no `client` fixture) and async integration tests marked with `@pytest.mark.asyncio`.

- [x] **Step 1: Write the failing tests**

Create `backend/tests/test_bom.py`:

```python
# backend/tests/test_bom.py
import pytest
from decimal import Decimal
from uuid import uuid4

from app.core.bom import MaterialInfo, generate_bom
from app.schemas.applied_config import AppliedConfig, EdgeBanding, HardwareItem, PanelSpec


def _make_config(mat_id) -> AppliedConfig:
    return AppliedConfig(
        dimensions={"width": 1200, "height": 2100, "depth": 600},
        panels=[
            PanelSpec(
                name="Side",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=580,
                height_mm=2100,
                quantity=2,
                grain_direction="vertical",
                edge_banding=EdgeBanding(top=True, bottom=True),
            ),
            PanelSpec(
                name="Shelf",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=544,
                height_mm=400,
                quantity=6,
                edge_banding=EdgeBanding(left=True, right=True),
            ),
        ],
        hardware_list=[HardwareItem(name="Hinge", unit_price=Decimal("0.50"), quantity=4)],
    )


def test_bom_panel_rows():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    assert len(result.panels) == 2
    side = result.panels[0]
    assert side.name == "Side"
    assert side.quantity == 2
    assert side.material_name == "Oak Laminate"
    assert side.material_sku == "OAK-18"
    assert side.thickness_mm == 18
    assert side.width_mm == 580
    assert side.height_mm == 2100
    assert side.grain_direction == "vertical"
    assert side.edge_top is True
    assert side.edge_bottom is True
    assert side.edge_left is False
    assert side.edge_right is False


def test_bom_total_panels():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    # 2 sides + 6 shelves = 8 total physical pieces
    assert result.total_panels == 8


def test_bom_total_area():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    # Sides: 0.580 × 2.100 × 2 = 2.436
    # Shelves: 0.544 × 0.400 × 6 = 1.3056
    # Total = 3.7416
    assert float(result.total_area_m2) == pytest.approx(3.7416, rel=1e-3)


def test_bom_hardware_rows():
    mat_id = uuid4()
    config = _make_config(mat_id)
    materials = {mat_id: MaterialInfo(name="Oak Laminate", sku="OAK-18")}
    result = generate_bom(config, materials)
    assert len(result.hardware) == 1
    assert result.hardware[0].name == "Hinge"
    assert result.hardware[0].quantity == 4
    assert float(result.hardware[0].unit_price) == pytest.approx(0.50, rel=1e-3)
    # total_price = 0.50 × 4 = 2.00
    assert float(result.hardware[0].total_price) == pytest.approx(2.00, rel=1e-3)


def test_bom_empty_hardware():
    mat_id = uuid4()
    config = AppliedConfig(
        dimensions={"width": 600, "height": 800, "depth": 300},
        panels=[
            PanelSpec(
                name="Top",
                material_id=mat_id,
                thickness_mm=18,
                width_mm=600,
                height_mm=300,
                quantity=1,
            )
        ],
        hardware_list=[],
    )
    materials = {mat_id: MaterialInfo(name="MDF", sku="MDF-18")}
    result = generate_bom(config, materials)
    assert result.hardware == []
    assert result.total_panels == 1


# ── Integration tests ────────────────────────────────────────────────────────


async def _register_and_login(client, email: str, role: str = "consumer") -> dict:
    await client.post(
        "/auth/register",
        json={"email": email, "password": "password", "role": role},
    )
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _setup_bom_fixture(client, email: str):
    headers = await _register_and_login(client, email, role="manufacturer")

    mat_r = await client.post(
        "/materials",
        json={
            "category": "laminate",
            "name": "Oak Laminate",
            "sku": "OAK-18",
            "thickness_options": [18],
            "price_per_m2": 10.00,
            "grain_direction": "none",
        },
        headers=headers,
    )
    assert mat_r.status_code == 201, mat_r.text
    mat_id = mat_r.json()["id"]

    ft_r = await client.post(
        "/furniture-types",
        json={"category": "shelving", "schema": {"labor_rate": "0"}},
        headers=headers,
    )
    assert ft_r.status_code == 201, ft_r.text
    ft_id = ft_r.json()["id"]

    proj_r = await client.post("/projects", json={"name": "Room"}, headers=headers)
    assert proj_r.status_code == 201, proj_r.text
    proj_id = proj_r.json()["id"]

    applied_config = {
        "dimensions": {"width": 600, "height": 800, "depth": 300},
        "panels": [
            {
                "name": "Shelf",
                "material_id": mat_id,
                "thickness_mm": 18,
                "width_mm": 544,
                "height_mm": 300,
                "quantity": 3,
                "grain_direction": "none",
                "edge_banding": {
                    "left": True,
                    "right": True,
                    "top": False,
                    "bottom": False,
                },
            }
        ],
        "hardware_list": [],
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
async def test_bom_generate_returns_cut_list(client):
    headers, cfg_id, _ = await _setup_bom_fixture(client, "bom1@example.com")
    r = await client.post("/bom/generate", json={"configuration_id": cfg_id}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["panels"]) == 1
    panel = data["panels"][0]
    assert panel["name"] == "Shelf"
    assert panel["quantity"] == 3
    assert panel["material_name"] == "Oak Laminate"
    assert panel["material_sku"] == "OAK-18"
    assert panel["edge_left"] is True
    assert panel["edge_right"] is True
    assert panel["edge_top"] is False
    assert data["total_panels"] == 3
    # area = 0.544 × 0.300 × 3 = 0.4896
    assert data["total_area_m2"] == pytest.approx(0.4896, rel=1e-3)
    assert data["hardware"] == []


@pytest.mark.asyncio
async def test_bom_nonexistent_config_returns_404(client):
    headers = await _register_and_login(client, "bom2@example.com")
    r = await client.post(
        "/bom/generate",
        json={"configuration_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_bom_other_users_config_returns_404(client):
    headers1, cfg_id, _ = await _setup_bom_fixture(client, "bom3a@example.com")
    headers2 = await _register_and_login(client, "bom3b@example.com")
    r = await client.post(
        "/bom/generate", json={"configuration_id": cfg_id}, headers=headers2
    )
    assert r.status_code == 404
```

- [x] **Step 2: Run to verify they fail**

```bash
python3 -m pytest tests/test_bom.py -v
```

Expected: `ImportError` — `app.core.bom` does not exist yet. (The 5 pure unit tests will fail on import; 3 integration tests will fail on missing route.)

- [x] **Step 3: Create `backend/app/schemas/bom.py`**

```python
# backend/app/schemas/bom.py
from decimal import Decimal
from typing import List
from uuid import UUID

from pydantic import BaseModel, field_serializer


class BomRequest(BaseModel):
    configuration_id: UUID


class BomPanelRow(BaseModel):
    name: str
    material_name: str
    material_sku: str
    thickness_mm: int
    width_mm: int
    height_mm: int
    quantity: int
    grain_direction: str
    edge_left: bool
    edge_right: bool
    edge_top: bool
    edge_bottom: bool
    area_m2: Decimal  # total area for all qty combined

    @field_serializer("area_m2")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)


class BomHardwareRow(BaseModel):
    name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal

    @field_serializer("unit_price", "total_price")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)


class BomResponse(BaseModel):
    panels: List[BomPanelRow]
    hardware: List[BomHardwareRow]
    total_panels: int
    total_area_m2: Decimal

    @field_serializer("total_area_m2")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)
```

- [x] **Step 4: Create `backend/app/core/bom.py`**

```python
# backend/app/core/bom.py
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict
from uuid import UUID

from app.schemas.applied_config import AppliedConfig
from app.schemas.bom import BomHardwareRow, BomPanelRow, BomResponse


@dataclass
class MaterialInfo:
    name: str
    sku: str


def generate_bom(
    config: AppliedConfig,
    materials: Dict[UUID, MaterialInfo],
) -> BomResponse:
    panel_rows = []
    total_area = Decimal("0")

    for panel in config.panels:
        mat = materials[panel.material_id]
        area_m2 = (
            Decimal(str(panel.width_mm)) * Decimal(str(panel.height_mm)) / Decimal("1000000")
        ) * panel.quantity
        total_area += area_m2
        panel_rows.append(
            BomPanelRow(
                name=panel.name,
                material_name=mat.name,
                material_sku=mat.sku,
                thickness_mm=panel.thickness_mm,
                width_mm=panel.width_mm,
                height_mm=panel.height_mm,
                quantity=panel.quantity,
                grain_direction=panel.grain_direction,
                edge_left=panel.edge_banding.left,
                edge_right=panel.edge_banding.right,
                edge_top=panel.edge_banding.top,
                edge_bottom=panel.edge_banding.bottom,
                area_m2=area_m2,
            )
        )

    hardware_rows = [
        BomHardwareRow(
            name=item.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_price=item.unit_price * item.quantity,
        )
        for item in config.hardware_list
    ]

    return BomResponse(
        panels=panel_rows,
        hardware=hardware_rows,
        total_panels=sum(p.quantity for p in config.panels),
        total_area_m2=total_area,
    )
```

- [x] **Step 5: Create `backend/app/api/bom.py`**

```python
# backend/app/api/bom.py
from typing import Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bom import MaterialInfo, generate_bom
from app.core.deps import get_current_user, get_db
from app.models.configuration import Configuration
from app.models.material import Material
from app.models.project import Project
from app.models.user import User
from app.schemas.applied_config import AppliedConfig
from app.schemas.bom import BomRequest, BomResponse

router = APIRouter()


@router.post("/generate", response_model=BomResponse)
async def generate_bom_endpoint(
    body: BomRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await db.get(Configuration, body.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = await db.get(Project, cfg.project_id)
    if not project or (project.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Configuration not found")

    try:
        applied = AppliedConfig.model_validate(cfg.applied_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    material_ids = {p.material_id for p in applied.panels}
    materials: Dict[UUID, MaterialInfo] = {}
    for mid in material_ids:
        mat = await db.get(Material, mid)
        if not mat:
            raise HTTPException(status_code=422, detail=f"Material {mid} not found")
        materials[mid] = MaterialInfo(name=mat.name, sku=mat.sku)

    return generate_bom(applied, materials)
```

- [x] **Step 6: Update `backend/app/api/router.py` to add bom router**

```python
# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth, bom, configurations, furniture_types, materials, pricing, projects

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(pricing.router, prefix="/pricing", tags=["pricing"])
api_router.include_router(bom.router, prefix="/bom", tags=["bom"])
```

- [x] **Step 7: Run all BOM tests — expect PASS**

```bash
python3 -m pytest tests/test_bom.py -v
```

Expected: `8 passed`

- [x] **Step 8: Commit**

```bash
git add app/schemas/bom.py app/core/bom.py app/api/bom.py app/api/router.py tests/test_bom.py
git commit -m "feat: add BOM Engine and POST /bom/generate endpoint"
```

---

## Task 4: Full Test Suite Smoke Test

**Files:** No new files — verification only.

**Context:** Confirm all existing tests (52) plus the new pricing (10) and BOM (8) tests all pass together. No new DB tables or migrations were added in this plan — the `applied_config` schema is purely a Pydantic layer over the existing JSONB column.

- [x] **Step 1: Run the full suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend
python3 -m pytest tests/ -v
```

Expected: `70 passed` (52 existing + 6 pricing core + 4 pricing API + 5 BOM unit + 3 BOM API). Zero failures.

- [x] **Step 2: If any tests fail, check these common causes**

- `sum()` over an empty generator returns `int(0)`, not `Decimal("0")` — fix: `sum(..., Decimal("0"))`
- `ValidationError` not imported from `pydantic` in endpoint — add `from pydantic import ValidationError`
- Import cycle: if `app.api.router` imports `bom` before `bom.py` exists — verify file was created
- `labor_rate` from JSONB: `ft.schema.get("labor_rate", "0")` returns a string; `Decimal(str(...))` handles both string and numeric JSON values

- [x] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test suite issues after pricing and BOM integration"
```
