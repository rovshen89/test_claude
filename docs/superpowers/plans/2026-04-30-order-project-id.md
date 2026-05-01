# Order `project_id` in Response — Implementation Plan (Sub-plan 18)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `project_id` to `OrderResponse` (computed from a join, no DB migration) and remove the N+1 `getConfiguration` calls from the frontend orders list page.

**Architecture:** The backend `list_orders` endpoint is extended to `select(Order, Configuration.project_id)` in the existing join and returns a list of dicts. `get_order` and `create_order` already have `cfg` loaded so they include `cfg.project_id` in the return dict. The `OrderResponse` schema gains `project_id: UUID`. The frontend `Order` type and the orders list page are updated accordingly.

**Tech Stack:** FastAPI + SQLAlchemy async + pytest; Next.js 15 App Router + NextAuth v5 + Tailwind CSS + Jest.

---

### Task 1: Backend — add `project_id` to `OrderResponse` + update endpoints + 2 tests

**Files:**
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/api/orders.py`
- Modify: `backend/tests/test_orders.py`

Context: `OrderResponse` at `backend/app/schemas/order.py` lines 13–23 uses `from_attributes=True` to serialize ORM objects, but `project_id` is not a column on the `Order` model — it lives on `Configuration`. The fix is to return plain dicts from the three affected endpoints instead of raw ORM objects; FastAPI serializes these via `response_model=OrderResponse` just as well. Current backend test count: 121.

`_setup_confirmed_config` in `backend/tests/test_orders.py` returns `(headers, cfg_id)`. To get `project_id` in new tests, call `GET /configurations/{cfg_id}` which already returns `ConfigurationResponse` including `project_id`.

- [ ] **Step 1: Write 2 failing tests at the end of `backend/tests/test_orders.py`**

```python
@pytest.mark.asyncio
async def test_create_order_includes_project_id(client, s3_mock):
    headers, cfg_id = await _setup_confirmed_config(client, "projid1@example.com")
    cfg_r = await client.get(f"/configurations/{cfg_id}", headers=headers)
    expected_project_id = cfg_r.json()["project_id"]

    r = await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)
    assert r.status_code == 201
    assert r.json()["project_id"] == expected_project_id


@pytest.mark.asyncio
async def test_list_orders_includes_project_id(client, s3_mock):
    headers, cfg_id = await _setup_confirmed_config(client, "projid2@example.com")
    cfg_r = await client.get(f"/configurations/{cfg_id}", headers=headers)
    expected_project_id = cfg_r.json()["project_id"]

    await client.post("/orders", json={"configuration_id": cfg_id}, headers=headers)

    r = await client.get("/orders", headers=headers)
    assert r.status_code == 200
    assert r.json()[0]["project_id"] == expected_project_id
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_orders.py::test_create_order_includes_project_id tests/test_orders.py::test_list_orders_includes_project_id -x -q 2>&1 | tail -10
```

Expected: 2 failures — `KeyError: 'project_id'` or validation error.

- [ ] **Step 3: Add `project_id` to `OrderResponse` in `backend/app/schemas/order.py`**

Current file (`backend/app/schemas/order.py` lines 13–23):
```python
class OrderResponse(BaseModel):
    id: UUID
    configuration_id: UUID
    pricing_snapshot: dict
    bom_snapshot: dict
    export_urls: dict
    crm_ref: Optional[str] = None
    last_dispatch: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}
```

Replace with:
```python
class OrderResponse(BaseModel):
    id: UUID
    configuration_id: UUID
    project_id: UUID
    pricing_snapshot: dict
    bom_snapshot: dict
    export_urls: dict
    crm_ref: Optional[str] = None
    last_dispatch: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Update `list_orders` in `backend/app/api/orders.py`**

Find the existing `list_orders` function (lines ~140–152):
```python
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
```

Replace with:
```python
@router.get("", response_model=List[OrderResponse])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
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

- [ ] **Step 5: Update `get_order` in `backend/app/api/orders.py`**

Find the existing `get_order` function (lines ~155–172):
```python
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
    if not cfg:
        raise HTTPException(status_code=404, detail="Order not found")
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    return order
```

Replace the final `return order` with a dict:
```python
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
    if not cfg:
        raise HTTPException(status_code=404, detail="Order not found")
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

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

- [ ] **Step 6: Update `create_order` in `backend/app/api/orders.py`**

Find the final lines of `create_order` (lines ~122–137). The function already has `cfg` and `project` loaded. Find the current return:
```python
    try:
        db.add(order)
        await db.commit()
        await db.refresh(order)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Order already exists for this configuration")
    return order
```

Replace `return order` with a dict (keep the try/except unchanged):
```python
    try:
        db.add(order)
        await db.commit()
        await db.refresh(order)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Order already exists for this configuration")
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

- [ ] **Step 7: Run new tests to confirm they pass**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_orders.py::test_create_order_includes_project_id tests/test_orders.py::test_list_orders_includes_project_id -x -q 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 8: Run full backend suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 123 passed, 0 failures.

- [ ] **Step 9: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && git add app/schemas/order.py app/api/orders.py tests/test_orders.py && git commit -m "feat: add project_id to OrderResponse, computed from Configuration join (sub-plan 18, task 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — add `project_id` to `Order` type + simplify orders list page + 1 test

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/app/(app)/orders/page.tsx`

Context: `Order` type at `frontend/lib/api.ts` lines 205–214 lacks `project_id`. The `orderFixture` const in `frontend/tests/lib/api.test.ts` at line 335 also lacks `project_id` and will cause TypeScript to error once the type is updated. The orders list page at `frontend/app/(app)/orders/page.tsx` currently imports `getConfiguration` and calls it N times to resolve `project_id` via `Promise.allSettled`. Current Jest test count: 56.

