# Orders & Export Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Order model with synchronous DXF + PDF export generation: `POST /configurations/{id}/confirm` transitions status, `POST /orders` creates an order with BOM/Pricing snapshots and S3-uploaded export files.

**Architecture:** Pure function export engines (`export_dxf.py`, `export_pdf.py`) follow the same pattern as existing `pricing.py`/`bom.py`. The `POST /orders` endpoint orchestrates: run BOM + Pricing → generate DXF + PDF bytes → upload to S3 → persist Order record. No new background workers; everything is synchronous.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, ezdxf≥1.3, WeasyPrint≥62, boto3/moto, pytest-asyncio, SQLite in-memory for tests.

---

## Background: Key Existing Facts

- Working directory for all commands: `/Users/rovshennurybayev/claude_agents/backend`
- Run tests: `python3 -m pytest tests/ -v`
- `configurations.py` already has `POST /{config_id}/confirm` (lines 88–107) but returns HTTP 400 — must be changed to 409 per spec.
- `app/core/storage.py` has `upload_bytes(key, data, content_type) -> str` and `get_public_url(key) -> str`. Call via `await asyncio.to_thread(upload_bytes, ...)` (same as materials upload).
- `app/schemas/bom.py` → `BomResponse`, `BomPanelRow`, `BomHardwareRow`. `BomPanelRow` has: `name`, `material_sku`, `thickness_mm`, `width_mm`, `height_mm`, `quantity`, `grain_direction`, `edge_left/right/top/bottom`, `area_m2`.
- `app/schemas/pricing.py` → `PricingResponse` with fields: `panel_cost`, `edge_cost`, `hardware_cost`, `labor_cost`, `subtotal`, `total`, `breakdown`.
- `app/core/bom.py` → `generate_bom(config: AppliedConfig, materials: Dict[UUID, MaterialInfo]) -> BomResponse`
- `app/core/pricing.py` → `calculate_pricing(config, materials, labor_rate, margin_pct) -> PricingResponse`
- `tests/conftest.py` imports models by name for `Base.metadata.create_all` — must add `Order` import.
- `model_dump(mode='json')` must be used when serialising `PricingResponse`/`BomResponse` to JSONB snapshots (converts `Decimal` → `float` via `field_serializer`).
- SQLite in-memory is used for tests; no PostgreSQL needed.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/requirements.txt` | Modify | Add ezdxf, weasyprint |
| `backend/app/models/order.py` | Create | Order SQLAlchemy model |
| `backend/alembic/versions/004_create_orders.py` | Create | orders table migration |
| `backend/app/schemas/order.py` | Create | OrderCreate, OrderResponse |
| `backend/app/models/__init__.py` | Modify | Export Order |
| `backend/tests/conftest.py` | Modify | Import Order for table creation |
| `backend/app/core/export_dxf.py` | Create | `generate_dxf(bom) -> bytes` |
| `backend/app/core/export_pdf.py` | Create | `generate_pdf(bom, pricing) -> bytes` |
| `backend/app/api/configurations.py` | Modify | Fix confirm endpoint: 400 → 409 |
| `backend/app/api/orders.py` | Create | POST/GET /orders endpoints |
| `backend/app/api/router.py` | Modify | Register orders router |
| `backend/tests/test_export_dxf.py` | Create | Unit tests for DXF generation |
| `backend/tests/test_export_pdf.py` | Create | Unit tests for PDF generation |
| `backend/tests/test_orders.py` | Create | Integration tests for orders API |

---

## Task 1: Foundations — Dependencies, Order Model, Migration, Schemas

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/models/order.py`
- Create: `backend/alembic/versions/004_create_orders.py`
- Create: `backend/app/schemas/order.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Add ezdxf and weasyprint to requirements.txt**

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
ezdxf>=1.3
weasyprint>=62
```

- [ ] **Step 2: Install new dependencies**

```bash
pip install ezdxf "weasyprint>=62"
```

Expected: both packages install without error. On macOS, WeasyPrint≥62 bundles its system libraries so no separate brew install is needed.

- [ ] **Step 3: Create the Order model**

Create `backend/app/models/order.py`:

```python
# backend/app/models/order.py
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, JSON, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("configuration_id", name="uq_orders_configuration_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    configuration_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("configurations.id"), unique=True
    )
    pricing_snapshot: Mapped[dict] = mapped_column(JSON)
    bom_snapshot: Mapped[dict] = mapped_column(JSON)
    export_urls: Mapped[dict] = mapped_column(JSON, default=dict)
    crm_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
```

