# Frontend Material Catalog UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the frontend so `applied_config` always stores the full `AppliedConfig` structure (`{ dimensions, panels, hardware_list }`) and add a panel-material assignment UI to the 3D viewer sidebar, enabling end-to-end order placement.

**Architecture:** `lib/api.ts` gains `Material` type, `AppliedConfig`-family types, `listMaterials`, and updated `createConfiguration`/`updateConfiguration` signatures. The viewer Server Component page fetches materials server-side and passes them as props. `ConfigurationViewer` adds a "Materials" section where users pick a material and thickness per panel template (from `furnitureType.schema.panels`); the full `AppliedConfig` is sent on every save.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, TypeScript, Jest.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `Material`, `EdgeBanding`, `PanelSpec`, `HardwareItem`, `AppliedConfig` types; add `listMaterials`; update `createConfiguration`/`updateConfiguration` signatures |
| `frontend/tests/lib/api.test.ts` | Modify | 2 new tests for `listMaterials`; update `createConfiguration` + `updateConfiguration` tests to use new `AppliedConfig` format |
| `frontend/app/actions/configurations.ts` | Modify | Update `createConfigurationAction` + `updateConfigurationAction` parameter types to `AppliedConfig` |
| `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` | Modify | Submit `{ dimensions, panels: [], hardware_list: [] }` instead of raw dimension map |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx` | Modify | Fetch `listMaterials`, pass `materials` prop to `ConfigurationViewer` |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Modify | `PanelAssignment` state, Materials section JSX, extended `hasUnsavedChanges`, `allPanelsAssigned`, updated `handleSave`/`handleReset` |

---

## Background: existing code patterns

**`apiFetch` helper** in `frontend/lib/api.ts` (never call `fetch` directly):
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

**Existing types in `lib/api.ts`** (do not re-add):
`Project`, `Configuration`, `FurnitureType`, `Order`, `PricingSnapshot`, `BomSnapshot`, `PanelPricingRow`, `BomPanelRow`, `BomHardwareRow`.

**Test conventions** (`frontend/tests/lib/api.test.ts`):
```ts
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
// errors:
mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
```

**Server Action pattern** (from `frontend/app/actions/configurations.ts`):
```ts
"use server"
const session = await auth()
if (!session?.user?.access_token) redirect("/login")
const token = session.user.access_token
try {
  await someApiCall(token, ...)
} catch (e) {
  if (e instanceof ApiError && e.status === 401) redirect("/login")
  if (e instanceof ApiError) return { error: e.message }
  throw e
}
```

**Current `applied_config` shape** stored by existing configs:
- Old format: `{ width: 900, height: 1800, depth: 400 }` (flat dimension map)
- New format after this plan: `{ dimensions: { width: 900, height: 1800, depth: 400 }, panels: [...], hardware_list: [] }`

The viewer must handle both formats (old configs still in database).

**`isReadOnly` in ConfigurationViewer** is `true` only for `in_production` and `completed`. Confirmed configs are editable (though the backend returns 400 on save — pre-existing behavior).

**`allPanelsAssigned` gate:** "Place Order" shows only when all panel templates in `schema.panels` have both `materialId` and `thickness_mm` selected. If `schema.panels` is absent or empty, `allPanelsAssigned = true` (no panels to assign).

---

## Task 1: `lib/api.ts` — new types + `listMaterials` + updated signatures (TDD)

**Files:**
- Modify: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/lib/api.ts`

### Step 1.1: Add failing tests

Open `frontend/tests/lib/api.test.ts`. Make the following changes:

**1a. Update imports** (replace the current import block at the top of the file):

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
  listMaterials,
  type Order,
  type AppliedConfig,
  type Material,
} from "@/lib/api"
```

**1b. Update the `createConfiguration` describe block** (replace current describe starting at `describe("createConfiguration"`):

```ts
describe("createConfiguration", () => {
  it("posts to /configurations with project_id, furniture_type_id, applied_config", async () => {
    const fixture = {
      id: "c1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { dimensions: { width: 900 }, panels: [], hardware_list: [] },
      placement: null,
      status: "draft",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const appliedConfig: AppliedConfig = {
      dimensions: { width: 900 },
      panels: [],
      hardware_list: [],
    }
    const result = await createConfiguration("tok", "p1", "ft1", appliedConfig)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project_id: "p1",
          furniture_type_id: "ft1",
          applied_config: appliedConfig,
        }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("c1")
    expect(result.status).toBe("draft")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "bad request" })
    const appliedConfig: AppliedConfig = { dimensions: { width: 900 }, panels: [], hardware_list: [] }
    await expect(createConfiguration("tok", "p1", "ft1", appliedConfig)).rejects.toMatchObject({ status: 422 })
  })
})
```

**1c. Update the `updateConfiguration` describe block** (replace current describe starting at `describe("updateConfiguration"`):

```ts
describe("updateConfiguration", () => {
  it("calls PUT /configurations/{id} with applied_config body and Authorization header", async () => {
    const fixture = {
      id: "cfg1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { dimensions: { width: 1000, height: 720, depth: 300 }, panels: [], hardware_list: [] },
      placement: null,
      status: "draft",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const appliedConfig: AppliedConfig = {
      dimensions: { width: 1000, height: 720, depth: 300 },
      panels: [],
      hardware_list: [],
    }
    const result = await updateConfiguration("tok", "cfg1", appliedConfig)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ applied_config: appliedConfig }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("cfg1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Only draft configurations can be modified",
    })
    const appliedConfig: AppliedConfig = { dimensions: { width: 900 }, panels: [], hardware_list: [] }
    await expect(
      updateConfiguration("tok", "cfg1", appliedConfig)
    ).rejects.toMatchObject({ status: 400 })
  })
})
```

**1d. Add `materialFixture` constant and `listMaterials` describe block** — append to the end of the file (after the last `listOrders` describe block):

```ts
const materialFixture: Material = {
  id: "mat1",
  tenant_id: null,
  category: "laminate",
  name: "Oak Laminate",
  sku: "OAK-18",
  thickness_options: [16, 18, 22],
  price_per_m2: 12.5,
  edgebanding_price_per_mm: 0.002,
  s3_albedo: "http://s3/mat1/albedo.png",
  s3_normal: null,
  s3_roughness: null,
  s3_ao: null,
  grain_direction: "horizontal",
}

describe("listMaterials", () => {
  it("calls GET /materials with Authorization header and returns Material[]", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [materialFixture] })

    const result = await listMaterials("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("mat1")
    expect(result[0].thickness_options).toEqual([16, 18, 22])
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(listMaterials("tok")).rejects.toMatchObject({ status: 401 })
  })
})
```

- [ ] **Step 1.2: Run tests to verify failures**

```bash
cd frontend && npm test -- --testPathPattern=tests/lib/api.test.ts
```

Expected: Tests fail with errors about `listMaterials` not exported, `AppliedConfig` not exported, type errors on `createConfiguration`/`updateConfiguration` calls.

- [ ] **Step 1.3: Implement changes in `lib/api.ts`**

**1. Add the new types.** Insert after the `FurnitureType` type definition (after `}` on line 24, before `export class ApiError`):

```ts
export type EdgeBanding = {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export type PanelSpec = {
  name: string
  material_id: string
  thickness_mm: number
  width_mm: number
  height_mm: number
  quantity: number
  grain_direction: string
  edge_banding: EdgeBanding
}

export type HardwareItem = {
  name: string
  unit_price: number
  quantity: number
}

export type AppliedConfig = {
  dimensions: Record<string, number>
  panels: PanelSpec[]
  hardware_list: HardwareItem[]
}

export type Material = {
  id: string
  tenant_id: string | null
  category: string
  name: string
  sku: string
  thickness_options: number[]
  price_per_m2: number
  edgebanding_price_per_mm: number | null
  s3_albedo: string | null
  s3_normal: string | null
  s3_roughness: string | null
  s3_ao: string | null
  grain_direction: string
}
```

**2. Update `createConfiguration` signature** (change parameter type):

```ts
export async function createConfiguration(
  token: string,
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: AppliedConfig
): Promise<Configuration> {
  return apiFetch<Configuration>("/configurations", token, {
    method: "POST",
    body: JSON.stringify({
      project_id: projectId,
      furniture_type_id: furnitureTypeId,
      applied_config: appliedConfig,
    }),
  })
}
```

**3. Update `updateConfiguration` signature** (change parameter type):

```ts
export async function updateConfiguration(
  token: string,
  configId: string,
  appliedConfig: AppliedConfig
): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}`, token, {
    method: "PUT",
    body: JSON.stringify({ applied_config: appliedConfig }),
  })
}
```