- [ ] **Step 1: Add `project_id` to `Order` type in `frontend/lib/api.ts`**

Find the `Order` type (lines 205–214):
```ts
export type Order = {
  id: string
  configuration_id: string
  pricing_snapshot: PricingSnapshot
  bom_snapshot: BomSnapshot
  export_urls: { dxf: string; pdf: string }
  crm_ref: string | null
  last_dispatch: Record<string, unknown> | null
  created_at: string
}
```

Replace with:
```ts
export type Order = {
  id: string
  configuration_id: string
  project_id: string
  pricing_snapshot: PricingSnapshot
  bom_snapshot: BomSnapshot
  export_urls: { dxf: string; pdf: string }
  crm_ref: string | null
  last_dispatch: Record<string, unknown> | null
  created_at: string
}
```

- [ ] **Step 2: Add `project_id` to `orderFixture` in `frontend/tests/lib/api.test.ts`**

Read the file. Find `orderFixture` (lines ~335–352):
```ts
const orderFixture: Order = {
  id: "ord1",
  configuration_id: "cfg1",
  pricing_snapshot: {
    panel_cost: 100,
    edge_cost: 20,
    hardware_cost: 30,
    labor_cost: 10,
    subtotal: 160,
    total: 192,
    breakdown: [],
  },
  bom_snapshot: { panels: [], hardware: [], total_panels: 0, total_area_m2: 0 },
  export_urls: { dxf: "http://s3/order.dxf", pdf: "http://s3/order.pdf" },
  crm_ref: null,
  last_dispatch: null,
  created_at: "2026-04-15T10:00:00Z",
}
```

Replace with (add `project_id` after `configuration_id`):
```ts
const orderFixture: Order = {
  id: "ord1",
  configuration_id: "cfg1",
  project_id: "proj1",
  pricing_snapshot: {
    panel_cost: 100,
    edge_cost: 20,
    hardware_cost: 30,
    labor_cost: 10,
    subtotal: 160,
    total: 192,
    breakdown: [],
  },
  bom_snapshot: { panels: [], hardware: [], total_panels: 0, total_area_m2: 0 },
  export_urls: { dxf: "http://s3/order.dxf", pdf: "http://s3/order.pdf" },
  crm_ref: null,
  last_dispatch: null,
  created_at: "2026-04-15T10:00:00Z",
}
```

- [ ] **Step 3: Add a new test asserting `project_id` is returned by `listOrders`**

Read the end of `frontend/tests/lib/api.test.ts`. Find the `listOrders` describe block (lines ~399–419):
```ts
describe("listOrders", () => {
  it("calls GET /orders with Authorization header and returns Order[]", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [orderFixture] })

    const result = await listOrders("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ord1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(listOrders("tok")).rejects.toMatchObject({ status: 401 })
  })
})
```

Replace with (add a third `it` block):
```ts
describe("listOrders", () => {
  it("calls GET /orders with Authorization header and returns Order[]", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [orderFixture] })

    const result = await listOrders("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ord1")
  })

  it("includes project_id in returned orders", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [orderFixture] })
    const result = await listOrders("tok")
    expect(result[0].project_id).toBe("proj1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(listOrders("tok")).rejects.toMatchObject({ status: 401 })
  })
})
```

- [ ] **Step 4: Run Jest to confirm 57 tests pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -5
```

Expected: 57 tests, 0 failures.

- [ ] **Step 5: Simplify `frontend/app/(app)/orders/page.tsx`**

Read the file. Find the current import block and N+1 pattern.

Replace the current imports:
```ts
import {
  listOrders,
  getConfiguration,
  ApiError,
  type Order,
} from "@/lib/api"
```

With (remove `getConfiguration`):
```ts
import {
  listOrders,
  ApiError,
  type Order,
} from "@/lib/api"
```

Remove the entire `Promise.allSettled` block and `projectMap` dict. Find:
```ts
  // Resolve project_id for each order via its configuration.
  // Failures are silently skipped — those order rows render without a "View" link.
  const configResults = await Promise.allSettled(
    orders.map((o) => getConfiguration(token, o.configuration_id))
  )
  const projectMap: Record<string, string> = {}
  configResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      projectMap[orders[i].configuration_id] = result.value.project_id
    }
  })
```

Delete those lines entirely.

Then find the row rendering code that uses `projectMap`:
```tsx
                {orders.map((order) => {
                const projectId = projectMap[order.configuration_id]
                return (
                  <tr key={order.id} className="hover:bg-slate-700">
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-mono text-slate-400"
                        title={order.id}
                      >
                        {order.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 text-sm">
                      ${fmt(order.pricing_snapshot.total)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {order.crm_ref ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {projectId ? (
                        <Link
                          href={`/projects/${projectId}/orders/${order.id}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          View →
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
```

Replace with (use `order.project_id` directly, remove conditional rendering):
```tsx
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-700">
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-mono text-slate-400"
                        title={order.id}
                      >
                        {order.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 text-sm">
                      ${fmt(order.pricing_snapshot.total)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {order.crm_ref ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/projects/${order.project_id}/orders/${order.id}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
```

- [ ] **Step 6: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 57 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add lib/api.ts tests/lib/api.test.ts "app/(app)/orders/page.tsx" && git commit -m "feat: add project_id to Order type, simplify orders list page (sub-plan 18, task 2)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Push everything

- [ ] **Step 1: Run full backend suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 123 passed, 0 failures.

- [ ] **Step 2: Run full frontend checks**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 57 tests pass.

- [ ] **Step 3: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