- [ ] **Step 4: Create the Alembic migration**

Create `backend/alembic/versions/004_create_orders.py`:

```python
"""create orders

Revision ID: 004
Revises: 003
Create Date: 2026-04-10

"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "configuration_id",
            sa.Uuid(),
            sa.ForeignKey("configurations.id"),
            nullable=False,
        ),
        sa.Column("pricing_snapshot", sa.JSON(), nullable=False),
        sa.Column("bom_snapshot", sa.JSON(), nullable=False),
        sa.Column("export_urls", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("crm_ref", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("configuration_id", name="uq_orders_configuration_id"),
    )


def downgrade() -> None:
    op.drop_table("orders")
```

- [ ] **Step 5: Create order schemas**

Create `backend/app/schemas/order.py`:

```python
# backend/app/schemas/order.py
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class OrderCreate(BaseModel):
    configuration_id: UUID


class OrderResponse(BaseModel):
    id: UUID
    configuration_id: UUID
    pricing_snapshot: dict
    bom_snapshot: dict
    export_urls: dict
    crm_ref: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 6: Export Order from app/models/__init__.py**

Replace `backend/app/models/__init__.py` with:

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.project import Project  # noqa: F401
from app.models.furniture_type import FurnitureType  # noqa: F401
from app.models.configuration import Configuration  # noqa: F401
from app.models.material import Material  # noqa: F401
from app.models.order import Order  # noqa: F401
```

- [ ] **Step 7: Add Order to conftest imports**

Edit `backend/tests/conftest.py` line 10. Change:

```python
from app.models import Tenant, User, Project, FurnitureType, Configuration, Material  # noqa: F401
```

to:

```python
from app.models import Tenant, User, Project, FurnitureType, Configuration, Material, Order  # noqa: F401
```

- [ ] **Step 8: Run existing tests to verify nothing broke**

```bash
python3 -m pytest tests/ -v
```

Expected: 70 passed (same as before). The `orders` table is now created by `Base.metadata.create_all` in the conftest fixture.

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/app/models/order.py \
  backend/alembic/versions/004_create_orders.py backend/app/schemas/order.py \
  backend/app/models/__init__.py backend/tests/conftest.py
git commit -m "feat: add Order model, migration, schemas, and export dependencies"
```

---

## Task 2: DXF Export Engine

**Files:**
- Create: `backend/tests/test_export_dxf.py`
- Create: `backend/app/core/export_dxf.py`

- [ ] **Step 1: Write the failing DXF tests**

Create `backend/tests/test_export_dxf.py`:

```python
# backend/tests/test_export_dxf.py
import io
from decimal import Decimal

import pytest

from app.schemas.bom import BomPanelRow, BomResponse
from app.core.export_dxf import generate_dxf


def _make_panel(
    name: str = "Side",
    width: int = 580,
    height: int = 2100,
    qty: int = 1,
    grain: str = "none",
) -> BomPanelRow:
    area = Decimal(str(width)) * Decimal(str(height)) / Decimal("1000000") * qty
    return BomPanelRow(
        name=name,
        material_name="Oak",
        material_sku="OAK-18",
        thickness_mm=18,
        width_mm=width,
        height_mm=height,
        quantity=qty,
        grain_direction=grain,
        edge_left=False,
        edge_right=False,
        edge_top=False,
        edge_bottom=False,
        area_m2=area,
    )


def _make_bom(*panels: BomPanelRow) -> BomResponse:
    panel_list = list(panels)
    return BomResponse(
        panels=panel_list,
        hardware=[],
        total_panels=sum(p.quantity for p in panel_list),
        total_area_m2=sum((p.area_m2 for p in panel_list), Decimal("0")),
    )


def _parse_dxf(dxf_bytes: bytes):
    import ezdxf

    return ezdxf.read(io.StringIO(dxf_bytes.decode("utf-8")))


def test_dxf_panel_count():
    """BOM with 3 panels produces 3 closed LWPOLYLINE rectangles."""
    bom = _make_bom(_make_panel("A"), _make_panel("B"), _make_panel("C"))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    # Closed rectangles have 4 vertices; arrows have 2 vertices
    rects = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 4
    ]
    assert len(rects) == 3


