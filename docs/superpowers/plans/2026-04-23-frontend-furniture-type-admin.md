# Frontend Furniture Type Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Furniture Types catalog with admin/manufacturer creation via a JSON schema form.

**Architecture:** `lib/api.ts` gains `FurnitureTypeCreate` type and `createFurnitureType()`; `app/actions/furniture-types.ts` provides `createFurnitureTypeAction` with role guard; pages under `app/(app)/furniture-types/` list all types (all users) and allow creation (admin/manufacturer only); nav link added to layout.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, TypeScript, Jest.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `FurnitureTypeCreate` type + `createFurnitureType()` |
| `frontend/tests/lib/api.test.ts` | Modify | 2 new tests for `createFurnitureType` |
| `frontend/app/actions/furniture-types.ts` | Create | `createFurnitureTypeAction` Server Action |
| `frontend/app/(app)/layout.tsx` | Modify | Add "Furniture Types" nav link |
| `frontend/app/(app)/furniture-types/page.tsx` | Create | List all furniture types; "New" button for admin/manufacturer |
| `frontend/app/(app)/furniture-types/new/page.tsx` | Create | Role guard; renders `NewFurnitureTypeForm` |
| `frontend/app/(app)/furniture-types/new/_components/NewFurnitureTypeForm.tsx` | Create | "use client" form with category input + JSON schema textarea |

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

**Existing `FurnitureType` type** (already in `lib/api.ts`):
```ts
export type FurnitureType = {
  id: string
  tenant_id: string | null
  category: string
  schema: Record<string, unknown>
}
```

**Test convention** (`api.test.ts`):
```ts
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
// errors:
mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" })
```

**Server Action pattern** (see `frontend/app/actions/materials.ts` for exact reference):
```ts
"use server"
// auth guard → role guard → try/catch → revalidatePath → redirect
```

**Session role check** (set up in Sub-plan 7):
```ts
const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
```

**Run tests:** `cd /Users/rovshennurybayev/claude_agents/frontend && npm test`

**Current test count:** 38 tests passing.

---

## Task 1: `lib/api.ts` — `FurnitureTypeCreate` type + `createFurnitureType()` (TDD)

**Files:**
- Modify: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1.1: Add failing tests to `api.test.ts`**

**1a. Update the import block** at the top of `frontend/tests/lib/api.test.ts`. Replace the existing import with:

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
} from "@/lib/api"
```

**1b. Append the following block** after the last `describe` block (after the closing `}` of the `updateMaterial` describe block at line 591):

```ts
describe("createFurnitureType", () => {
  it("POSTs to /furniture-types with JSON body and Authorization header, returns FurnitureType", async () => {
    const fixture = { id: "ft1", category: "wardrobe", schema: { dimensions: {} }, tenant_id: null }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const data: FurnitureTypeCreate = {
      category: "wardrobe",
      schema: { dimensions: { width: { min: 300, max: 1200, step: 10, default: 600 } } },
    }
    const result = await createFurnitureType("tok", data)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(data),
      })
    )
    expect(result.id).toBe("ft1")
    expect(result.category).toBe("wardrobe")
  })

  it("throws ApiError on 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" })
    await expect(
      createFurnitureType("tok", { category: "wardrobe", schema: {} })
    ).rejects.toMatchObject({ status: 403 })
  })
})
```

- [ ] **Step 1.2: Run tests — verify 2 new tests fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -15
```

Expected: 2 failures (`createFurnitureType is not a function`). Existing 38 tests still pass.

- [ ] **Step 1.3: Add `FurnitureTypeCreate` type and `createFurnitureType` to `lib/api.ts`**

Append after the last function in `frontend/lib/api.ts` (after `updateMaterial`):

```ts
export type FurnitureTypeCreate = {
  category: string
  schema: Record<string, unknown>
}

export async function createFurnitureType(
  token: string,
  data: FurnitureTypeCreate
): Promise<FurnitureType> {
  return apiFetch<FurnitureType>("/furniture-types", token, {
    method: "POST",
    body: JSON.stringify(data),
  })
}
```

- [ ] **Step 1.4: Run tests — verify all 40 pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 40 passed, 40 total`

- [ ] **Step 1.5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/lib/api.ts frontend/tests/lib/api.test.ts && git commit -m "feat: add FurnitureTypeCreate type and createFurnitureType to api.ts"
```

---

## Task 2: `app/actions/furniture-types.ts` — Server Action

**Files:**
- Create: `frontend/app/actions/furniture-types.ts`

- [ ] **Step 2.1: Create `frontend/app/actions/furniture-types.ts`**

Full content:

```ts
"use server"

import { auth } from "@/lib/auth"
import { createFurnitureType, ApiError, type FurnitureTypeCreate } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createFurnitureTypeAction(
  data: FurnitureTypeCreate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) return { error: "Forbidden" }
  try {
    await createFurnitureType(token, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/furniture-types")
  redirect("/furniture-types")
}
```

- [ ] **Step 2.2: Run tests — verify 40 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 40 passed, 40 total`

- [ ] **Step 2.3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/app/actions/furniture-types.ts && git commit -m "feat: add createFurnitureTypeAction Server Action"
```

---

## Task 3: Navigation + Furniture Types List Page

