# Frontend Pricing & BOM Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pricing & BOM Preview page accessible from the confirmed configuration viewer, letting users see cost estimates and cut lists before placing an order.

**Architecture:** Two new `apiFetch`-based functions in `lib/api.ts` call `POST /pricing/calculate` and `POST /bom/generate`; the ConfigurationViewer sidebar gets a "Preview" link when the config is confirmed; a new Server Component page at `/projects/[id]/configurations/[cfgId]/preview` fetches both endpoints in parallel and renders the same table styles as the existing order detail page, with a small `PlaceOrderButton` client component.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, TypeScript, Jest.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `calculatePricing()` + `generateBom()` |
| `frontend/tests/lib/api.test.ts` | Modify | 4 new tests |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Modify | Add "Preview Pricing & BOM" link in sidebar |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/page.tsx` | Create | Server Component preview page |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/_components/PlaceOrderButton.tsx` | Create | "use client" order button |

---

## Background: Existing Patterns

**`apiFetch` in `lib/api.ts`** (always use this, never call `fetch` directly):
```ts
async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}
```

**Existing types in `lib/api.ts`** (no new types needed):
```ts
export type PanelPricingRow = { name: string; area_m2: number; panel_cost: number; edge_cost: number }
export type PricingSnapshot = {
  panel_cost: number; edge_cost: number; hardware_cost: number; labor_cost: number
  subtotal: number; total: number; breakdown: PanelPricingRow[]
}
export type BomPanelRow = {
  name: string; material_name: string; material_sku: string
  thickness_mm: number; width_mm: number; height_mm: number; quantity: number
  grain_direction: string; edge_left: boolean; edge_right: boolean; edge_top: boolean; edge_bottom: boolean
  area_m2: number
}
export type BomHardwareRow = { name: string; quantity: number; unit_price: number; total_price: number }
export type BomSnapshot = { panels: BomPanelRow[]; hardware: BomHardwareRow[]; total_panels: number; total_area_m2: number }
```

**Test mock convention:**
```ts
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Material not assigned" })
```

**Run tests:** `cd /Users/rovshennurybayev/claude_agents/frontend && npm test`
**Current test count:** 40 tests passing.

**`createOrderAction`** already exists at `frontend/app/actions/orders.ts` — signature:
```ts
export async function createOrderAction(configurationId: string, projectId: string): Promise<{ error?: string }>
```
On success it calls `redirect()` internally.

---

## Task 1: `lib/api.ts` — `calculatePricing` + `generateBom` (TDD)

**Files:**
- Modify: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1.1: Update the import block in `frontend/tests/lib/api.test.ts`**

Replace the entire existing import block (lines 1–30) with:

```ts
import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
  getFurnitureTypes,
  createFurnitureType,
  calculatePricing,
  generateBom,
  createConfiguration,
  confirmConfiguration,
  getConfiguration,
  updateConfiguration,
  createOrder,
  getOrder,
  listOrders,
  listMaterials,
  getMaterial,
  createMaterial,
  uploadMaterial,
  updateMaterial,
  dispatchOrder,
  type Order,
  type AppliedConfig,
  type Material,
  type MaterialCreate,
  type MaterialUpdate,
  type DispatchResponse,
  type FurnitureTypeCreate,
  type PricingSnapshot,
  type BomSnapshot,
} from "@/lib/api"
```

- [ ] **Step 1.2: Append 4 new tests at the end of `frontend/tests/lib/api.test.ts`**

Add after the last `describe` block (after the closing `}` of the `createFurnitureType` describe block):

```ts
describe("calculatePricing", () => {
  it("POSTs to /pricing/calculate with configuration_id and Authorization header, returns PricingSnapshot", async () => {
    const fixture: PricingSnapshot = {
      panel_cost: 120.5,
      edge_cost: 8.4,
      hardware_cost: 15.0,
      labor_cost: 22.0,
      subtotal: 165.9,
      total: 165.9,
      breakdown: [{ name: "Top Panel", area_m2: 0.72, panel_cost: 32.4, edge_cost: 2.1 }],
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await calculatePricing("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/pricing/calculate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ configuration_id: "cfg1" }),
      })
    )
    expect(result.total).toBe(165.9)
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0].name).toBe("Top Panel")
  })

  it("throws ApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Material not assigned" })
    await expect(calculatePricing("tok", "cfg1")).rejects.toMatchObject({ status: 422 })
  })
})

describe("generateBom", () => {
  it("POSTs to /bom/generate with configuration_id and Authorization header, returns BomSnapshot", async () => {
    const fixture: BomSnapshot = {
      panels: [
        {
          name: "Top Panel",
          material_name: "Oak Veneer",
          material_sku: "OAK-001",
          thickness_mm: 18,
          width_mm: 900,
          height_mm: 800,
          quantity: 1,
          grain_direction: "horizontal",
          edge_left: true,
          edge_right: true,
          edge_top: false,
          edge_bottom: false,
          area_m2: 0.72,
        },
      ],
      hardware: [],
      total_panels: 1,
      total_area_m2: 0.72,
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await generateBom("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/bom/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ configuration_id: "cfg1" }),
      })
    )
    expect(result.total_panels).toBe(1)
    expect(result.panels).toHaveLength(1)
    expect(result.panels[0].material_name).toBe("Oak Veneer")
    expect(result.total_area_m2).toBe(0.72)
  })

  it("throws ApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Material not assigned" })
    await expect(generateBom("tok", "cfg1")).rejects.toMatchObject({ status: 422 })
  })
})
```

