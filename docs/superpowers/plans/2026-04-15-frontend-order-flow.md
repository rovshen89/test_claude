# Frontend Order Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add order creation and order detail viewing to the Next.js 15 frontend — users place orders from the 3D viewer, view pricing breakdowns, BOM cut lists, and download DXF/PDF exports.

**Architecture:** Server Action `createOrderAction` calls `POST /orders`, which returns a stored order with `pricing_snapshot`, `bom_snapshot`, and `export_urls`. All data fetching is server-side; the order detail page is a pure Server Component rendering the stored snapshots. The project page gains "View Order →" links via a server-side `listOrders` call.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, TypeScript, Jest.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Order types (`Order`, `PricingSnapshot`, `BomSnapshot`, etc.) + `createOrder`, `getOrder`, `listOrders` functions |
| `frontend/tests/lib/api.test.ts` | Modify | 6 new Jest tests for the three new API helpers |
| `frontend/app/actions/orders.ts` | Create | `createOrderAction` Server Action |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Modify | "Place Order" button + `isPlacingOrder` / `orderError` state |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify | Fetch `listOrders`, build `orderMap`, add "View Order →" links |
| `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx` | Create | Order detail Server Component (pricing table, BOM tables, download links) |

---

## Background: existing API conventions

`frontend/lib/api.ts` uses a private `apiFetch<T>` helper that adds `Authorization: Bearer {token}` and `Content-Type: application/json` to every request and throws `ApiError(status, message)` on non-ok responses. All new functions must use this helper — do not call `fetch` directly.

Existing function pattern to follow:
```ts
export async function getProject(token: string, id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`, token)
}
```

---

## Background: existing Server Action conventions

`frontend/app/actions/configurations.ts` establishes the pattern:
- `"use server"` at top
- `auth()` to get token → `redirect("/login")` if missing
- try/catch for `ApiError` — 401 → `redirect("/login")`, others → `return { error: e.message }`
- re-throw unknown errors (non-`ApiError`)
- success path calls `redirect(...)` which throws `NEXT_REDIRECT` internally — the function never returns a value on success
- return type `Promise<{ error: string }>` even though success always redirects

---

## Background: existing test conventions

`frontend/tests/lib/api.test.ts` tests use:
```ts
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
// or for errors:
mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
```

Each `describe` block tests one exported function. `beforeEach` resets `mockFetch` and sets `process.env.BACKEND_URL = "http://localhost:8000"`.

---

## Task 1: Order API types and helpers (TDD)

**Files:**
- Test: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Append 6 failing tests to `frontend/tests/lib/api.test.ts`**

Add the following three `describe` blocks at the end of the file (after the existing `updateConfiguration` describe block). The import line at the top of the file also needs updating.

First, update the import at line 1–13 to add `createOrder, getOrder, listOrders` and the `Order` type:

```ts
import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
  getFurnitureTypes,
  createConfiguration,
  confirmConfiguration,
  getConfiguration,
  updateConfiguration,
  createOrder,
  getOrder,
  listOrders,
  type Order,
} from "@/lib/api"
```

Then append at the end of the file:

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

describe("createOrder", () => {
  it("posts to /orders with configuration_id and returns Order", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => orderFixture })

    const result = await createOrder("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ configuration_id: "cfg1" }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("ord1")
    expect(result.pricing_snapshot.total).toBe(192)
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Order already exists" })
    await expect(createOrder("tok", "cfg1")).rejects.toMatchObject({ status: 409 })
  })
})

describe("getOrder", () => {
  it("calls GET /orders/{id} with Authorization header and returns Order", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => orderFixture })

    const result = await getOrder("tok", "ord1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders/ord1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("ord1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getOrder("tok", "missing")).rejects.toMatchObject({ status: 404 })
  })
})

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

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --testPathPattern="api.test" 2>&1 | tail -20
```

Expected: 6 new tests fail with `SyntaxError` or "is not a function" — `createOrder`, `getOrder`, `listOrders` don't exist yet.

- [ ] **Step 3: Add Order types and helpers to `frontend/lib/api.ts`**

Append the following to the end of `frontend/lib/api.ts` (after the existing `updateConfiguration` function):

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

export async function createOrder(token: string, configurationId: string): Promise<Order> {
  return apiFetch<Order>("/orders", token, {
    method: "POST",
    body: JSON.stringify({ configuration_id: configurationId }),
  })
}