**4. Add `listMaterials` function** — append after the `listOrders` function (end of file):

```ts
export async function listMaterials(token: string): Promise<Material[]> {
  return apiFetch<Material[]>("/materials", token)
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=tests/lib/api.test.ts
```

Expected: All 28 tests pass (26 existing + 2 new `listMaterials` tests).

- [ ] **Step 1.5: Commit**

```bash
git add frontend/lib/api.ts frontend/tests/lib/api.test.ts
git commit -m "feat: add Material/AppliedConfig types, listMaterials, update createConfiguration/updateConfiguration signatures"
```

---

## Task 2: Update Server Actions parameter types

**Files:**
- Modify: `frontend/app/actions/configurations.ts`

- [ ] **Step 2.1: Update `createConfigurationAction` and `updateConfigurationAction`**

Replace the entire content of `frontend/app/actions/configurations.ts` with:

```ts
"use server"

import { auth } from "@/lib/auth"
import { createConfiguration, confirmConfiguration, updateConfiguration, ApiError, type AppliedConfig } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createConfigurationAction(
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: AppliedConfig
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!projectId || !furnitureTypeId) return { error: "Invalid request" }
  try {
    await createConfiguration(token, projectId, furnitureTypeId, appliedConfig)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  redirect(`/projects/${projectId}`)
}

export async function confirmConfigurationAction(
  configId: string,
  projectId: string
): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  try {
    await confirmConfiguration(token, configId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError && e.status === 409) return { error: "already_confirmed" }
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  // Return null to signal success to the caller. Unlike createConfigurationAction,
  // this action revalidates the current page rather than redirecting, so the caller
  // (ConfirmButton) needs an explicit success signal.
  return null
}

export async function updateConfigurationAction(
  configId: string,
  projectId: string,
  appliedConfig: AppliedConfig
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  try {
    await updateConfiguration(token, configId, appliedConfig)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
```

- [ ] **Step 2.2: Run tests to confirm nothing broke**

```bash
cd frontend && npm test
```

Expected: All 28 tests pass.

- [ ] **Step 2.3: Commit**

```bash
git add frontend/app/actions/configurations.ts
git commit -m "feat: update Server Actions to accept AppliedConfig instead of Record<string, number>"
```

---

