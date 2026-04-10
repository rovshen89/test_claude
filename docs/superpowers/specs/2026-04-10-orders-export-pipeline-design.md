# Orders & Export Pipeline — Design Spec (Plan 4a)
**Date:** 2026-04-10
**Status:** Approved

---

## Overview

Adds an Order lifecycle to the platform and a synchronous export pipeline that generates DXF (CNC cut files) and PDF (client-facing production summary) when an order is created. Two new endpoints: `POST /configurations/{id}/confirm` transitions a draft configuration to confirmed status; `POST /orders` creates an order from a confirmed configuration, runs fresh BOM + Pricing snapshots, generates DXF + PDF files, uploads them to S3, and returns the order with export URLs.

---

## Goals

- Persist orders with immutable pricing and BOM snapshots at the moment of confirmation
- Generate production-ready DXF (panel cut drawings) and PDF (order summary) synchronously on order creation
- Upload both files to S3 and store presigned public URLs on the order record
- Provide list/get endpoints for order retrieval
- Leave `crm_ref` column on orders nullable for Plan 4b webhook integration

---

## Non-Goals (Plan 4a)

- SVG panel nesting / sheet optimization (deferred)
- Webhook dispatch to ERP/CRM systems (Plan 4b)
- Order status transitions (in_production, completed) — that lifecycle belongs to Plan 4b
- Background/async export generation — synchronous only

---

## Architecture

```
POST /configurations/{id}/confirm
  └─ load config, check ownership, validate status == 'draft'
  └─ set status = 'confirmed'
  └─ return ConfigurationResponse

POST /orders  { configuration_id }
  └─ load config, check ownership, validate status == 'confirmed'
  └─ check no existing order for this configuration (unique constraint → 409)
  └─ re-run BOM engine  → BomResponse (snapshot)
  └─ re-run Pricing engine → PricingResponse (snapshot)
  └─ generate_dxf(bom) → bytes
  └─ generate_pdf(bom, pricing) → bytes
  └─ upload_bytes("orders/{order_id}/output.dxf", dxf_bytes)
  └─ upload_bytes("orders/{order_id}/output.pdf", pdf_bytes)
  └─ create Order record with snapshots + export_urls
  └─ return OrderResponse
```

Export functions are **pure**: they take plain Pydantic objects and return `bytes`. No DB access, no S3 calls — the endpoint handles I/O.

---

## Data Model

### Orders table (migration 004)

```sql
CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_id UUID NOT NULL REFERENCES configurations(id) UNIQUE,
  pricing_snapshot JSONB NOT NULL,
  bom_snapshot     JSONB NOT NULL,
  export_urls      JSONB NOT NULL DEFAULT '{}',
  crm_ref          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`UNIQUE` on `configuration_id` enforces one order per configuration at the DB level.

### SQLAlchemy model (`app/models/order.py`)

```python
class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    configuration_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("configurations.id"), unique=True)
    pricing_snapshot: Mapped[dict] = mapped_column(JSON)
    bom_snapshot: Mapped[dict] = mapped_column(JSON)
    export_urls: Mapped[dict] = mapped_column(JSON, default=dict)
    crm_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

---

## API Endpoints

### `POST /configurations/{id}/confirm`
- **Auth:** any authenticated user
- **Ownership:** load config → load project → `project.user_id != user.id` → 404
- **Validation:** `config.status != 'draft'` → 409 `"Configuration is already confirmed"`
- **Action:** `config.status = 'confirmed'`, commit
- **Response:** `ConfigurationResponse` (200)

### `POST /orders`
- **Auth:** any authenticated user
- **Body:** `OrderCreate { configuration_id: UUID }`
- **Ownership:** config → project → `project.user_id != user.id` → 404
- **Validation:**
  - `config.status != 'confirmed'` → 422 `"Configuration must be confirmed before ordering"`
  - Existing order for `configuration_id` → 409 `"Order already exists for this configuration"`
- **Action:** run BOM + Pricing, generate DXF + PDF, upload to S3, create Order
- **Response:** `OrderResponse` (201)

### `GET /orders`
- **Auth:** any authenticated user
- **Scope:** returns orders where `configuration.project.user_id == user.id`
- **Query:** `SELECT orders.* FROM orders JOIN configurations ON orders.configuration_id = configurations.id JOIN projects ON configurations.project_id = projects.id WHERE projects.user_id = :user_id`
- **Response:** `List[OrderResponse]` (200)

### `GET /orders/{id}`
- **Auth:** any authenticated user
- **Ownership:** same as above → 404 if not found or not owned
- **Response:** `OrderResponse` (200)

---

## Schemas (`app/schemas/order.py`)

```python
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
```

No `Decimal` fields on `OrderResponse` — snapshots are stored as plain JSON dicts (already serialized by Pydantic at snapshot time).

---

## Export: DXF (`app/core/export_dxf.py`)

**Signature:** `generate_dxf(bom: BomResponse) -> bytes`

