# Webhook Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /orders/{id}/dispatch` which fires an HTTP POST to the tenant's configured CRM URL, records the attempt on the order, and returns the result to the caller.

**Architecture:** A pure helper module (`app/core/webhook.py`) builds the payload and extracts `crm_ref` from the CRM response. The endpoint handles all I/O: ownership check → tenant webhook URL validation → httpx POST → write `order.last_dispatch` + optional `order.crm_ref` → return `DispatchResponse`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, httpx (async HTTP client), pytest-httpx (mock), Pydantic v2, SQLite in-memory for tests.

---

## Background: Key Existing Facts

- Working directory for all commands: `/Users/rovshennurybayev/claude_agents/backend`
- Run tests: `.venv312/bin/python -m pytest tests/ -v`
- Current branch: `main` — **create `feat/webhook-dispatch` before starting**.
- `Tenant` model (`app/models/tenant.py`) already has `webhook_url: Optional[str]` and `crm_config: Optional[dict]` — no tenant model change needed.
- `User` model has `tenant_id: Optional[UUID]` — users without a tenant have `tenant_id = None`.
- `Order` model (`app/models/order.py`) already has `crm_ref: Optional[str]` reserved for this plan.
- `orders.py` endpoint already imports `Tenant`, `User`, `Project`, `Configuration` — add `httpx`, `datetime`, `webhook` to it.
- `conftest.py`: `client` fixture uses the same `db_session` instance as the test. Tests that request both `client` AND `db_session` share one session — DB changes made via `db_session` are visible to API calls via `client`.
- `pytest-httpx` intercepts httpx requests that use the **default transport**. The test client uses `ASGITransport` (custom transport), so pytest-httpx does NOT interfere with test client requests.
- Existing test runner: `.venv312/bin/python -m pytest tests/ -v` (86 tests pass on main).

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/requirements.txt` | Modify | Add `pytest-httpx>=0.30` |
| `backend/alembic/versions/005_add_last_dispatch_to_orders.py` | Create | Add `last_dispatch` JSONB column to orders |
| `backend/app/models/order.py` | Modify | Add `last_dispatch` mapped column |
| `backend/app/schemas/order.py` | Modify | Add `DispatchResponse`; add `last_dispatch` to `OrderResponse` |
| `backend/app/core/webhook.py` | Create | `build_payload`, `extract_crm_ref` pure helpers |
| `backend/app/api/orders.py` | Modify | Add `POST /orders/{id}/dispatch` endpoint |
| `backend/tests/test_webhook.py` | Create | Unit tests for webhook helpers |
| `backend/tests/test_orders.py` | Modify | Add 6 dispatch integration tests |

---

## Task 1: Foundations — Dependencies, Migration, Model, Schema

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/alembic/versions/005_add_last_dispatch_to_orders.py`
- Modify: `backend/app/models/order.py`
- Modify: `backend/app/schemas/order.py`

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/webhook-dispatch
```

- [ ] **Step 2: Add pytest-httpx to requirements.txt**

Open `backend/requirements.txt` and append one line at the end:

```
pytest-httpx>=0.30
```

- [ ] **Step 3: Install pytest-httpx**

```bash
.venv312/bin/pip install "pytest-httpx>=0.30"
```

Expected: installs without error.

- [ ] **Step 4: Create migration 005**

Create `backend/alembic/versions/005_add_last_dispatch_to_orders.py`:

```python
"""add last_dispatch to orders

Revision ID: 005
Revises: 004
Create Date: 2026-04-11

"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("last_dispatch", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "last_dispatch")
```

- [ ] **Step 5: Add `last_dispatch` to the Order model**

Open `backend/app/models/order.py`. The current file ends with the `crm_ref` and `created_at` fields. Add `last_dispatch` after `crm_ref`:

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
        Uuid, ForeignKey("configurations.id")
    )
    pricing_snapshot: Mapped[dict] = mapped_column(JSON)
    bom_snapshot: Mapped[dict] = mapped_column(JSON)
    export_urls: Mapped[dict] = mapped_column(JSON, default=dict)
    crm_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_dispatch: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
```

- [ ] **Step 6: Update schemas**

Replace the entire contents of `backend/app/schemas/order.py` with:

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
    last_dispatch: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DispatchResponse(BaseModel):
    order_id: UUID
    dispatched_at: datetime
    http_status: int
    response_body: str
    crm_ref: Optional[str]
```

- [ ] **Step 7: Run existing tests to verify no regressions**

```bash
.venv312/bin/python -m pytest tests/ -v 2>&1 | tail -5
```

Expected:
```
86 passed, 9 warnings in ...
```

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt \
        backend/alembic/versions/005_add_last_dispatch_to_orders.py \
        backend/app/models/order.py \
        backend/app/schemas/order.py
git commit -m "feat: add last_dispatch column, DispatchResponse schema, pytest-httpx dep"
```

---

## Task 2: Webhook Helpers

**Files:**
- Create: `backend/tests/test_webhook.py`
- Create: `backend/app/core/webhook.py`

- [ ] **Step 1: Write the failing unit tests**

Create `backend/tests/test_webhook.py`:

```python
# backend/tests/test_webhook.py
import uuid
from datetime import datetime, timezone

from app.core.webhook import build_payload, extract_crm_ref
from app.models.order import Order


def _make_order() -> Order:
    return Order(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        configuration_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        pricing_snapshot={"total": 100.0},
        bom_snapshot={"panels": []},
        export_urls={"dxf": "http://s3/out.dxf", "pdf": "http://s3/out.pdf"},
        crm_ref=None,
        last_dispatch=None,
        created_at=datetime(2026, 4, 11, tzinfo=timezone.utc),
    )


def test_build_payload_uses_configured_fields():
    order = _make_order()
    crm_config = {"payload_fields": ["order_id", "export_urls"]}
    payload = build_payload(order, crm_config)
    assert set(payload.keys()) == {"order_id", "export_urls"}
    assert payload["order_id"] == str(order.id)
    assert payload["export_urls"] == order.export_urls


def test_build_payload_defaults_to_all_supported_fields_when_config_is_none():
    order = _make_order()
    payload = build_payload(order, None)
    assert "order_id" in payload
    assert "configuration_id" in payload
    assert "pricing_snapshot" in payload
    assert "bom_snapshot" in payload
    assert "export_urls" in payload
    assert "created_at" in payload


def test_build_payload_ignores_unknown_fields():
    order = _make_order()
    crm_config = {"payload_fields": ["order_id", "not_a_real_field"]}
    payload = build_payload(order, crm_config)
    assert set(payload.keys()) == {"order_id"}


def test_extract_crm_ref_returns_value_at_configured_key():
    crm_config = {"crm_ref_path": "id"}
    result = extract_crm_ref({"id": "CRM-123"}, crm_config)
    assert result == "CRM-123"


def test_extract_crm_ref_returns_none_when_key_absent():
    crm_config = {"crm_ref_path": "id"}
    result = extract_crm_ref({"other_key": "value"}, crm_config)
    assert result is None


def test_extract_crm_ref_returns_none_when_no_path_configured():
    result = extract_crm_ref({"id": "CRM-123"}, None)
    assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv312/bin/python -m pytest tests/test_webhook.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.core.webhook'` or similar import error.

- [ ] **Step 3: Create the webhook helpers**

Create `backend/app/core/webhook.py`:

```python
# backend/app/core/webhook.py
from typing import Optional

from app.models.order import Order

SUPPORTED_FIELDS = {
    "order_id",
    "configuration_id",
    "pricing_snapshot",
    "bom_snapshot",
    "export_urls",
    "created_at",
}


def build_payload(order: Order, crm_config: Optional[dict]) -> dict:
    """Build the webhook POST body from the order and tenant crm_config.

    If crm_config is None or payload_fields is absent, all supported fields are included.
    Unrecognised field names in payload_fields are silently ignored.
    """
    configured = (crm_config or {}).get("payload_fields", list(SUPPORTED_FIELDS))
    fields = set(configured) & SUPPORTED_FIELDS
    mapping = {
        "order_id": str(order.id),
        "configuration_id": str(order.configuration_id),
        "pricing_snapshot": order.pricing_snapshot,
        "bom_snapshot": order.bom_snapshot,
        "export_urls": order.export_urls,
        "created_at": order.created_at.isoformat(),
    }
    return {f: mapping[f] for f in fields}


def extract_crm_ref(response_json: dict, crm_config: Optional[dict]) -> Optional[str]:
    """Extract crm_ref from the CRM JSON response using crm_ref_path.

    Returns None if crm_ref_path is not configured or the key is absent.
    """
    path = (crm_config or {}).get("crm_ref_path")
    if not path:
        return None
    value = response_json.get(path)
    return str(value) if value is not None else None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv312/bin/python -m pytest tests/test_webhook.py -v
```

Expected:
```
tests/test_webhook.py::test_build_payload_uses_configured_fields PASSED
tests/test_webhook.py::test_build_payload_defaults_to_all_supported_fields_when_config_is_none PASSED
tests/test_webhook.py::test_build_payload_ignores_unknown_fields PASSED
tests/test_webhook.py::test_extract_crm_ref_returns_value_at_configured_key PASSED
tests/test_webhook.py::test_extract_crm_ref_returns_none_when_key_absent PASSED
tests/test_webhook.py::test_extract_crm_ref_returns_none_when_no_path_configured PASSED
6 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_webhook.py backend/app/core/webhook.py
git commit -m "feat: add webhook payload builder and crm_ref extractor"
```

---

## Task 3: Dispatch Endpoint

**Files:**
- Modify: `backend/tests/test_orders.py` (add 6 dispatch tests + imports + helper)
- Modify: `backend/app/api/orders.py` (add dispatch endpoint)

- [ ] **Step 1: Add dispatch tests to test_orders.py**

At the top of `backend/tests/test_orders.py`, add these imports (after the existing `import pytest` line):

```python
from sqlalchemy import select as _select
from app.models.tenant import Tenant
from app.models.user import User
```

Then add the `_setup_order_with_webhook` helper and the 6 dispatch tests at the bottom of the file:

```python
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
```

- [ ] **Step 2: Run dispatch tests to verify they fail**

```bash
.venv312/bin/python -m pytest tests/test_orders.py -k "dispatch" -v
```

Expected: 6 tests collected, all fail with `405 Method Not Allowed` or `404 Not Found` (endpoint does not exist yet).

- [ ] **Step 3: Implement the dispatch endpoint in orders.py**

Open `backend/app/api/orders.py`. Make the following changes:

**3a. Add new imports at the top** (after existing imports, before `router = APIRouter()`):

```python
import httpx
from datetime import datetime, timezone
from app.core.webhook import build_payload, extract_crm_ref
```

Update the existing schema import line to include `DispatchResponse`:

```python
from app.schemas.order import OrderCreate, OrderResponse, DispatchResponse
```

**3b. Add the dispatch endpoint** at the bottom of the file (after `get_order`):

```python
@router.post("/{order_id}/dispatch", response_model=DispatchResponse)
async def dispatch_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Load order and check ownership
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    cfg = await db.get(Configuration, order.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Order not found")
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    # Validate tenant has a webhook URL configured
    if not user.tenant_id:
        raise HTTPException(
            status_code=422, detail="No webhook URL configured for this tenant"
        )
    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant or not tenant.webhook_url:
        raise HTTPException(
            status_code=422, detail="No webhook URL configured for this tenant"
        )

    # Build payload and fire the webhook
    payload = build_payload(order, tenant.crm_config)
    extra_headers = (tenant.crm_config or {}).get("headers", {})
    dispatched_at = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            resp = await hc.post(
                tenant.webhook_url, json=payload, headers=extra_headers
            )
        http_status = resp.status_code
        response_body = resp.text
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Webhook delivery failed: {exc}"
        )

    # Extract crm_ref from 2xx responses only
    crm_ref = None
    if 200 <= http_status < 300:
        try:
            crm_ref = extract_crm_ref(resp.json(), tenant.crm_config)
        except Exception:
            pass
        if crm_ref:
            order.crm_ref = crm_ref

    # Record the dispatch attempt (overwrites previous)
    order.last_dispatch = {
        "dispatched_at": dispatched_at.isoformat(),
        "http_status": http_status,
        "response_body": response_body,
    }
    await db.commit()
    await db.refresh(order)

    return DispatchResponse(
        order_id=order.id,
        dispatched_at=dispatched_at,
        http_status=http_status,
        response_body=response_body,
        crm_ref=crm_ref,
    )
```

- [ ] **Step 4: Run dispatch tests to verify they pass**

```bash
.venv312/bin/python -m pytest tests/test_orders.py -k "dispatch" -v
```

Expected:
```
tests/test_orders.py::test_dispatch_happy_path PASSED
tests/test_orders.py::test_dispatch_records_non_2xx PASSED
tests/test_orders.py::test_dispatch_no_webhook_url_returns_422 PASSED
tests/test_orders.py::test_dispatch_wrong_owner_returns_404 PASSED
tests/test_orders.py::test_dispatch_overwrites_last_dispatch PASSED
tests/test_orders.py::test_dispatch_unauthenticated_returns_403 PASSED
6 passed
```

- [ ] **Step 5: Run the full test suite**

```bash
.venv312/bin/python -m pytest tests/ -v 2>&1 | tail -5
```

Expected:
```
98 passed, 9 warnings in ...
```

(86 existing + 6 webhook unit + 6 dispatch integration = 98 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_orders.py backend/app/api/orders.py
git commit -m "feat: add POST /orders/{id}/dispatch webhook endpoint"
```