- [ ] **Step 1.3: Run tests — verify 4 new tests fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -15
```

Expected: 4 failures (`calculatePricing is not a function`, `generateBom is not a function`). The existing 40 tests still pass.

- [ ] **Step 1.4: Append `calculatePricing` and `generateBom` to `frontend/lib/api.ts`**

Append after the last function in the file (after `createFurnitureType`):

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

- [ ] **Step 1.5: Run tests — verify all 44 pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 44 passed, 44 total`

- [ ] **Step 1.6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/lib/api.ts frontend/tests/lib/api.test.ts && git commit -m "feat: add calculatePricing and generateBom to api.ts"
```

---

## Task 2: `ConfigurationViewer.tsx` — Add Preview Link

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`

The sidebar currently has a conditional block starting at around line 365 that shows the "Place Order" button when the configuration is confirmed, has no unsaved changes, and all panels are assigned. The block looks like:

```tsx
{!isReadOnly && configuration.status === "confirmed" && !hasUnsavedChanges && allPanelsAssigned && (
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

- [ ] **Step 2.1: Read `ConfigurationViewer.tsx` to find the exact line numbers**

```bash
grep -n "Place Order\|allPanelsAssigned\|isPlacingOrder" /Users/rovshennurybayev/claude_agents/frontend/app/\(app\)/projects/\[id\]/configurations/\[cfgId\]/_components/ConfigurationViewer.tsx
```

Note the exact lines so you can make a precise edit.

- [ ] **Step 2.2: Add the "Preview Pricing & BOM" link above the "Place Order" button**

Find this exact block (the full content of the `<>...</>` fragment):

```tsx
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
```

Replace with:

```tsx
    <>
        <hr className="border-slate-800" />
        <Link
          href={`/projects/${projectId}/configurations/${configuration.id}/preview`}
          className="w-full py-2 rounded-md bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-sm font-medium transition-colors text-center block"
        >
          Preview Pricing &amp; BOM
        </Link>
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
```

Note: `Link` is already imported at line 5 of `ConfigurationViewer.tsx` — no import change needed. Use `&amp;` for the ampersand in JSX text, or use `{"&"}` — actually in JSX you can write `&` directly in string literals without escaping, but in JSX text content between tags it must be `&amp;` or wrapped: `Preview Pricing & BOM` with `&amp;`. Actually in JSX you CAN write `&` in text content — JSX handles it. Use `Preview Pricing & BOM` directly.

- [ ] **Step 2.3: Run tests — verify 44 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 44 passed, 44 total`

- [ ] **Step 2.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx" && git commit -m "feat: add Preview Pricing & BOM link to configuration viewer sidebar"
```

---

## Task 3: Preview Page + `PlaceOrderButton`

**Files:**
- Create: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/page.tsx`
- Create: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/_components/PlaceOrderButton.tsx`

- [ ] **Step 3.1: Create `PlaceOrderButton.tsx`**

Full content of `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/_components/PlaceOrderButton.tsx`:

```tsx
"use client"

import { useState } from "react"
import { createOrderAction } from "@/app/actions/orders"