**Files:**
- Modify: `frontend/app/(app)/layout.tsx`
- Create: `frontend/app/(app)/furniture-types/page.tsx`

- [ ] **Step 3.1: Add "Furniture Types" nav link to `frontend/app/(app)/layout.tsx`**

The current nav has three children: brand link, Materials link, user div. Add "Furniture Types" after "Materials".

Find:
```tsx
        <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
          Materials
        </Link>
        <div className="flex items-center gap-4">
```

Replace with:
```tsx
        <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
          Materials
        </Link>
        <Link href="/furniture-types" className="text-xs text-slate-400 hover:text-slate-200">
          Furniture Types
        </Link>
        <div className="flex items-center gap-4">
```

- [ ] **Step 3.2: Create `frontend/app/(app)/furniture-types/page.tsx`**

Full content:

```tsx
import { auth } from "@/lib/auth"
import { getFurnitureTypes } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function FurnitureTypesPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  const furnitureTypes = await getFurnitureTypes(token)
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Furniture Types</h1>
        {canManage && (
          <Link
            href="/furniture-types/new"
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
          >
            New Furniture Type
          </Link>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-slate-400">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Category</th>
              <th className="text-left py-3 px-4">ID</th>
              <th className="text-left py-3 px-4">Tenant</th>
              <th className="text-left py-3 px-4">Schema keys</th>
            </tr>
          </thead>
          <tbody>
            {furnitureTypes.map((ft) => (
              <tr key={ft.id} className="border-b border-slate-800 last:border-0">
                <td className="py-3 px-4 text-slate-200">{ft.category}</td>
                <td className="py-3 px-4 font-mono text-xs">{ft.id}</td>
                <td className="py-3 px-4">{ft.tenant_id ?? "Global"}</td>
                <td className="py-3 px-4 text-xs">
                  {Object.keys(ft.schema).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {furnitureTypes.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No furniture types found.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3.3: Run tests — verify 40 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 40 passed, 40 total`

- [ ] **Step 3.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/layout.tsx" "frontend/app/(app)/furniture-types/page.tsx" && git commit -m "feat: add furniture types nav link and list page"
```

---

## Task 4: New Furniture Type Page + `NewFurnitureTypeForm.tsx`

**Files:**
- Create: `frontend/app/(app)/furniture-types/new/page.tsx`
- Create: `frontend/app/(app)/furniture-types/new/_components/NewFurnitureTypeForm.tsx`

- [ ] **Step 4.1: Create `frontend/app/(app)/furniture-types/new/page.tsx`**

Full content:

```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { NewFurnitureTypeForm } from "./_components/NewFurnitureTypeForm"

export default async function NewFurnitureTypePage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect("/furniture-types")

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/furniture-types" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to furniture types
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Furniture Type</h1>
      <NewFurnitureTypeForm />
    </div>
  )
}
```

- [ ] **Step 4.2: Create `frontend/app/(app)/furniture-types/new/_components/NewFurnitureTypeForm.tsx`**

Full content:

```tsx
"use client"

import { useState } from "react"
import { createFurnitureTypeAction } from "@/app/actions/furniture-types"

const SCHEMA_PLACEHOLDER = `{
  "dimensions": {
    "width": { "min": 300, "max": 1200, "step": 10, "default": 600 },
    "height": { "min": 600, "max": 2400, "step": 10, "default": 1800 }
  },
  "panels": [
    {
      "name": "Top Panel",
      "width_key": "width",
      "height_key": "depth",
      "quantity": 1,
      "grain_direction": "horizontal",
      "edge_banding": { "left": true, "right": true, "top": false, "bottom": false }
    }
  ]
}`

export function NewFurnitureTypeForm() {
  const [category, setCategory] = useState("")
  const [schemaText, setSchemaText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    let parsedSchema: Record<string, unknown>
    try {
      parsedSchema = JSON.parse(schemaText) as Record<string, unknown>
    } catch (parseErr) {
      setError(`Invalid JSON: ${(parseErr as Error).message}`)
      setIsSubmitting(false)
      return
    }

    const result = await createFurnitureTypeAction({ category, schema: parsedSchema })

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: createFurnitureTypeAction redirects to /furniture-types
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="category" className="block text-xs text-slate-400 mb-1">
          Category
        </label>
        <input
          id="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. wardrobe, bookshelf, desk"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="schema" className="block text-xs text-slate-400 mb-1">
          Schema (JSON)
        </label>
        <textarea
          id="schema"
          required
          rows={18}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          placeholder={SCHEMA_PLACEHOLDER}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-indigo-500 resize-y"
        />
        <p className="mt-1 text-xs text-slate-600">
          Must be valid JSON. Top-level keys: <code className="text-slate-500">dimensions</code> and/or <code className="text-slate-500">panels</code>.
        </p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Creating…" : "Create Furniture Type"}
      </button>
    </form>
  )
}
```

- [ ] **Step 4.3: Run tests — verify 40 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 40 passed, 40 total`

- [ ] **Step 4.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/furniture-types/new/page.tsx" "frontend/app/(app)/furniture-types/new/_components/NewFurnitureTypeForm.tsx" && git commit -m "feat: add new furniture type page with JSON schema form"
```