**Layout algorithm:**
1. For each `BomPanelRow` in `bom.panels`: draw a closed `LWPOLYLINE` rectangle at `(cursor_x, 0)` with width = `panel.width_mm`, height = `panel.height_mm`.
2. Add `MTEXT` entity inside the panel: `"{name}\n{width_mm}×{height_mm}mm\nQty:{quantity}\nT:{thickness_mm}mm"`.
3. If `panel.grain_direction in ('horizontal', 'vertical')`: draw a short arrow polyline indicating grain direction (horizontal = left→right arrow at panel center; vertical = bottom→top arrow).
4. Advance `cursor_x += panel.width_mm + 50` (50mm gap between panels). Wrap to a new row after 5 panels.
5. Return `doc.write_bytes()`.

**ezdxf usage:**
```python
import ezdxf

def generate_dxf(bom: BomResponse) -> bytes:
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()
    # ... draw panels ...
    import io
    buf = io.BytesIO()
    doc.write(buf)
    return buf.getvalue()
```

---

## Export: PDF (`app/core/export_pdf.py`)

**Signature:** `generate_pdf(bom: BomResponse, pricing: PricingResponse) -> bytes`

**Implementation:** Build an HTML string with inline CSS. Pass to `weasyprint.HTML(string=html).write_pdf()`. Return bytes.

**HTML structure:**
```html
<h1>Order Summary</h1>
<h2>Pricing</h2>
<table>
  <tr><th>Panel Cost</th><td>{pricing.panel_cost}</td></tr>
  <tr><th>Edge Cost</th><td>{pricing.edge_cost}</td></tr>
  <tr><th>Hardware Cost</th><td>{pricing.hardware_cost}</td></tr>
  <tr><th>Labor Cost</th><td>{pricing.labor_cost}</td></tr>
  <tr><th>Subtotal</th><td>{pricing.subtotal}</td></tr>
  <tr><th>Total</th><td>{pricing.total}</td></tr>
</table>
<h2>Cut List</h2>
<table>
  <thead><tr><th>Panel</th><th>SKU</th><th>T(mm)</th><th>W(mm)</th>
              <th>H(mm)</th><th>Qty</th><th>Edges</th><th>Area m²</th></tr></thead>
  <tbody><!-- one row per panel --></tbody>
</table>
```

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/models/order.py` | Create | Order SQLAlchemy model |
| `backend/alembic/versions/004_create_orders.py` | Create | orders table migration |
| `backend/app/schemas/order.py` | Create | OrderCreate, OrderResponse |
| `backend/app/core/export_dxf.py` | Create | generate_dxf() pure function |
| `backend/app/core/export_pdf.py` | Create | generate_pdf() pure function |
| `backend/app/api/orders.py` | Create | POST/GET /orders endpoints |
| `backend/app/api/configurations.py` | Modify | Add POST /configurations/{id}/confirm |
| `backend/app/api/router.py` | Modify | Register orders router |
| `backend/tests/test_export_dxf.py` | Create | Unit tests for DXF generation |
| `backend/tests/test_export_pdf.py` | Create | Unit tests for PDF generation |
| `backend/tests/test_orders.py` | Create | Integration tests for orders API |

---

## Testing

### `test_export_dxf.py`
- `test_dxf_panel_count`: BOM with 3 panel specs → DXF has 3 LWPOLYLINE entities
- `test_dxf_panel_dimensions`: verify first panel LWPOLYLINE vertices match width_mm × height_mm
- `test_dxf_grain_arrow_present`: panel with grain_direction='horizontal' → at least 5 total entities (rect + arrow)
- `test_dxf_no_grain_arrow`: panel with grain_direction='none' → only 2 entities per panel (LWPOLYLINE + MTEXT, no arrow)

### `test_export_pdf.py`
- `test_pdf_returns_bytes`: output is `bytes`
- `test_pdf_is_valid_pdf`: output starts with `b'%PDF-'`

### `test_orders.py` (integration, uses `s3_mock` fixture)
- `test_confirm_configuration`: happy path → status becomes 'confirmed'
- `test_confirm_already_confirmed_returns_409`: re-confirm → 409
- `test_confirm_wrong_owner_returns_404`: other user's config → 404
- `test_create_order_happy_path`: confirmed config → 201, has export_urls with dxf + pdf keys
- `test_create_order_unconfirmed_returns_422`: draft config → 422
- `test_create_order_duplicate_returns_409`: second order for same config → 409
- `test_create_order_wrong_owner_returns_404`: other user's config → 404
- `test_list_orders`: returns only caller's orders
- `test_get_order_by_id`: returns correct order
- `test_get_order_wrong_owner_returns_404`: other user's order → 404

---

## Error Responses

| Scenario | Status | Detail |
|----------|--------|--------|
| Config not found or not owned | 404 | "Configuration not found" |
| Config already confirmed | 409 | "Configuration is already confirmed" |
| Config not confirmed when ordering | 422 | "Configuration must be confirmed before ordering" |
| Order already exists | 409 | "Order already exists for this configuration" |
| Order not found or not owned | 404 | "Order not found" |
| Material not found during BOM/Pricing re-run | 422 | "Material {id} not found" |
| S3 upload failure | 500 | "Export upload failed: {detail}" |