## Task 3: Update `ConfigurationForm` to submit new applied_config format

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx`

- [ ] **Step 3.1: Update imports and `handleSubmit`**

Replace the entire content of `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` with:

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { createConfigurationAction } from "@/app/actions/configurations"
import type { FurnitureType, AppliedConfig } from "@/lib/api"

type DimensionSpec = { min: number; max: number; step: number; default: number }
type FurnitureSchema = { dimensions?: Record<string, DimensionSpec> }

function getDimensions(schema: Record<string, unknown>): Record<string, DimensionSpec> {
  const s = schema as FurnitureSchema
  return s.dimensions ?? {}
}

function defaultDimensions(schema: Record<string, unknown>): Record<string, number> {
  const dims = getDimensions(schema)
  return Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, v.default]))
}

export function ConfigurationForm({
  furnitureTypes,
  projectId,
}: {
  furnitureTypes: FurnitureType[]
  projectId: string
}) {
  const [selectedTypeId, setSelectedTypeId] = useState(furnitureTypes[0]?.id ?? "")
  // Non-null assertion: parent page guarantees furnitureTypes is non-empty before rendering this component
  const selectedType = (furnitureTypes.find((ft) => ft.id === selectedTypeId) ?? furnitureTypes[0])!
  const [dimensions, setDimensions] = useState<Record<string, number>>(
    () => defaultDimensions(selectedType.schema)
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleTypeSelect(id: string) {
    const ft = furnitureTypes.find((f) => f.id === id)
    if (!ft) return
    setSelectedTypeId(id)
    setDimensions(defaultDimensions(ft.schema))
    setErrors({})
    setSubmitError(null)
  }

  function handleDimensionChange(key: string, value: string) {
    setDimensions((prev) => ({ ...prev, [key]: Number(value) }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validate(): boolean {
    const dims = getDimensions(selectedType.schema)
    const newErrors: Record<string, string> = {}
    for (const [key, spec] of Object.entries(dims)) {
      const val = dimensions[key] ?? spec.default
      if (val < spec.min || val > spec.max) {
        newErrors[key] = `Must be between ${spec.min} and ${spec.max} mm`
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setSubmitError(null)
    const appliedConfig: AppliedConfig = {
      dimensions,
      panels: [],
      hardware_list: [],
    }
    const result = await createConfigurationAction(projectId, selectedTypeId, appliedConfig)
    if (result?.error) {
      setSubmitError(result.error)
      setSubmitting(false)
    }
    // On success, createConfigurationAction calls redirect() which navigates the browser
    // away from this page — no further state update needed
  }

  const dims = getDimensions(selectedType.schema)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Furniture type selector */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Furniture Type</p>
        <div className="flex flex-wrap gap-2">
          {furnitureTypes.map((ft) => (
            <button
              key={ft.id}
              type="button"
              onClick={() => handleTypeSelect(ft.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                ft.id === selectedTypeId
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {ft.category}
            </button>
          ))}
        </div>
      </div>

      {/* Dimension inputs — only shown when the selected type has dimensions */}
      {Object.keys(dims).length > 0 && (
        <>
          <div className="border-t border-slate-800" />
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Dimensions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(dims).map(([key, spec]) => (
                <div key={key}>
                  <label
                    htmlFor={`dim-${key}`}
                    className="block text-xs text-slate-400 mb-1.5 capitalize"
                  >
                    {key} (mm)
                  </label>
                  <input
                    id={`dim-${key}`}
                    type="number"
                    min={spec.min}
                    max={spec.max}
                    step={1}
                    value={dimensions[key] ?? spec.default}
                    onChange={(e) => handleDimensionChange(key, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    {spec.min} – {spec.max} mm
                  </p>
                  {errors[key] && (
                    <p className="text-xs text-red-400 mt-1">{errors[key]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Submit error banner */}
      {submitError && (
        <div className="bg-red-950 border border-red-900 rounded-md px-4 py-3 text-sm text-red-400">
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          {submitting ? "Saving…" : "Save as draft"}
        </button>
        <Link
          href={`/projects/${projectId}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
```

- [ ] **Step 3.2: Run tests**

```bash
cd frontend && npm test
```

Expected: All 28 tests pass.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx
git commit -m "feat: ConfigurationForm submits full AppliedConfig format with empty panels on create"
```

---

## Task 4: Fetch materials in the viewer Server Component page

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx`

- [ ] **Step 4.1: Update the page to fetch and pass materials**

Replace the entire content of `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx` with:

```tsx
import { auth } from "@/lib/auth"
import {
  getProject,
  getConfiguration,
  getFurnitureType,
  listMaterials,
  ApiError,
  type Project,
  type Configuration,
  type FurnitureType,
  type Material,
} from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import { ConfigurationViewer } from "./_components/ConfigurationViewer"