export function PlaceOrderButton({
  configId,
  projectId,
}: {
  configId: string
  projectId: string
}) {
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
    // On success: createOrderAction redirects to the order detail page
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

- [ ] **Step 3.2: Create `preview/page.tsx`**

Full content of `frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import {
  getConfiguration,
  calculatePricing,
  generateBom,
  ApiError,
  type PricingSnapshot,
  type BomSnapshot,
} from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { PlaceOrderButton } from "./_components/PlaceOrderButton"

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function PricingBomPreviewPage({
  params,
}: {
  params: Promise<{ id: string; cfgId: string }>
}) {
  const { id, cfgId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let configuration
  try {
    configuration = await getConfiguration(token, cfgId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Only confirmed configurations can show a preview
  if (configuration.status !== "confirmed") {
    redirect(`/projects/${id}/configurations/${cfgId}`)
  }

  let pricing: PricingSnapshot | null = null
  let bom: BomSnapshot | null = null
  let previewError: string | null = null

  try {
    ;[pricing, bom] = await Promise.all([
      calculatePricing(token, cfgId),
      generateBom(token, cfgId),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError && e.status === 422) {
      previewError = "Cannot calculate preview: not all panels have materials assigned."
    } else {
      throw e
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link
          href={`/projects/${id}/configurations/${cfgId}`}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          ← Back to configuration
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline gap-4 mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Pricing & BOM Preview</h1>
        <span className="text-xs text-slate-500">
          Live estimate — not locked until an order is created
        </span>
      </div>

      {previewError && (
        <div className="bg-amber-950 border border-amber-900 rounded-md px-4 py-3 text-sm text-amber-300 mb-6">
          {previewError}
        </div>
      )}

      {pricing && (
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-y-2 text-sm max-w-xs">
            {(
              [
                ["Panel cost",    pricing.panel_cost],
                ["Edge cost",     pricing.edge_cost],
                ["Hardware cost", pricing.hardware_cost],
                ["Labor cost",    pricing.labor_cost],
                ["Subtotal",      pricing.subtotal],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-200 text-right">${fmt(value)}</span>
              </div>
            ))}
            <div className="col-span-2 border-t border-slate-700 my-1" />
            <span className="text-slate-100 font-semibold">Total</span>
            <span className="text-slate-100 font-semibold text-right">${fmt(pricing.total)}</span>
          </div>

          {pricing.breakdown.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs text-slate-400">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1.5 pr-4">Panel</th>
                    <th className="text-right py-1.5 pr-4">Area m²</th>
                    <th className="text-right py-1.5 pr-4">Panel cost</th>
                    <th className="text-right py-1.5">Edge cost</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.breakdown.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="py-1.5 pr-4">{row.name}</td>
                      <td className="text-right py-1.5 pr-4">{fmt(row.area_m2)}</td>
                      <td className="text-right py-1.5 pr-4">${fmt(row.panel_cost)}</td>
                      <td className="text-right py-1.5">${fmt(row.edge_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {bom && (
        <>
          <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-1">Cut List</h2>
            <p className="text-xs text-slate-500 mb-4">
              {bom.total_panels} panels · {fmt(bom.total_area_m2)} m² total
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-400 whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1.5 pr-4">Panel</th>
                    <th className="text-left py-1.5 pr-4">Material</th>
                    <th className="text-right py-1.5 pr-4">Thick</th>
                    <th className="text-right py-1.5 pr-4">W mm</th>
                    <th className="text-right py-1.5 pr-4">H mm</th>
                    <th className="text-right py-1.5 pr-4">Qty</th>
                    <th className="text-left py-1.5 pr-4">Banding</th>
                    <th className="text-right py-1.5">Area m²</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.panels.map((row, i) => {
                    const banding =
                      [
                        row.edge_left && "L",
                        row.edge_right && "R",
                        row.edge_top && "T",
                        row.edge_bottom && "B",
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"
                    return (
                      <tr key={i} className="border-b border-slate-800">
                        <td className="py-1.5 pr-4">{row.name}</td>
                        <td className="py-1.5 pr-4">{row.material_name}</td>
                        <td className="text-right py-1.5 pr-4">{row.thickness_mm}mm</td>
                        <td className="text-right py-1.5 pr-4">{row.width_mm}</td>
                        <td className="text-right py-1.5 pr-4">{row.height_mm}</td>
                        <td className="text-right py-1.5 pr-4">{row.quantity}</td>
                        <td className="py-1.5 pr-4">{banding}</td>
                        <td className="text-right py-1.5">{fmt(row.area_m2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {bom.hardware.length > 0 && (
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Hardware</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-400">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-1.5 pr-4">Item</th>
                      <th className="text-right py-1.5 pr-4">Qty</th>
                      <th className="text-right py-1.5 pr-4">Unit price</th>
                      <th className="text-right py-1.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.hardware.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800">
                        <td className="py-1.5 pr-4">{row.name}</td>
                        <td className="text-right py-1.5 pr-4">{row.quantity}</td>
                        <td className="text-right py-1.5 pr-4">${fmt(row.unit_price)}</td>
                        <td className="text-right py-1.5">${fmt(row.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {!previewError && (
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Ready to order?</h2>
          <PlaceOrderButton configId={cfgId} projectId={id} />
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3.3: Run tests — verify 44 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 44 passed, 44 total`

- [ ] **Step 3.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add \
  "frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/page.tsx" \
  "frontend/app/(app)/projects/[id]/configurations/[cfgId]/preview/_components/PlaceOrderButton.tsx" \
  && git commit -m "feat: add pricing & BOM preview page with place order button"
```
