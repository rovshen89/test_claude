# Webhook Dispatch — Design Spec (Plan 4b)
**Date:** 2026-04-11
**Status:** Approved

---

## Overview

Adds a manual webhook dispatch mechanism to the Orders system. A single new endpoint — `POST /orders/{id}/dispatch` — fires an HTTP POST to the tenant's configured CRM/ERP URL, records the attempt on the order, and returns the result to the caller. Retry logic is left to the caller.

---

## Goals

- Allow tenants to push order data to an external CRM/ERP via a configurable webhook
- Record the last dispatch attempt (timestamp, HTTP status, response body) on the order
- Populate `order.crm_ref` from the CRM response using a configurable JSON key path
- Return the full dispatch result synchronously so the caller can decide whether to retry

---

## Non-Goals (Plan 4b)

- Automatic webhook firing on order creation (Plan 4a's `POST /orders` is unchanged)
- Retry logic / exponential backoff (caller responsibility)
- Order status transitions (`in_production`, `completed`) — deferred to Plan 5+
- Full dispatch history / audit log — only the last attempt is stored

---

## Architecture

```
POST /orders/{id}/dispatch
  └─ load order, check ownership (→ 404 if not owned)
  └─ load user → tenant
  └─ validate tenant.webhook_url is set (→ 422 if missing)
  └─ build_payload(order, tenant.crm_config) → dict
  └─ POST webhook_url with payload + crm_config.headers (10s timeout)
  └─ on network error → 502
  └─ extract_crm_ref(response_json, crm_config) → Optional[str]
  └─ if 2xx and crm_ref extracted: order.crm_ref = crm_ref
  └─ order.last_dispatch = {dispatched_at, http_status, response_body}
  └─ commit
  └─ return DispatchResponse
```

Pure helper functions in `app/core/webhook.py`: no DB access, no HTTP calls — the endpoint handles all I/O.

---

## Data Model

### Migration 005: add `last_dispatch` to orders

```sql
ALTER TABLE orders ADD COLUMN last_dispatch JSONB;
```

Nullable — `NULL` until the first dispatch is made.

### SQLAlchemy model change (`app/models/order.py`)

```python
last_dispatch: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
```

### `crm_config` (existing JSONB on `tenants` — no schema change)

```json
{
  "payload_fields": ["order_id", "pricing_snapshot", "export_urls"],
  "headers": {"Authorization": "Bearer token123"},
  "crm_ref_path": "id"
}
```

| Key | Type | Description |
|-----|------|-------------|
| `payload_fields` | `List[str]` | Order fields to include in webhook body. Supported: `order_id`, `configuration_id`, `pricing_snapshot`, `bom_snapshot`, `export_urls`, `created_at`. Unrecognized fields silently ignored. |
| `headers` | `Dict[str, str]` | HTTP headers added to the webhook request (e.g., auth tokens). |
| `crm_ref_path` | `str` | Top-level key name in the CRM JSON response from which to extract `crm_ref`. |

If `crm_config` is `None` or any key is absent, sensible defaults apply: empty payload fields → full order, no extra headers, no `crm_ref` extraction.

---

## API Endpoint

### `POST /orders/{id}/dispatch`

- **Auth:** any authenticated user
- **Ownership:** order → configuration → project → `project.user_id != user.id` → 404 `"Order not found"`
- **Validations:**
  - `tenant.webhook_url` is `None` or empty → 422 `"No webhook URL configured for this tenant"`
  - Network / connection error → 502 `"Webhook delivery failed: {detail}"`
- **Behavior:**
  - Non-2xx CRM responses are recorded, not treated as errors — the caller sees `http_status` and decides
  - `crm_ref` written to `order.crm_ref` only when CRM returns 2xx **and** `crm_ref_path` resolves a value in the response JSON
  - `last_dispatch` is overwritten on every call (no history)
- **Response:** `DispatchResponse` (200)

---

## Schemas (`app/schemas/order.py`)

### New: `DispatchResponse`

```python
class DispatchResponse(BaseModel):
    order_id: UUID
    dispatched_at: datetime
    http_status: int
    response_body: str
    crm_ref: Optional[str]
```

### Updated: `OrderResponse`

Add one new optional field:

```python
last_dispatch: Optional[dict] = None
```

---

## Webhook Helpers (`app/core/webhook.py`)

```python
SUPPORTED_FIELDS = {
    "order_id", "configuration_id", "pricing_snapshot",
    "bom_snapshot", "export_urls", "created_at",
}

def build_payload(order: Order, crm_config: Optional[dict]) -> dict:
    """Build the webhook POST body from the order and tenant crm_config."""
    fields = set((crm_config or {}).get("payload_fields", list(SUPPORTED_FIELDS)))
    fields &= SUPPORTED_FIELDS
    payload = {}
    mapping = {
        "order_id": str(order.id),
        "configuration_id": str(order.configuration_id),
        "pricing_snapshot": order.pricing_snapshot,
        "bom_snapshot": order.bom_snapshot,
        "export_urls": order.export_urls,
        "created_at": order.created_at.isoformat(),
    }
    for f in fields:
        payload[f] = mapping[f]
    return payload

def extract_crm_ref(response_json: dict, crm_config: Optional[dict]) -> Optional[str]:
    """Extract crm_ref from the CRM response using crm_ref_path."""
    path = (crm_config or {}).get("crm_ref_path")
    if not path:
        return None
    value = response_json.get(path)
    return str(value) if value is not None else None
```

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/alembic/versions/005_add_last_dispatch_to_orders.py` | Create | Add `last_dispatch` JSONB column |
| `backend/app/models/order.py` | Modify | Add `last_dispatch` mapped column |
| `backend/app/core/webhook.py` | Create | `build_payload`, `extract_crm_ref` pure helpers |
| `backend/app/schemas/order.py` | Modify | Add `DispatchResponse`; add `last_dispatch` to `OrderResponse` |
| `backend/app/api/orders.py` | Modify | Add `POST /orders/{id}/dispatch` endpoint |
| `backend/requirements.txt` | Modify | Add `pytest-httpx>=0.30` |
| `backend/tests/test_orders.py` | Modify | Add 6 dispatch integration tests |

---

## Testing

### `test_orders.py` — new dispatch tests

- `test_dispatch_happy_path` — mock CRM returns 200 `{"id": "CRM-123"}` → `crm_ref = "CRM-123"`, `http_status = 200`, `last_dispatch` set on order
- `test_dispatch_records_non_2xx` — mock CRM returns 500 → attempt recorded, `crm_ref` not set, caller receives `http_status = 500`
- `test_dispatch_no_webhook_url_returns_422` — tenant has `webhook_url = None` → 422
- `test_dispatch_wrong_owner_returns_404` — another user's order → 404
- `test_dispatch_overwrites_last_dispatch` — dispatch twice → second call's result is stored in `last_dispatch`
- `test_dispatch_unauthenticated_returns_403` — no auth header → 403

Webhook HTTP calls are mocked with `pytest-httpx` — no real network calls in tests. Add `pytest-httpx>=0.30` to `requirements.txt`.

---

## Error Responses

| Scenario | Status | Detail |
|----------|--------|--------|
| Order not found or not owned | 404 | `"Order not found"` |
| No webhook URL configured | 422 | `"No webhook URL configured for this tenant"` |
| Network / connection error | 502 | `"Webhook delivery failed: {detail}"` |
| Unauthenticated | 403 | (default FastAPI auth response) |
