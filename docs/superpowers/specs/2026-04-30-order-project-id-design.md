# Order `project_id` in Response — Design Spec (Sub-plan 18)
**Date:** 2026-04-30
**Status:** Approved

---

## Overview

The `GET /orders` list page currently makes N separate `GET /configurations/{id}` calls to resolve `project_id` for each order's "View" link — an N+1 anti-pattern. Fix: add `project_id` to `OrderResponse` (computed from a join, no DB migration needed) and remove the N+1 from the frontend.

---

## Non-Goals

- Adding a standalone `/orders/[orderId]` page (YAGNI — existing `/projects/[id]/orders/[orderId]` path works fine)
- Paginating or filtering orders
- Storing `project_id` as a denormalized column on the `Order` model

---

## Backend Contract

### `OrderResponse` (modified)

Add `project_id: UUID` field. No schema migration — it is resolved at query time by joining through `Configuration`.

```python
class OrderResponse(BaseModel):
    id: UUID
    configuration_id: UUID
    project_id: UUID          # ← new
    pricing_snapshot: dict
    bom_snapshot: dict
    export_urls: dict
    crm_ref: Optional[str] = None
    last_dispatch: Optional[dict] = None
    created_at: datetime
    model_config = {"from_attributes": True}
```

### `GET /orders` (list_orders)

Current query already joins through `Configuration` and `Project` for ownership. Extend the `select` to also fetch `Configuration.project_id`:

```python
stmt = (
    select(Order, Configuration.project_id)
    .join(Configuration, Order.configuration_id == Configuration.id)
    .join(Project, Configuration.project_id == Project.id)
    .where(Project.user_id == user.id)
)
result = await db.execute(stmt)
return [
    {
        "id": order.id,
        "configuration_id": order.configuration_id,
        "project_id": project_id,
        "pricing_snapshot": order.pricing_snapshot,
        "bom_snapshot": order.bom_snapshot,
        "export_urls": order.export_urls,
        "crm_ref": order.crm_ref,
        "last_dispatch": order.last_dispatch,
        "created_at": order.created_at,
    }
    for order, project_id in result.all()
]
```

### `GET /orders/{order_id}` (get_order)

Already loads `cfg` for ownership check. Use `cfg.project_id` in the return dict:

```python
return {
    "id": order.id,
    "configuration_id": order.configuration_id,
    "project_id": cfg.project_id,
    "pricing_snapshot": order.pricing_snapshot,
    "bom_snapshot": order.bom_snapshot,
    "export_urls": order.export_urls,
    "crm_ref": order.crm_ref,
    "last_dispatch": order.last_dispatch,
    "created_at": order.created_at,
}
```

### `POST /orders` (create_order)

Already loads `cfg`. Use `cfg.project_id` in the return dict (same pattern as get_order).

---

## Architecture

```
backend/
  app/
    schemas/order.py           ← MODIFY: add project_id: UUID to OrderResponse
    api/orders.py              ← MODIFY: list_orders, get_order, create_order return dicts with project_id
  tests/
    test_orders.py             ← MODIFY: 2 new tests + assert project_id present in existing tests

frontend/
  lib/api.ts                   ← MODIFY: add project_id: string to Order type
  app/
    (app)/
      orders/
        page.tsx               ← MODIFY: remove N+1 getConfiguration calls, use order.project_id directly
```

---

## Frontend Detail

### `Order` type (api.ts)

Add `project_id: string`:

```ts
export type Order = {
  id: string
  configuration_id: string
  project_id: string           // ← new
  pricing_snapshot: PricingSnapshot
  bom_snapshot: BomSnapshot
  export_urls: { dxf: string; pdf: string }
  crm_ref: string | null
  last_dispatch: Record<string, unknown> | null
  created_at: string
}
```

### Orders list page (`/orders/page.tsx`)

Remove the `Promise.allSettled(orders.map(getConfiguration))` block and the `projectMap` dict. Replace with direct access to `order.project_id`:

```tsx
// Before: resolved via N API calls
const projectId = projectMap[order.configuration_id]

// After: direct from order
const projectId = order.project_id
```

The "View →" link becomes:
```tsx
<Link href={`/projects/${order.project_id}/orders/${order.id}`} ...>
  View →
</Link>
```

No conditional rendering — `project_id` is always present.

---

## Testing

### Backend (2 new tests)

- `test_list_orders_includes_project_id` — create project + config + order, call `GET /orders`, assert `project_id` field equals the project id
- `test_get_order_includes_project_id` — same setup, call `GET /orders/{order_id}`, assert `project_id` field

### Frontend (1 new Jest test, 56 → 57)

- `listOrders` — assert returned `Order[]` objects include `project_id` field (mock response updated to include it)

Existing tests: TypeScript must pass, all 56 existing Jest tests must continue to pass.

---

## File Summary

| File | Action |
|------|--------|
| `backend/app/schemas/order.py` | Modify — add `project_id: UUID` |
| `backend/app/api/orders.py` | Modify — return dicts with `project_id` in list_orders, get_order, create_order |
| `backend/tests/test_orders.py` | Modify — 2 new tests, assert project_id in existing response checks |
| `frontend/lib/api.ts` | Modify — add `project_id: string` to `Order` type |
| `frontend/app/(app)/orders/page.tsx` | Modify — remove N+1 pattern, use `order.project_id` directly |