def test_dxf_panel_dimensions():
    """LWPOLYLINE bounding box matches panel width_mm × height_mm."""
    bom = _make_bom(_make_panel("Side", width=580, height=2100))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    rects = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 4
    ]
    pts = list(rects[0].get_points(format="xy"))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    assert max(xs) - min(xs) == pytest.approx(580, abs=1)
    assert max(ys) - min(ys) == pytest.approx(2100, abs=1)


def test_dxf_grain_arrow_present():
    """Panel with grain direction produces an open LWPOLYLINE arrow."""
    bom = _make_bom(_make_panel("Side", grain="horizontal"))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    arrows = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 2
    ]
    assert len(arrows) >= 1


def test_dxf_no_grain_arrow():
    """Panel with grain_direction='none' produces no open LWPOLYLINE arrows."""
    bom = _make_bom(_make_panel("Side", grain="none"))
    dxf_bytes = generate_dxf(bom)
    doc = _parse_dxf(dxf_bytes)
    msp = doc.modelspace()
    arrows = [
        e
        for e in msp
        if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points())) == 2
    ]
    assert len(arrows) == 0
```

- [ ] **Step 2: Run tests to verify they fail with ImportError**

```bash
python3 -m pytest tests/test_export_dxf.py -v
```

Expected: FAILED — `ImportError: cannot import name 'generate_dxf' from 'app.core.export_dxf'` (module does not exist yet).

- [ ] **Step 3: Implement the DXF export engine**

Create `backend/app/core/export_dxf.py`:

```python
# backend/app/core/export_dxf.py
import io

import ezdxf

from app.schemas.bom import BomResponse

_GAP_MM = 50       # horizontal gap between panels
_MAX_PER_ROW = 5   # panels per row before wrapping


def generate_dxf(bom: BomResponse) -> bytes:
    """Generate a DXF cut sheet from a BOM. Returns DXF bytes (UTF-8 encoded)."""
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()

    cursor_x: float = 0.0
    row_y: float = 0.0
    panels_in_row: int = 0
    current_row_max_h: float = 0.0

    for panel in bom.panels:
        w = float(panel.width_mm)
        h = float(panel.height_mm)

        # Closed rectangle (4 vertices, drawn clockwise)
        msp.add_lwpolyline(
            [
                (cursor_x, row_y),
                (cursor_x + w, row_y),
                (cursor_x + w, row_y + h),
                (cursor_x, row_y + h),
            ],
            close=True,
        )

        # Text annotation (single-line label inside the panel)
        label = (
            f"{panel.name} | {panel.width_mm}x{panel.height_mm}mm"
            f" | Qty:{panel.quantity} | T:{panel.thickness_mm}mm"
        )
        msp.add_text(
            label,
            dxfattribs={"insert": (cursor_x + 10, row_y + h - 40), "height": 25},
        )

        # Grain direction arrow (open 2-vertex LWPOLYLINE)
        if panel.grain_direction in ("horizontal", "vertical"):
            cx = cursor_x + w / 2
            cy = row_y + h / 2
            arrow_half = min(w, h) * 0.15
            if panel.grain_direction == "horizontal":
                msp.add_lwpolyline(
                    [(cx - arrow_half, cy), (cx + arrow_half, cy)],
                    close=False,
                )
            else:  # vertical
                msp.add_lwpolyline(
                    [(cx, cy - arrow_half), (cx, cy + arrow_half)],
                    close=False,
                )

        current_row_max_h = max(current_row_max_h, h)
        panels_in_row += 1

        if panels_in_row >= _MAX_PER_ROW:
            cursor_x = 0.0
            row_y -= current_row_max_h + _GAP_MM
            current_row_max_h = 0.0
            panels_in_row = 0
        else:
            cursor_x += w + _GAP_MM

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")
```

- [ ] **Step 4: Run DXF tests to verify they pass**

```bash
python3 -m pytest tests/test_export_dxf.py -v
```

Expected:
```
tests/test_export_dxf.py::test_dxf_panel_count PASSED
tests/test_export_dxf.py::test_dxf_panel_dimensions PASSED
tests/test_export_dxf.py::test_dxf_grain_arrow_present PASSED
tests/test_export_dxf.py::test_dxf_no_grain_arrow PASSED
4 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_export_dxf.py backend/app/core/export_dxf.py
git commit -m "feat: add DXF export engine with panel layout and grain direction arrows"
```

---

## Task 3: PDF Export Engine

**Files:**
- Create: `backend/tests/test_export_pdf.py`
- Create: `backend/app/core/export_pdf.py`

- [ ] **Step 1: Write the failing PDF tests**

Create `backend/tests/test_export_pdf.py`:

```python
# backend/tests/test_export_pdf.py
from decimal import Decimal