export default async function ConfigurationViewerPage({
  params,
}: {
  params: Promise<{ id: string; cfgId: string }>
}) {
  const { id, cfgId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  // Fetch project and configuration in parallel.
  // `project` is fetched for authorization: the backend returns 404 for any
  // configuration whose project is owned by a different user, so this call
  // validates ownership without the frontend needing to compare IDs.
  let project!: Project
  let configuration!: Configuration
  try {
    ;[project, configuration] = await Promise.all([
      getProject(token, id),
      getConfiguration(token, cfgId),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Drafts have no viewer — redirect to project page
  if (configuration.status === "draft") redirect(`/projects/${id}`)

  // Fetch furniture type now that we have the ID from the configuration
  let furnitureType!: FurnitureType
  try {
    furnitureType = await getFurnitureType(token, configuration.furniture_type_id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Fetch materials for the panel assignment UI.
  // Non-critical: viewer renders without material pickers if this fails.
  let materials: Material[] = []
  try {
    materials = await listMaterials(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    // Other errors: silently fall back to empty list
  }

  const isReadOnly =
    configuration.status === "in_production" || configuration.status === "completed"

  // Cancel the (app) layout's p-6 padding so ConfigurationViewer fills the viewport
  return (
    <div className="-m-6">
      <ConfigurationViewer
        configuration={configuration}
        furnitureType={furnitureType}
        projectId={id}
        isReadOnly={isReadOnly}
        materials={materials}
      />
    </div>
  )
}
```

- [ ] **Step 4.2: Run tests**

```bash
cd frontend && npm test
```

Expected: All 28 tests pass (Server Component pages have no Jest tests; this change is verified by TypeScript + build).

- [ ] **Step 4.3: Commit**

```bash
git add frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx
git commit -m "feat: fetch materials server-side in viewer page and pass as prop to ConfigurationViewer"
```

---

## Task 5: Add Materials section to `ConfigurationViewer`

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`

- [ ] **Step 5.1: Write the updated ConfigurationViewer**

Replace the entire content of `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` with:

```tsx
"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { updateConfigurationAction } from "@/app/actions/configurations"
import { createOrderAction } from "@/app/actions/orders"
import type { Configuration, FurnitureType, AppliedConfig, Material } from "@/lib/api"

const BabylonSceneDynamic = dynamic(() => import("./BabylonScene"), { ssr: false })

type DimensionSpec = { min: number; max: number; step: number; default: number }
type PanelTemplate = {
  name: string
  width_key: string
  height_key: string
  quantity?: number
  grain_direction?: string
  edge_banding?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }
}
type Schema = { dimensions?: Record<string, DimensionSpec>; panels?: PanelTemplate[] }

type PanelAssignment = { materialId: string | null; thickness_mm: number | null }

type Props = {
  configuration: Configuration
  furnitureType: FurnitureType
  projectId: string
  isReadOnly: boolean
  materials: Material[]
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

export function ConfigurationViewer({ configuration, furnitureType, projectId, isReadOnly, materials }: Props) {
  const schema = furnitureType.schema as Schema
  const dimSpecs = schema.dimensions ?? {}
  const panelTemplates: PanelTemplate[] = schema.panels ?? []

  // Support old applied_config format ({ width: 900, ... }) and new format
  // ({ dimensions: { width: 900 }, panels: [...], hardware_list: [] })
  const rawConfig = configuration.applied_config as Record<string, unknown>
  const isNewFormat = "dimensions" in rawConfig
  const savedDimensions: Record<string, number> = isNewFormat
    ? (rawConfig.dimensions as Record<string, number>)
    : (rawConfig as Record<string, number>)
  const savedPanels = isNewFormat && Array.isArray(rawConfig.panels)
    ? (rawConfig.panels as Array<{ material_id: string; thickness_mm: number }>)
    : []

  const [dimensions, setDimensions] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.entries(dimSpecs).map(([k, s]) => [k, savedDimensions[k] ?? s.default])
    )
  )
  const [panelAssignments, setPanelAssignments] = useState<PanelAssignment[]>(() =>
    panelTemplates.map((_, i) => ({
      materialId: savedPanels[i]?.material_id ?? null,
      thickness_mm: savedPanels[i]?.thickness_mm ?? null,
    }))
  )
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const hasDimChanges = Object.keys(dimSpecs).some(
    (key) => dimensions[key] !== savedDimensions[key]
  )
  const hasPanelChanges = panelTemplates.some((_, i) => {
    const cur = panelAssignments[i]
    const sav = savedPanels[i]
    return (
      cur?.materialId !== (sav?.material_id ?? null) ||
      cur?.thickness_mm !== (sav?.thickness_mm ?? null)
    )
  })
  const hasUnsavedChanges = hasDimChanges || hasPanelChanges
  const hasInputErrors = Object.keys(inputErrors).length > 0

  const allPanelsAssigned =
    panelTemplates.length === 0 ||
    panelTemplates.every(
      (_, i) => !!panelAssignments[i]?.materialId && !!panelAssignments[i]?.thickness_mm
    )

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
    setPanelAssignments(
      panelTemplates.map((_, i) => ({
        materialId: savedPanels[i]?.material_id ?? null,
        thickness_mm: savedPanels[i]?.thickness_mm ?? null,
      }))
    )
    setInputErrors({})
    setSaveError(null)
  }

  async function handleSave() {
    if (hasInputErrors) return
    setIsSaving(true)
    setSaveError(null)
    const appliedConfig: AppliedConfig = {
      dimensions,
      panels: panelTemplates.map((tpl, i) => {
        const a = panelAssignments[i]
        return {
          name: tpl.name,
          material_id: a?.materialId ?? "",
          thickness_mm: a?.thickness_mm ?? 0,
          width_mm: dimensions[tpl.width_key] ?? 0,
          height_mm: dimensions[tpl.height_key] ?? 0,
          quantity: tpl.quantity ?? 1,
          grain_direction: tpl.grain_direction ?? "none",
          edge_banding: {
            left:   tpl.edge_banding?.left   ?? false,
            right:  tpl.edge_banding?.right  ?? false,
            top:    tpl.edge_banding?.top    ?? false,
            bottom: tpl.edge_banding?.bottom ?? false,
          },
        }
      }),
      hardware_list: [],
    }
    const result = await updateConfigurationAction(configuration.id, projectId, appliedConfig)
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

          {/* Materials section — shown when the furniture type schema defines panel templates */}
          {panelTemplates.length > 0 && (
            <>
              <hr className="border-slate-800" />
              <p className="text-xs uppercase tracking-widest text-slate-500">Materials</p>
              {panelTemplates.map((tpl, i) => {
                const widthMm = dimensions[tpl.width_key] ?? 0
                const heightMm = dimensions[tpl.height_key] ?? 0
                const assignment = panelAssignments[i]
                const selectedMaterial = materials.find((m) => m.id === assignment?.materialId)
                return (
                  <div key={tpl.name} className="mb-1">
                    <span className="block text-xs text-slate-400 mb-1">
                      {tpl.name}
                      {tpl.quantity && tpl.quantity > 1 ? ` ×${tpl.quantity}` : ""}{" "}
                      <span className="text-slate-600">{widthMm} × {heightMm} mm</span>
                    </span>
                    <select
                      value={assignment?.materialId ?? ""}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        const matId = e.target.value || null
                        setPanelAssignments((prev) =>
                          prev.map((a, idx) =>
                            idx === i ? { ...a, materialId: matId, thickness_mm: null } : a
                          )
                        )
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed mb-1"
                    >
                      <option value="">— select material —</option>
                      {materials.map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.name} ({mat.sku})
                        </option>
                      ))}
                    </select>
                    {selectedMaterial && (
                      <select
                        value={assignment?.thickness_mm ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const t = e.target.value ? Number(e.target.value) : null
                          setPanelAssignments((prev) =>
                            prev.map((a, idx) =>
                              idx === i ? { ...a, thickness_mm: t } : a
                            )
                          )
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">— select thickness —</option>
                        {selectedMaterial.thickness_options.map((t) => (
                          <option key={t} value={t}>
                            {t} mm
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </>
          )}

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
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2: Run tests**

```bash
cd frontend && npm test
```

Expected: All 28 tests pass.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx
git commit -m "feat: add Materials section to ConfigurationViewer with panel assignment state and allPanelsAssigned gate"
```

---

## Self-Review Checklist (completed by plan author)

**Spec coverage:**
- ✅ `Material` type, `listMaterials` → Task 1
- ✅ `EdgeBanding`, `PanelSpec`, `HardwareItem`, `AppliedConfig` types → Task 1
- ✅ `createConfiguration`/`updateConfiguration` signature updates → Task 1
- ✅ 2 new tests for `listMaterials` → Task 1
- ✅ Updated `createConfiguration`/`updateConfiguration` tests → Task 1
- ✅ Server Action parameter type updates → Task 2
- ✅ `ConfigurationForm` submits new format → Task 3
- ✅ Viewer page fetches materials → Task 4
- ✅ `ConfigurationViewer` Materials section JSX → Task 5
- ✅ `PanelAssignment` state + init from saved config (old + new format) → Task 5
- ✅ Extended `hasUnsavedChanges` (dim + panel changes) → Task 5
- ✅ `allPanelsAssigned` gate on "Place Order" → Task 5
- ✅ Updated `handleSave` builds full `AppliedConfig` → Task 5
- ✅ Updated `handleReset` resets panel assignments → Task 5
- ✅ Old-format `applied_config` backward compatibility → Task 5
- ✅ `listMaterials` 401 → redirect, other errors → silently ignored → Task 4

**No placeholders found.**

**Type consistency:** `AppliedConfig`, `PanelSpec`, `EdgeBanding`, `Material`, `PanelTemplate`, `PanelAssignment` — all defined in Task 1 (lib) or Task 5 (component-local) and used consistently throughout.
