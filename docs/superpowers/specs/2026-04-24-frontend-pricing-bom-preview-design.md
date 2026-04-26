# Frontend Pricing & BOM Preview — Design Spec (Sub-plan 9)
**Date:** 2026-04-24
**Status:** Approved

---

## Overview

Adds a Pricing & BOM Preview page accessible from the configuration viewer sidebar. Once a configuration is confirmed and all panels have materials assigned, users can navigate to `/projects/[id]/configurations/[cfgId]/preview` to see a live cost estimate and cut list before committing to an order.

---

## Goals

- Users can preview pricing and bill of materials before placing an order
- Preview calls the same backend endpoints the order creation uses internally
- UI reuses the table styles from the existing order detail page
- The preview page includes a "Place Order" button so users can act on what they see

---

## Non-Goals

- Caching or persisting the preview result (it's always fresh from the backend)
- Showing the preview for draft configurations (must be confirmed)
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Client Component for the order button, Jest unit tests.

---

## Backend Contract

**`POST /pricing/calculate`** (authenticated):
```json
{ "configuration_id": "<uuid>" }
```
Returns `PricingResponse` (same shape as the existing `PricingSnapshot` type in `lib/api.ts`):
```json
{
  "panel_cost": 120.50,
  "edge_cost": 8.40,
  "hardware_cost": 15.00,
  "labor_cost": 22.00,
  "subtotal": 165.90,
  "total": 165.90,
  "breakdown": [
    { "name": "Top Panel", "area_m2": 0.72, "panel_cost": 32.40, "edge_cost": 2.10 }
  ]
}
```

**`POST /bom/generate`** (authenticated):
```json
{ "configuration_id": "<uuid>" }
```
Returns `BomResponse` (same shape as the existing `BomSnapshot` type in `lib/api.ts`):
```json
{
  "panels": [
    {
      "name": "Top Panel", "material_name": "Oak Veneer", "material_sku": "OAK-001",
      "thickness_mm": 18, "width_mm": 900, "height_mm": 800, "quantity": 1,
      "grain_direction": "horizontal",
      "edge_left": true, "edge_right": true, "edge_top": false, "edge_bottom": false,
      "area_m2": 0.72
    }
  ],
  "hardware": [],
  "total_panels": 1,
  "total_area_m2": 0.72
}
```

**Backend error statuses:**
| Status | Cause |
|--------|-------|
| 200 | Success |
| 401 | Token invalid |
| 404 | Configuration not found |
| 422 | Material not assigned to a panel |

---

## Architecture

```
frontend/
  lib/
    api.ts                                         ← MODIFY: add calculatePricing + generateBom
  tests/
    lib/
      api.test.ts                                  ← MODIFY: 4 new tests
  app/
    (app)/
      projects/[id]/configurations/[cfgId]/
        _components/
          ConfigurationViewer.tsx                  ← MODIFY: add Preview link in sidebar
        preview/
          page.tsx                                 ← CREATE: Server Component preview page
          _components/
            PlaceOrderButton.tsx                   ← CREATE: "use client" order button
```

---

## `lib/api.ts` Additions

Both functions reuse the existing `PricingSnapshot` and `BomSnapshot` types — no new types needed.

```ts
export async function calculatePricing(
  token: string,
  configId: string
): Promise<PricingSnapshot> {
  return apiFetch<PricingSnapshot>("/pricing/calculate", token, {
    method: "POST",
    body: JSON.stringify({ configuration_id: configId }),
  })
}

export async function generateBom(
  token: string,
  configId: string
): Promise<BomSnapshot> {
  return apiFetch<BomSnapshot>("/bom/generate", token, {
    method: "POST",
    body: JSON.stringify({ configuration_id: configId }),
  })
}
```

---

## `ConfigurationViewer.tsx` Modification

In the sidebar, in the `configuration.status === "confirmed" && !hasUnsavedChanges && allPanelsAssigned` block, add a "Preview Pricing & BOM" link **above** the existing "Place Order" button:

```tsx
<Link
  href={`/projects/${projectId}/configurations/${configuration.id}/preview`}
  className="w-full py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-sm font-medium transition-colors text-center block"
>
  Preview Pricing & BOM
</Link>
```

The `href` uses `configuration.id` (the configuration's own ID, not the URL param `cfgId`).

---

## Pages

### `/app/(app)/projects/[id]/configurations/[cfgId]/preview/page.tsx`

Server Component. Receives `{ id, cfgId }` from params.

1. Auth guard: `redirect("/login")` if no token
2. Fetch `getConfiguration(token, cfgId)` — 404 → `notFound()`, 401 → `redirect("/login")`
3. If `configuration.status !== "confirmed"`, `redirect(`/projects/${id}/configurations/${cfgId}`)` (only confirmed configs can be previewed; in_production/completed already have an order)
4. Fetch `calculatePricing(token, cfgId)` and `generateBom(token, cfgId)` in parallel with `Promise.all`
   - 422 → show inline error: "Cannot calculate preview: not all panels have materials assigned."
   - 401 → `redirect("/login")`
   - Other → throw
5. Display pricing summary grid + breakdown table (same layout as order detail page)
6. Display BOM panels table (same layout as order detail page)
7. Display BOM hardware table if non-empty
8. Render `<PlaceOrderButton configId={cfgId} projectId={id} />`

**Pricing summary layout** (same as order detail):
- Grid: Panel cost, Edge cost, Hardware cost, Labor cost, Subtotal, divider, Total
- Breakdown table: Panel | Area m² | Panel cost | Edge cost

**BOM cut list layout** (same as order detail):
- Summary: `{bom.total_panels} panels · {fmt(bom.total_area_m2)} m² total`
- Table: Panel | Material | Thick | W mm | H mm | Qty | Banding | Area m²

**BOM hardware table** (same as order detail, hidden if empty):
- Table: Item | Qty | Unit price | Total

---

## `PlaceOrderButton.tsx` ("use client")

```tsx
"use client"

import { useState } from "react"
import { createOrderAction } from "@/app/actions/orders"

export function PlaceOrderButton({ configId, projectId }: { configId: string; projectId: string }) {
  const [isPlacing, setIsPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setIsPlacing(true)
    setError(null)
    const result = await createOrderAction(configId, projectId)
    if (result?.error) {
      setError(result.error)
      setIsPlacing(false)
    }
    // On success: createOrderAction redirects
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={isPlacing}
        className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isPlacing ? "Placing order…" : "Place Order"}
      </button>
    </div>
  )
}
```

---

## Testing

4 new Jest tests in `frontend/tests/lib/api.test.ts`:

| Function | Case | Expected |
|----------|------|----------|
| `calculatePricing` | ok | POSTs `{ configuration_id }` with Auth header, returns PricingSnapshot |
| `calculatePricing` | 422 | throws ApiError with status 422 |
| `generateBom` | ok | POSTs `{ configuration_id }` with Auth header, returns BomSnapshot |
| `generateBom` | 422 | throws ApiError with status 422 |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| 401 (auth) | `redirect("/login")` in page component |
| 404 (config not found) | `notFound()` in page component |
| 422 (missing material) | Inline error message on preview page: "Cannot calculate preview: not all panels have materials assigned." |
| Unknown | Re-thrown (Next.js error boundary) |
| Status not "confirmed" | Redirect back to configuration viewer |

---

## File Summary

| File | Action |
|------|--------|
| `frontend/lib/api.ts` | Modify — add `calculatePricing` + `generateBom` |
| `frontend/tests/lib/api.test.ts` | Modify — 4 new tests |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Modify — add "Preview Pricing & BOM" link |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/page.tsx` | Create — preview Server Component |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/_components/PlaceOrderButton.tsx` | Create — client order button |