from app.schemas.bom import BomHardwareRow, BomPanelRow, BomResponse
from app.schemas.pricing import PricingResponse
from app.core.export_pdf import generate_pdf


def _make_bom() -> BomResponse:
    panel = BomPanelRow(
        name="Side",
        material_name="Oak",
        material_sku="OAK-18",
        thickness_mm=18,
        width_mm=580,
        height_mm=2100,
        quantity=2,
        grain_direction="none",
        edge_left=False,
        edge_right=False,
        edge_top=True,
        edge_bottom=True,
        area_m2=Decimal("2.436"),
    )
    return BomResponse(
        panels=[panel],
        hardware=[
            BomHardwareRow(
                name="Hinge",
                quantity=4,
                unit_price=Decimal("0.50"),
                total_price=Decimal("2.00"),
            )
        ],
        total_panels=2,
        total_area_m2=Decimal("2.436"),
    )


def _make_pricing() -> PricingResponse:
    from app.schemas.pricing import PanelPricingRow

    return PricingResponse(
        panel_cost=Decimal("24.36"),
        edge_cost=Decimal("6.96"),
        hardware_cost=Decimal("2.00"),
        labor_cost=Decimal("2.50"),
        subtotal=Decimal("35.82"),
        total=Decimal("35.82"),
        breakdown=[
            PanelPricingRow(
                name="Side",
                area_m2=Decimal("2.436"),
                panel_cost=Decimal("24.36"),
                edge_cost=Decimal("6.96"),
            )
        ],
    )


def test_pdf_returns_bytes():
    result = generate_pdf(_make_bom(), _make_pricing())
    assert isinstance(result, bytes)


def test_pdf_is_valid_pdf():
    result = generate_pdf(_make_bom(), _make_pricing())
    assert result[:4] == b"%PDF"
```

- [ ] **Step 2: Run tests to verify they fail with ImportError**

```bash
python3 -m pytest tests/test_export_pdf.py -v
```

Expected: FAILED — `ImportError: cannot import name 'generate_pdf' from 'app.core.export_pdf'`.

- [ ] **Step 3: Implement the PDF export engine**

Create `backend/app/core/export_pdf.py`:

```python
# backend/app/core/export_pdf.py
import weasyprint

from app.schemas.bom import BomResponse
from app.schemas.pricing import PricingResponse