export async function getOrder(token: string, orderId: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}`, token)
}

export async function listOrders(token: string): Promise<Order[]> {
  return apiFetch<Order[]>("/orders", token)
}
```

- [ ] **Step 4: Run tests to confirm all 26 pass**

```bash
cd frontend && npm test -- --testPathPattern="api.test" 2>&1 | tail -10
```

Expected: `Tests: 26 passed, 26 total`

- [ ] **Step 5: Commit**

```bash
cd frontend && git add lib/api.ts tests/lib/api.test.ts && git commit -m "feat: add Order types and createOrder/getOrder/listOrders API helpers"
```

---

## Task 2: createOrderAction Server Action

**Files:**
- Create: `frontend/app/actions/orders.ts`

- [ ] **Step 1: Create `frontend/app/actions/orders.ts`**

```ts
"use server"

import { auth } from "@/lib/auth"
import { createOrder, ApiError, type Order } from "@/lib/api"
import { redirect } from "next/navigation"

export async function createOrderAction(
  configId: string,
  projectId: string
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  let order: Order
  try {
    order = await createOrder(token, configId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  redirect(`/projects/${projectId}/orders/${order.id}`)
}
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Expected: `Tests: 26 passed, 26 total`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add app/actions/orders.ts && git commit -m "feat: add createOrderAction Server Action"
```

---

## Task 3: "Place Order" button in ConfigurationViewer

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`

The current file is 216 lines. Replace it entirely with the following. The only changes vs the current file are: (1) new import `createOrderAction`, (2) two new state variables `isPlacingOrder` and `orderError`, (3) new `handlePlaceOrder` async function, (4) new "Place Order" JSX block at the end of the sidebar.

- [ ] **Step 1: Replace `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`**

```tsx
"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { updateConfigurationAction } from "@/app/actions/configurations"
import { createOrderAction } from "@/app/actions/orders"
import type { Configuration, FurnitureType } from "@/lib/api"

const BabylonSceneDynamic = dynamic(() => import("./BabylonScene"), { ssr: false })

type DimensionSpec = { min: number; max: number; step: number; default: number }
type Schema = { dimensions?: Record<string, DimensionSpec> }

type Props = {
  configuration: Configuration
  furnitureType: FurnitureType
  projectId: string
  isReadOnly: boolean
}

function statusColors(status: string): string {
  switch (status) {
    case "draft":         return "bg-cyan-950 text-cyan-300"
    case "confirmed":     return "bg-blue-950 text-blue-300"
    case "in_production": return "bg-amber-950 text-amber-300"
    case "completed":     return "bg-green-950 text-green-400"
    default:              return "bg-slate-800 text-slate-400"
  }
}

