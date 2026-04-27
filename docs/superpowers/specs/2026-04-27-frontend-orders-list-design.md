# Frontend Orders List — Design Spec (Sub-plan 11)
**Date:** 2026-04-27
**Status:** Approved

---

## Overview

Adds a global `/orders` page that lists all orders for the authenticated user. Each order row links to the existing project-scoped order detail page (`/projects/[id]/orders/[orderId]`). A nav link is added to the app layout.

---

## Goals

- Users can view all their orders in one place without navigating per-project
- Each order row is clickable to the existing order detail page
- Follows established page patterns (Server Component, no new API types)

---

## Non-Goals

- Standalone `/orders/[orderId]` detail page (existing project-scoped detail is sufficient)
- Filtering, pagination, or sorting
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components, Jest unit tests.

---

## Backend Contract

**`GET /orders`** (authenticated):

Returns `Order[]` — scoped to the authenticated user by JWT. Already in `lib/api.ts` as `listOrders(token)`.

No new backend endpoint needed.

---

## Architecture

```
frontend/
  app/
    (app)/
      layout.tsx              ← MODIFY: add "Orders" nav link
      orders/
        page.tsx              ← CREATE: orders list Server Component
```

No changes to `lib/api.ts` — `listOrders` and `getConfiguration` already exist.

---

## Data Flow

The orders list page needs a link to each order's detail page. The detail page URL is `/projects/${projectId}/orders/${orderId}`, which requires `project_id`. The `Order` type only has `configuration_id`, so we resolve `project_id` by fetching each configuration in parallel.

Steps:
1. `listOrders(token)` → `Order[]`
2. `Promise.all(orders.map(o => getConfiguration(token, o.configuration_id)))` → `Configuration[]`
   - Build `configId → project_id` map
   - If any configuration fetch fails (404 or other), the order row renders without a link (graceful degradation)
3. Render table

---

## `app/(app)/layout.tsx` Modification

Add an "Orders" nav link between "Materials" and "Furniture Types":

```tsx
<Link href="/orders" className="text-xs text-slate-400 hover:text-slate-200">
  Orders
</Link>
```

---

## `app/(app)/orders/page.tsx`

Server Component. No params.

1. Auth guard: redirect to `/login` if no token
2. `listOrders(token)` — on 401 redirect to `/login`; other errors rethrow
3. `Promise.all` fetches configurations for all orders (to get `project_id`):
   - Any individual failure silently skips that config (builds partial map)
4. Render:
   - If no orders: `<p className="text-slate-500 text-sm">No orders yet.</p>`
   - If orders: table with columns: Order ID | Date | Total | CRM ref | Action

**Table columns:**

| Column | Source | Display |
|--------|--------|---------|
| Order ID | `order.id.slice(0, 8)…` | monospace, `title={order.id}` |
| Date | `order.created_at` | `new Date(order.created_at).toLocaleDateString()` |
| Total | `order.pricing_snapshot.total` | `$${total.toFixed(2)}` |
| CRM Ref | `order.crm_ref` | value or `—` if null |
| Action | `configId → projectId` map | `"View →"` link if projectId known; `"—"` if not |

"View →" link href: `/projects/${projectId}/orders/${orderId}`, class `text-xs text-indigo-400 hover:text-indigo-300 font-medium`

**Table styling**: matches the BOM/order detail table pattern — `bg-slate-800 border border-slate-700 rounded-lg`, `divide-y divide-slate-700`, header row `text-xs text-slate-400`, body rows `text-sm text-slate-200`.

---

## Testing

No new `lib/api.ts` functions → no new unit tests required. `listOrders` and `getConfiguration` are already tested.

---

## File Summary

| File | Action |
|------|--------|
| `frontend/app/(app)/layout.tsx` | Modify — add "Orders" nav link |
| `frontend/app/(app)/orders/page.tsx` | Create — orders list Server Component |
