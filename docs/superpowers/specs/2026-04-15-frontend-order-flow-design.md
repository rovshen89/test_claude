# Frontend Order Flow — Design Spec (Sub-plan 4)
**Date:** 2026-04-15
**Status:** Approved

---

## Overview

Adds order creation and order detail viewing to the existing Next.js 15 App Router frontend. Users place orders from the 3D viewer page for confirmed configurations. The order detail page shows a pricing breakdown, BOM (cut list), and DXF/PDF download links derived from the order's stored snapshots. The project detail page gains "View Order →" links for in_production and completed configuration cards.

---

## Goals

- "Place Order" button in the 3D viewer sidebar for confirmed configurations with no unsaved changes
- `createOrderAction` Server Action calling `POST /orders` → redirects to order detail on success
- Order detail page at `/projects/[id]/orders/[orderId]` showing pricing breakdown, BOM panels, BOM hardware, and download links
- Project page shows "View Order →" links for `in_production` and `completed` cards (via `listOrders`)
- JWT never reaches the browser — all data fetching via Server Components, mutations via Server Actions

---

## Non-Goals (Sub-plan 4)

- Material catalog UI and material assignment to panels (Sub-plan 5)
- Pricing/BOM preview before placing order (requires `applied_config.panels` with material data — deferred to after material catalog)
- Webhook dispatch from the frontend
- Edit/cancel/delete order flow
- Paginated orders list page
- `not-found.tsx` specific to orders route (parent's not-found is sufficient)
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Architecture

```
frontend/
  lib/
    api.ts                    ← MODIFY: Order types + createOrder, getOrder, listOrders
  tests/
    lib/
      api.test.ts             ← MODIFY: 6 new tests for order API helpers
  app/
    actions/
      orders.ts               ← CREATE: createOrderAction Server Action
    (app)/
      projects/
        [id]/
          page.tsx            ← MODIFY: fetch listOrders, build orderMap, add "View Order" links
          configurations/
            [cfgId]/
              _components/
                ConfigurationViewer.tsx  ← MODIFY: "Place Order" button + isPlacingOrder/orderError state
          orders/
            [orderId]/
              page.tsx        ← CREATE: Server Component — auth + getOrder + render order detail
```

---

## Status Matrix

| Config status | Project card actions | 3D viewer sidebar actions |
|---|---|---|
| `draft` | Confirm only | No viewer |
| `confirmed` | View in 3D | Save as draft, Reset, **Place Order** (if no unsaved changes) |
| `in_production` | View in 3D, **View Order** | Read-only viewer |
| `completed` | View in 3D, **View Order** | Read-only viewer |

---

## Data Flow

### Placing an order

1. User navigates to `/projects/[id]/configurations/[cfgId]` for a confirmed config
2. User ensures no unsaved changes (Save as draft / Reset first if needed)
3. User clicks "Place Order" → `handlePlaceOrder()` calls `createOrderAction(configId, projectId)`
4. Server Action: `auth()` → `POST /orders` with `{ configuration_id: configId }` → on success `redirect("/projects/${projectId}/orders/${order.id}")`
5. Backend internally generates BOM + pricing, uploads DXF + PDF to S3, creates Order record with snapshots + export URLs
6. 401 → `redirect("/login")`, other `ApiError` → returns `{ error: message }` → shown in viewer sidebar

### Viewing an order

1. User arrives at `/projects/[id]/orders/[orderId]` (via redirect from Place Order or "View Order" link)
2. Server Component: `auth()` → `getOrder(token, orderId)` → renders order detail inline
3. 401 → `redirect("/login")`, 404 → `notFound()`
4. Pricing breakdown from `order.pricing_snapshot`, BOM from `order.bom_snapshot`, download links from `order.export_urls`

### Project page enrichment

1. `listOrders(token)` fetched alongside existing project + configurations fetches
2. `orderMap: Record<string, string>` built as `{ [order.configuration_id]: order.id }`
3. Cards for `in_production` and `completed` configs show "View Order →" link if `orderMap[cfg.id]` exists
4. If `listOrders` throws, `orderMap` stays empty — cards show without "View Order" links (non-critical)

---

## `lib/api.ts` Additions

### New types

```ts
export type PanelPricingRow = {
  name: string
  area_m2: number
  panel_cost: number
  edge_cost: number
}

export type PricingSnapshot = {
  panel_cost: number
  edge_cost: number
  hardware_cost: number
  labor_cost: number
  subtotal: number
  total: number
  breakdown: PanelPricingRow[]
}

export type BomPanelRow = {
  name: string
  material_name: string
  material_sku: string
  thickness_mm: number
  width_mm: number
  height_mm: number
  quantity: number
  grain_direction: string
  edge_left: boolean
  edge_right: boolean
  edge_top: boolean
  edge_bottom: boolean
  area_m2: number
}

export type BomHardwareRow = {
  name: string
  quantity: number
  unit_price: number
  total_price: number
}

export type BomSnapshot = {
  panels: BomPanelRow[]
  hardware: BomHardwareRow[]
  total_panels: number
  total_area_m2: number
}

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

### New functions

```ts
export async function createOrder(token: string, configurationId: string): Promise<Order>
// POST /orders with body { configuration_id: configurationId }

export async function getOrder(token: string, orderId: string): Promise<Order>
// GET /orders/{orderId}

export async function listOrders(token: string): Promise<Order[]>
// GET /orders
```

---

## `app/actions/orders.ts` (new file)

```ts
"use server"

export async function createOrderAction(
  configId: string,
  projectId: string
): Promise<{ error: string }> {
  // auth() → createOrder(token, configId) → redirect("/projects/${projectId}/orders/${order.id}")
  // 401 → redirect("/login")
  // other ApiError → return { error: message }
}
```

Return type is `Promise<{ error: string }>` — the success path always redirects (throws `NEXT_REDIRECT`), so the function never returns a value on success.

---

## `ConfigurationViewer.tsx` Changes

Add state:
```ts
const [isPlacingOrder, setIsPlacingOrder] = useState(false)
const [orderError, setOrderError] = useState<string | null>(null)
```

Add handler:
```ts
async function handlePlaceOrder() {
  setIsPlacingOrder(true)
  setOrderError(null)
  const result = await createOrderAction(configuration.id, projectId)
  if (result?.error) {
    setOrderError(result.error)
    setIsPlacingOrder(false)
  }
  // On success, createOrderAction calls redirect() — no further state update needed
}
```

Add "Place Order" section below the Save/Reset block (only when `!isReadOnly && configuration.status === "confirmed" && !hasUnsavedChanges`):
```tsx
{!isReadOnly && configuration.status === "confirmed" && !hasUnsavedChanges && (
  <>
    <hr className="border-slate-800" />
    {orderError && (
      <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
        {orderError}
      </div>
    )}
    <button
      onClick={handlePlaceOrder}
      disabled={isPlacingOrder}
      className="w-full py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
    >
      {isPlacingOrder ? "Placing order…" : "Place Order"}
    </button>
  </>
)}
```

Import: add `createOrderAction` from `@/app/actions/orders`.

---

## `projects/[id]/page.tsx` Changes

Fetch orders after the existing project + configurations + furniture types fetches:
```ts
let orders: Order[] = []
try {
  orders = await listOrders(token)
} catch {
  // Non-critical — page renders without order links if this fails
}
const orderMap = Object.fromEntries(orders.map((o) => [o.configuration_id, o.id]))
```

In the card action area:
```tsx
{cfg.status !== "draft" && (
  <Link href={`/projects/${id}/configurations/${cfg.id}`} ...>
    View in 3D →
  </Link>
)}
{(cfg.status === "in_production" || cfg.status === "completed") && orderMap[cfg.id] && (
  <Link href={`/projects/${id}/orders/${orderMap[cfg.id]}`} ...>
    View Order →
  </Link>
)}
```

Import: add `listOrders, type Order` to the import from `@/lib/api`.

---

## `/projects/[id]/orders/[orderId]/page.tsx` (new file)

Server Component:

1. `await params` for `id` and `orderId`
2. `auth()` → redirect `/login` if no token
3. `getOrder(token, orderId)` → 404 → `notFound()`, 401 → redirect `/login`
4. Destructure `pricing_snapshot`, `bom_snapshot`, `export_urls` from order
5. Render:
   - Header: back link to `/projects/${id}`, order ID (short), `created_at` date
   - **Pricing card**: six rows (Panel cost, Edge cost, Hardware cost, Labor cost, Subtotal, Total) as a two-column key/value table with currency formatting (`toFixed(2)`)
   - **Per-panel pricing table**: columns — Panel, Area m², Panel cost, Edge cost; one row per entry in `pricing_snapshot.breakdown`
   - **BOM panels table**: columns — Panel, Material, SKU, Thickness, W mm, H mm, Qty, Banding, Area m²; one row per entry in `bom_snapshot.panels`. Banding cell: comma-joined list of sides where edge_left/right/top/bottom is true (e.g., "L, R")
   - **BOM hardware table**: columns — Item, Qty, Unit price, Total; one row per entry in `bom_snapshot.hardware`. Hidden if `bom_snapshot.hardware` is empty.
   - **Downloads section**: two `<a>` elements linking to `export_urls.dxf` and `export_urls.pdf` with `target="_blank" rel="noopener noreferrer"`, styled as buttons.

---

## Error Handling

| Scenario | Handling |
|---|---|
| `createOrderAction` 401 | redirect `/login` |
| `createOrderAction` 409 | Returns `{ error }` → shown in viewer sidebar ("Order already exists for this configuration") |
| `createOrderAction` 422 | Returns `{ error }` → shown in viewer sidebar (backend message, e.g. "Configuration must be confirmed before ordering") |
| `createOrderAction` other error | Returns `{ error }` → shown in viewer sidebar |
| `getOrder` 404 | `notFound()` |
| `getOrder` 401 | redirect `/login` |
| `getOrder` 5xx | re-thrown → `error.tsx` boundary |
| `listOrders` fails on project page | Silently ignored — page renders without "View Order" links |
| "Place Order" shown with unsaved changes | Not shown — `!hasUnsavedChanges` condition prevents it |

---

## Testing

Jest unit tests in `frontend/tests/lib/api.test.ts` (6 new tests):

- `createOrder` — correct `POST /orders` URL + body `{ configuration_id }` + Authorization header, returns `Order`
- `createOrder` — non-ok response throws `ApiError`
- `getOrder` — correct `GET /orders/{id}` URL + Authorization header, returns `Order`
- `getOrder` — non-ok response throws `ApiError`
- `listOrders` — correct `GET /orders` URL + Authorization header, returns `Order[]`
- `listOrders` — non-ok response throws `ApiError`

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add Order types + createOrder, getOrder, listOrders |
| `frontend/tests/lib/api.test.ts` | Modify | Add 6 tests for order API helpers |
| `frontend/app/actions/orders.ts` | Create | createOrderAction Server Action |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Modify | Add Place Order button + state |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify | Add listOrders, orderMap, View Order links |
| `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx` | Create | Order detail Server Component |