export function ConfigurationViewer({ configuration, furnitureType, projectId, isReadOnly }: Props) {
  const schema = furnitureType.schema as Schema
  const dimSpecs = schema.dimensions ?? {}

  const savedDimensions = configuration.applied_config as Record<string, number>
  const [dimensions, setDimensions] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.entries(dimSpecs).map(([k, s]) => [k, savedDimensions[k] ?? s.default])
    )
  )
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const hasUnsavedChanges = Object.keys(dimSpecs).some(
    (key) => dimensions[key] !== savedDimensions[key]
  )
  const hasInputErrors = Object.keys(inputErrors).length > 0

  function handleSliderChange(key: string, value: number) {
    setDimensions((prev) => ({ ...prev, [key]: value }))
    setInputErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleInputChange(key: string, raw: string, spec: DimensionSpec) {
    if (raw.trim() === "") {
      setInputErrors((prev) => ({ ...prev, [key]: `Must be between ${spec.min} and ${spec.max} mm` }))
      return
    }
    const num = Number(raw)
    if (!Number.isFinite(num) || num < spec.min || num > spec.max) {
      setInputErrors((prev) => ({
        ...prev,
        [key]: `Must be between ${spec.min} and ${spec.max} mm`,
      }))
      return
    }
    setInputErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDimensions((prev) => ({ ...prev, [key]: num }))
  }

  function handleReset() {
    setDimensions(
      Object.fromEntries(
        Object.entries(dimSpecs).map(([k, s]) => [k, savedDimensions[k] ?? s.default])
      )
    )
    setInputErrors({})
    setSaveError(null)
  }

  async function handleSave() {
    if (hasInputErrors) return
    setIsSaving(true)
    setSaveError(null)
    const result = await updateConfigurationAction(configuration.id, projectId, dimensions)
    if (result?.error) {
      setSaveError(result.error)
      setIsSaving(false)
    }
    // On success, updateConfigurationAction calls redirect() — no further state update needed
  }

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

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Viewer header */}
      <div className="bg-slate-800 border-b border-slate-700 px-5 h-12 flex items-center justify-between flex-shrink-0">
        <Link href={`/projects/${projectId}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">{furnitureType.category}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors(configuration.status)}`}>
            {configuration.status}
          </span>
        </div>
        <span className="text-xs text-slate-500">orbit · pan · zoom</span>
      </div>

      {/* Canvas + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3D canvas area */}
        <div className="flex-1 relative bg-slate-950">
          <BabylonSceneDynamic dimensions={dimensions} schema={furnitureType.schema} />
        </div>

        {/* Sidebar */}
        <div className="w-64 bg-slate-950 border-l border-slate-800 p-4 flex flex-col gap-3 overflow-y-auto flex-shrink-0">
          <p className="text-xs uppercase tracking-widest text-slate-500">Dimensions</p>

          {Object.entries(dimSpecs).map(([key, spec]) => (
            <div key={key} className="mb-1">
              <span className="block text-xs text-slate-400 mb-1.5 capitalize">{key} (mm)</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={1}
                  value={dimensions[key] ?? spec.default}
                  disabled={isReadOnly}
                  onChange={(e) => handleSliderChange(key, Number(e.target.value))}
                  className="flex-1 h-1 rounded accent-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                />
                <input
                  type="number"
                  defaultValue={dimensions[key] ?? spec.default}
                  key={`${key}-${dimensions[key]}`}
                  disabled={isReadOnly}
                  onBlur={(e) => handleInputChange(key, e.target.value, spec)}
                  className={`w-20 bg-slate-800 border rounded-md px-2 py-1.5 text-xs font-semibold text-right text-slate-100 outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    inputErrors[key]
                      ? "border-red-500 text-red-400"
                      : "border-slate-700 focus:border-indigo-500"
                  }`}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-700 mt-1">
                <span>{spec.min}</span>
                <span>{spec.max}</span>
              </div>
              {inputErrors[key] && (
                <p className="text-xs text-red-400 mt-1">{inputErrors[key]}</p>
              )}
            </div>
          ))}

          <hr className="border-slate-800" />

          {isReadOnly && (
            <div className="bg-green-950 border border-green-900 rounded-md px-3 py-2 text-xs text-green-400">
              This configuration is <strong>{configuration.status}</strong> — dimensions are locked.
              Orbit and zoom are still available.
            </div>
          )}

          {!isReadOnly && hasUnsavedChanges && (
            <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle" />
              Unsaved changes
            </div>
          )}
          {!isReadOnly && hasUnsavedChanges && configuration.status === "confirmed" && (
            <div className="bg-blue-950 border border-blue-900 rounded-md px-3 py-2 text-xs text-blue-300">
              <strong>Editing confirmed config</strong> — saving resets status to draft.
              Re-confirm from the project page when ready.
            </div>
          )}

          {saveError && (
            <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
              {saveError}
            </div>
          )}

          {!isReadOnly && (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving || hasInputErrors}
                className="w-full py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {isSaving ? "Saving…" : "Save as draft"}
              </button>
              <button
                onClick={handleReset}
                disabled={isSaving || !hasUnsavedChanges}
                className="w-full py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-sm font-medium transition-colors"
              >
                Reset to saved
              </button>
            </>
          )}

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
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Expected: `Tests: 26 passed, 26 total`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx && git commit -m "feat: add Place Order button to ConfigurationViewer sidebar"
```

---

## Task 4: "View Order" links on project page

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`

Replace the entire file with the following. Changes vs the current file: (1) add `listOrders, type Order` to the import from `@/lib/api`, (2) add `listOrders` call and `orderMap` after the furniture types fetch, (3) add "View Order →" `<Link>` in the card action area for `in_production` and `completed` cards that have an order.