def generate_pdf(bom: BomResponse, pricing: PricingResponse) -> bytes:
    """Generate a PDF order summary from BOM and pricing data. Returns PDF bytes."""
    # Build cut list rows
    panel_rows_html = ""
    for p in bom.panels:
        edges = "/".join(
            label
            for label, flag in [
                ("L", p.edge_left),
                ("R", p.edge_right),
                ("T", p.edge_top),
                ("B", p.edge_bottom),
            ]
            if flag
        ) or "—"
        panel_rows_html += (
            f"<tr>"
            f"<td>{p.name}</td>"
            f"<td>{p.material_sku}</td>"
            f"<td>{p.thickness_mm}</td>"
            f"<td>{p.width_mm}</td>"
            f"<td>{p.height_mm}</td>"
            f"<td>{p.quantity}</td>"
            f"<td>{edges}</td>"
            f"<td>{float(p.area_m2):.4f}</td>"
            f"</tr>"
        )

    # Build hardware rows
    hw_rows_html = ""
    for h in bom.hardware:
        hw_rows_html += (
            f"<tr>"
            f"<td>{h.name}</td>"
            f"<td>{h.quantity}</td>"
            f"<td>{float(h.unit_price):.2f}</td>"
            f"<td>{float(h.total_price):.2f}</td>"
            f"</tr>"
        )

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: sans-serif; font-size: 11px; margin: 20px; }}
  h1 {{ font-size: 16px; margin-bottom: 4px; }}
  h2 {{ font-size: 13px; margin: 12px 0 4px 0; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 12px; }}
  th, td {{ border: 1px solid #ccc; padding: 3px 6px; text-align: left; }}
  th {{ background: #f0f0f0; font-weight: bold; }}
</style>
</head>
<body>
<h1>Order Summary</h1>

<h2>Pricing Breakdown</h2>
<table>
  <tr><th>Item</th><th>Amount</th></tr>
  <tr><td>Panel Cost</td><td>{float(pricing.panel_cost):.2f}</td></tr>
  <tr><td>Edge Banding Cost</td><td>{float(pricing.edge_cost):.2f}</td></tr>
  <tr><td>Hardware Cost</td><td>{float(pricing.hardware_cost):.2f}</td></tr>
  <tr><td>Labor Cost</td><td>{float(pricing.labor_cost):.2f}</td></tr>
  <tr><td><strong>Subtotal</strong></td><td><strong>{float(pricing.subtotal):.2f}</strong></td></tr>
  <tr><td><strong>Total</strong></td><td><strong>{float(pricing.total):.2f}</strong></td></tr>
</table>

<h2>Cut List</h2>
<table>
  <thead>
    <tr>
      <th>Panel</th><th>SKU</th><th>T(mm)</th><th>W(mm)</th>
      <th>H(mm)</th><th>Qty</th><th>Edges</th><th>Area m²</th>
    </tr>
  </thead>
  <tbody>{panel_rows_html}</tbody>
</table>

{f'<h2>Hardware</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{hw_rows_html}</tbody></table>' if bom.hardware else ''}
</body>
</html>"""

    return weasyprint.HTML(string=html).write_pdf()
```

- [ ] **Step 4: Run PDF tests to verify they pass**

```bash
python3 -m pytest tests/test_export_pdf.py -v
```

Expected:
```
tests/test_export_pdf.py::test_pdf_returns_bytes PASSED
tests/test_export_pdf.py::test_pdf_is_valid_pdf PASSED
2 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_export_pdf.py backend/app/core/export_pdf.py
git commit -m "feat: add PDF export engine using WeasyPrint"
```

---

## Task 4: Orders API

**Files:**
- Modify: `backend/app/api/configurations.py` (fix confirm status code)
- Create: `backend/tests/test_orders.py`
- Create: `backend/app/api/orders.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Fix confirm endpoint status code in configurations.py**

In `backend/app/api/configurations.py`, find lines 99–103:

```python
    if config.status != "draft":
        raise HTTPException(
            status_code=400, detail="Only draft configurations can be confirmed"
        )
```

Change to:

```python
    if config.status != "draft":
        raise HTTPException(
            status_code=409, detail="Configuration is already confirmed"
        )
```

- [ ] **Step 2: Write the failing orders integration tests**

Create `backend/tests/test_orders.py`:

```python
# backend/tests/test_orders.py
import pytest


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "pass", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "pass"})
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_orders.py -v
```

Expected: tests fail — `404 Not Found` for `/orders` (router not registered yet) and `409` checks fail on confirm (status code was 400 before the fix in Step 1).

- [ ] **Step 4: Implement the orders API**

Create `backend/app/api/orders.py`:

```python
# backend/app/api/orders.py
import asyncio
from decimal import Decimal
from typing import Dict, List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bom import MaterialInfo, generate_bom
from app.core.deps import get_current_user, get_db
from app.core.export_dxf import generate_dxf
from app.core.export_pdf import generate_pdf
from app.core.pricing import MaterialPricing, calculate_pricing
from app.core.storage import get_public_url, upload_bytes
from app.models.configuration import Configuration
from app.models.furniture_type import FurnitureType
from app.models.material import Material
from app.models.order import Order
from app.models.project import Project
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.applied_config import AppliedConfig
from app.schemas.order import OrderCreate, OrderResponse

router = APIRouter()


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await db.get(Configuration, body.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Configuration not found")

    if cfg.status != "confirmed":
        raise HTTPException(
            status_code=422,
            detail="Configuration must be confirmed before ordering",
        )

    existing = await db.execute(
        select(Order).where(Order.configuration_id == body.configuration_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409, detail="Order already exists for this configuration"
        )

    # Load margin from tenant (0% if user has no tenant)
    margin_pct = Decimal("0")
    if user.tenant_id:
        tenant = await db.get(Tenant, user.tenant_id)
        if tenant:
            margin_pct = tenant.margin_pct

    # Load labor rate from furniture type schema
    ft = await db.get(FurnitureType, cfg.furniture_type_id)
    labor_rate = Decimal(str(ft.schema.get("labor_rate", "0")))

    # Parse applied config
    try:
        applied = AppliedConfig.model_validate(cfg.applied_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Load materials for BOM and Pricing engines
    material_ids = {p.material_id for p in applied.panels}
    bom_materials: Dict[UUID, MaterialInfo] = {}
    pricing_materials: Dict[UUID, MaterialPricing] = {}
    for mid in material_ids:
        mat = await db.get(Material, mid)
        if not mat:
            raise HTTPException(status_code=422, detail=f"Material {mid} not found")
        bom_materials[mid] = MaterialInfo(name=mat.name, sku=mat.sku)
        pricing_materials[mid] = MaterialPricing(
            price_per_m2=mat.price_per_m2,
            edgebanding_price_per_mm=mat.edgebanding_price_per_mm,
        )

    # Generate snapshots (pure functions, no I/O)
    bom = generate_bom(applied, bom_materials)
    pricing = calculate_pricing(applied, pricing_materials, labor_rate, margin_pct)

    # Generate export files and upload to S3
    order_id = uuid4()
    try:
        dxf_bytes = generate_dxf(bom)
        pdf_bytes = generate_pdf(bom, pricing)
        dxf_key = f"orders/{order_id}/output.dxf"
        pdf_key = f"orders/{order_id}/output.pdf"
        await asyncio.to_thread(upload_bytes, dxf_key, dxf_bytes, "application/dxf")
        await asyncio.to_thread(upload_bytes, pdf_key, pdf_bytes, "application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export upload failed: {exc}")

    export_urls = {
        "dxf": get_public_url(dxf_key),
        "pdf": get_public_url(pdf_key),
    }

    order = Order(
        id=order_id,
        configuration_id=body.configuration_id,
        pricing_snapshot=pricing.model_dump(mode="json"),
        bom_snapshot=bom.model_dump(mode="json"),
        export_urls=export_urls,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.get("", response_model=List[OrderResponse])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Order)
        .join(Configuration, Order.configuration_id == Configuration.id)
        .join(Project, Configuration.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    cfg = await db.get(Configuration, order.configuration_id)
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    return order
```

- [ ] **Step 5: Register the orders router**

Edit `backend/app/api/router.py`. Change:

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

To:

```python
# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth, bom, configurations, furniture_types, materials, orders, pricing, projects

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(pricing.router, prefix="/pricing", tags=["pricing"])
api_router.include_router(bom.router, prefix="/bom", tags=["bom"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
```

- [ ] **Step 6: Run orders tests to verify they pass**

```bash
python3 -m pytest tests/test_orders.py -v
```

Expected:
```
tests/test_orders.py::test_confirm_configuration PASSED
tests/test_orders.py::test_confirm_already_confirmed_returns_409 PASSED
tests/test_orders.py::test_confirm_wrong_owner_returns_404 PASSED
tests/test_orders.py::test_create_order_happy_path PASSED
tests/test_orders.py::test_create_order_unconfirmed_returns_422 PASSED
tests/test_orders.py::test_create_order_duplicate_returns_409 PASSED
tests/test_orders.py::test_create_order_wrong_owner_returns_404 PASSED
tests/test_orders.py::test_list_orders_returns_only_callers_orders PASSED
tests/test_orders.py::test_get_order_by_id PASSED
tests/test_orders.py::test_get_order_wrong_owner_returns_404 PASSED
10 passed
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/configurations.py backend/app/api/orders.py \
  backend/app/api/router.py backend/tests/test_orders.py
git commit -m "feat: add Orders API with DXF+PDF export generation on order creation"
```

---

## Task 5: Full Suite Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run the complete test suite**

```bash
python3 -m pytest tests/ -v
```

Expected: all tests pass. Prior count was 70; with the new tests the expected total is:
- 70 existing tests
- 4 DXF tests
- 2 PDF tests
- 10 orders tests
= **86 passed**

- [ ] **Step 2: If any tests fail, investigate and fix before committing**

Common failure modes:
- `ImportError` for `ezdxf` or `weasyprint` → run `pip install ezdxf "weasyprint>=62"`
- `AttributeError` on `e.get_points()` → verify ezdxf version: `python3 -c "import ezdxf; print(ezdxf.__version__)"`
- `model_dump(mode='json')` serialisation error → verify both `BomResponse` and `PricingResponse` have `@field_serializer` on all Decimal fields (they do per existing code)
- WeasyPrint PDF output doesn't start with `%PDF` → ensure WeasyPrint≥62 is installed

- [ ] **Step 3: Commit any fixes**

```bash
git add -p  # stage only relevant fixes
git commit -m "fix: <describe what was fixed>"
```