- [ ] **Step 1: Replace `frontend/app/(app)/projects/[id]/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import {
  getProject,
  listConfigurations,
  getFurnitureType,
  listOrders,
  ApiError,
  type Project,
  type Configuration,
  type FurnitureType,
  type Order,
} from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ConfirmButton } from "./_components/ConfirmButton"

function statusColors(status: string): string {
  switch (status) {
    case "draft":
      return "bg-cyan-950 text-cyan-300"
    case "confirmed":
      return "bg-blue-950 text-blue-300"
    case "in_production":
      return "bg-amber-950 text-amber-300"
    case "completed":
      return "bg-green-950 text-green-400"
    default:
      return "bg-slate-800 text-slate-400"
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  // Definite-assignment assertions (`!`) tell TypeScript the try block always assigns
  // these or throws (via notFound() / re-throw), so they're safe to use below.
  let project!: Project
  let configs!: Configuration[]
  try {
    ;[project, configs] = await Promise.all([
      getProject(token, id),
      listConfigurations(token, id),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Fetch furniture type names for all unique IDs in parallel
  const uniqueFtIds = [...new Set(configs.map((c) => c.furniture_type_id))]
  let ftList: FurnitureType[] = []
  try {
    ftList = await Promise.all(uniqueFtIds.map((ftId) => getFurnitureType(token, ftId)))
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }
  const ftMap = Object.fromEntries(ftList.map((ft) => [ft.id, ft.category]))

  // Fetch orders to build configId → orderId map for "View Order" links.
  // Failure is non-critical: page renders without "View Order" links.
  let orders: Order[] = []
  try {
    orders = await listOrders(token)
  } catch {
    // intentionally ignored
  }
  const orderMap = Object.fromEntries(orders.map((o) => [o.configuration_id, o.id]))

  return (
    <div>
      <div className="mb-2">
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
      </div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold text-slate-50">{project.name}</h1>
        <Link
          href={`/projects/${id}/configurations/new`}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Configuration
        </Link>
      </div>
      {configs.length === 0 ? (
        <p className="text-slate-500 text-sm">No configurations yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {ftMap[cfg.furniture_type_id] ?? "Unknown type"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono" title={cfg.id}>
                    {cfg.id.slice(0, 8)}…
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${statusColors(cfg.status)}`}
                >
                  {cfg.status}
                </span>
              </div>
              <div className="mt-3 flex justify-end gap-3">
                {cfg.status === "draft" && (
                  <ConfirmButton configId={cfg.id} projectId={id} />
                )}
                {cfg.status !== "draft" && (
                  <Link
                    href={`/projects/${id}/configurations/${cfg.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    View in 3D →
                  </Link>
                )}
                {(cfg.status === "in_production" || cfg.status === "completed") &&
                  orderMap[cfg.id] && (
                    <Link
                      href={`/projects/${id}/orders/${orderMap[cfg.id]}`}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      View Order →
                    </Link>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Expected: `Tests: 26 passed, 26 total`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add app/(app)/projects/[id]/page.tsx && git commit -m "feat: add View Order links to project page for in_production and completed configs"
```

---

## Task 5: Order detail page

**Files:**
- Create: `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx`

Note: `[id]` is the project ID; `[orderId]` is the order ID. The directory must be created as well.

- [ ] **Step 1: Create `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getOrder, ApiError, type Order } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>
}) {
  const { id, orderId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let order!: Order
  try {
    order = await getOrder(token, orderId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  const pricing = order.pricing_snapshot
  const bom = order.bom_snapshot

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link href={`/projects/${id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline gap-4 mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Order</h1>
        <span className="text-xs font-mono text-slate-500">{order.id}</span>
        <span className="text-xs text-slate-500">
          {new Date(order.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Pricing summary */}
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

      {/* BOM panels */}
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

      {/* BOM hardware — rendered only when non-empty */}
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

      {/* Downloads */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Downloads</h2>
        <div className="flex gap-3">
          <a
            href={order.export_urls.dxf}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-medium transition-colors"
          >
            Download DXF
          </a>
          <a
            href={order.export_urls.pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-medium transition-colors"
          >
            Download PDF
          </a>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Expected: `Tests: 26 passed, 26 total`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add "app/(app)/projects/[id]/orders/[orderId]/page.tsx" && git commit -m "feat: add order detail page with pricing, BOM, and download links"
```
