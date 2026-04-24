# Frontend Material Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin/manufacturer UI for creating and editing materials, with role detection from JWT payload.

**Architecture:** NextAuth `jwt` callback decodes the JWT payload (base64, no secret) to extract `role` and expose it in the session. `lib/api.ts` gains 4 new functions and 2 types. A new `app/actions/materials.ts` file provides 3 Server Actions. Pages under `app/(app)/materials/` provide a role-gated list, create, and edit UI.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, TypeScript, Jest.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `frontend/types/next-auth.d.ts` | Modify | Add `role` to User, JWT, Session type declarations |
| `frontend/lib/auth.ts` | Modify | Decode JWT payload to set `token.role`; expose in session |
| `frontend/lib/api.ts` | Modify | Add `MaterialCreate`, `MaterialUpdate` types; `getMaterial`, `createMaterial`, `uploadMaterial`, `updateMaterial` |
| `frontend/tests/lib/api.test.ts` | Modify | 8 new tests for the 4 new api functions |
| `frontend/app/actions/materials.ts` | Create | `createMaterialAction`, `uploadMaterialAction`, `updateMaterialAction` |
| `frontend/app/(app)/layout.tsx` | Modify | Add "Materials" nav link |
| `frontend/app/(app)/materials/page.tsx` | Create | Server Component — list all materials, admin actions for privileged roles |
| `frontend/app/(app)/materials/new/page.tsx` | Create | Server Component — role guard, renders NewMaterialForm |
| `frontend/app/(app)/materials/new/_components/NewMaterialForm.tsx` | Create | "use client" — create/upload form |
| `frontend/app/(app)/materials/[matId]/edit/page.tsx` | Create | Server Component — fetches material, role guard |
| `frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx` | Create | "use client" — edit form |

---

## Background: Existing Patterns

**`apiFetch` in `lib/api.ts`** (never call `fetch` directly — except `uploadMaterial` which is multipart):
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

**Test convention** (`api.test.ts`):
```ts
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
// errors:
mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" })
```

**Server Action pattern** (`app/actions/materials.ts` — new file, "use server" at module level):
```ts
const session = await auth()
if (!session?.user?.access_token) redirect("/login")
const token = session.user.access_token
try {
  await someApiFn(token, ...)
} catch (e) {
  if (e instanceof ApiError && e.status === 401) redirect("/login")
  if (e instanceof ApiError) return { error: e.message }
  throw e
}
revalidatePath("/materials")
redirect("/materials")   // redirect() throws NEXT_REDIRECT — must be after revalidatePath
```

**`Material` type** (already in `lib/api.ts`):
```ts
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

**Backend `PUT /materials/{id}` does NOT update textures** — only: name, sku, category, thickness_options, price_per_m2, edgebanding_price_per_mm, grain_direction.

**`POST /materials/upload`** multipart fields: `name`, `sku`, `category`, `price_per_m2`, `thickness_options` (JSON string e.g. `"[16,18,22]"`), `edgebanding_price_per_mm` (optional), `grain_direction`, `file` (ZIP). Returns `Material` (201).

**Run tests:** `cd /Users/rovshennurybayev/claude_agents/frontend && npm test`

**Current test count:** 30 tests passing.

---

## Task 1: Session Extension — `next-auth.d.ts` + `lib/auth.ts`

**Files:**
- Modify: `frontend/types/next-auth.d.ts`
- Modify: `frontend/lib/auth.ts`

- [ ] **Step 1.1: Update `types/next-auth.d.ts`**

Full file replacement (add `role` to User, JWT, Session):

```ts
import "next-auth"
import "next-auth/jwt"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    access_token?: string
    role?: string
  }
  interface Session {
    user: {
      access_token: string
      role: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string
    role?: string
  }
}
```

- [ ] **Step 1.2: Update `lib/auth.ts` — decode JWT payload to set `token.role`**

The current `callbacks` block:
```ts
  callbacks: {
    async jwt({ token, user }) {
      if (user?.access_token) token.access_token = user.access_token
      return token
    },
    async session({ session, token }) {
      session.user = { ...session.user, access_token: token.access_token ?? "" }
      return session
    },
  },
```

Replace with:
```ts
  callbacks: {
    async jwt({ token, user }) {
      if (user?.access_token) {
        token.access_token = user.access_token
        const payload = JSON.parse(
          Buffer.from(user.access_token.split(".")[1], "base64").toString()
        )
        token.role = payload.role as string
      }
      return token
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        access_token: token.access_token ?? "",
        role: token.role ?? "",
      }
      return session
    },
  },
```

- [ ] **Step 1.3: Run tests — verify 30 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 30 passed, 30 total`

- [ ] **Step 1.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/types/next-auth.d.ts frontend/lib/auth.ts && git commit -m "feat: decode JWT payload to expose role in NextAuth session"
```

---

## Task 2: `lib/api.ts` — 4 new functions + 2 types (TDD)

**Files:**
- Modify: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 2.1: Add failing tests to `api.test.ts`**

**2a. Update the import block** at the top of `frontend/tests/lib/api.test.ts`. Replace the existing import with:

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
} from "@/lib/api"
```

**2b. Append the following block after the last `describe` block** (after the `dispatchOrder` block ending at line 468):

```ts
describe("getMaterial", () => {
  it("calls GET /materials/{id} with Authorization header and returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const result = await getMaterial("tok", "mat1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/mat1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("mat1")
    expect(result.name).toBe("Oak Veneer")
  })

  it("throws ApiError on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Material not found" })
    await expect(getMaterial("tok", "mat1")).rejects.toMatchObject({ status: 404 })
  })
})

describe("createMaterial", () => {
  it("POSTs to /materials with JSON body and Authorization header, returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const data: MaterialCreate = {
      category: "sheet",
      name: "Oak Veneer",
      sku: "OAK-001",
      thickness_options: [16, 18],
      price_per_m2: 45,
      grain_direction: "vertical",
    }
    const result = await createMaterial("tok", data)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(data),
      })
    )
    expect(result.id).toBe("mat1")
  })

  it("throws ApiError on 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" })
    await expect(createMaterial("tok", {
      category: "sheet",
      name: "X",
      sku: "X",
      thickness_options: [18],
      price_per_m2: 10,
      grain_direction: "none",
    })).rejects.toMatchObject({ status: 403 })
  })
})

describe("uploadMaterial", () => {
  it("POSTs to /materials/upload with Authorization header but no Content-Type, returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const fd = new FormData()
    fd.append("name", "Oak Veneer")
    const result = await uploadMaterial("tok", fd)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/upload",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: fd,
      })
    )
    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(callHeaders["Content-Type"]).toBeUndefined()
    expect(result.id).toBe("mat1")
  })

  it("throws ApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Invalid ZIP" })
    await expect(uploadMaterial("tok", new FormData())).rejects.toMatchObject({ status: 422 })
  })
})

describe("updateMaterial", () => {
  it("PUTs to /materials/{id} with JSON body and Authorization header, returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const data: MaterialUpdate = { name: "Oak Veneer Updated", price_per_m2: 50 }
    const result = await updateMaterial("tok", "mat1", data)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/mat1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(data),
      })
    )
    expect(result.id).toBe("mat1")
  })

  it("throws ApiError on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Material not found" })
    await expect(updateMaterial("tok", "mat1", { name: "X" })).rejects.toMatchObject({ status: 404 })
  })
})
```

- [ ] **Step 2.2: Run tests — verify 8 new tests fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -15
```

Expected: 8 failures (`getMaterial is not a function`, etc.). 30 existing tests still pass.

- [ ] **Step 2.3: Add types and functions to `lib/api.ts`**

Append after the `dispatchOrder` function (currently at the end of the file):

```ts
export type MaterialCreate = {
  category: string
  name: string
  sku: string
  thickness_options: number[]
  price_per_m2: number
  edgebanding_price_per_mm?: number | null
  grain_direction: "horizontal" | "vertical" | "none"
}

export type MaterialUpdate = {
  name?: string
  sku?: string
  category?: string
  thickness_options?: number[]
  price_per_m2?: number
  edgebanding_price_per_mm?: number | null
  grain_direction?: "horizontal" | "vertical" | "none"
}

export async function getMaterial(token: string, matId: string): Promise<Material> {
  return apiFetch<Material>(`/materials/${matId}`, token)
}

export async function createMaterial(token: string, data: MaterialCreate): Promise<Material> {
  return apiFetch<Material>("/materials", token, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// uploadMaterial does NOT use apiFetch — must NOT set Content-Type so fetch auto-adds multipart boundary
export async function uploadMaterial(token: string, formData: FormData): Promise<Material> {
  const res = await fetch(`${process.env.BACKEND_URL}/materials/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: "no-store",
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<Material>
}

export async function updateMaterial(
  token: string,
  matId: string,
  data: MaterialUpdate
): Promise<Material> {
  return apiFetch<Material>(`/materials/${matId}`, token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}
```

- [ ] **Step 2.4: Run tests — verify all 38 pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 2.5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/lib/api.ts frontend/tests/lib/api.test.ts && git commit -m "feat: add getMaterial, createMaterial, uploadMaterial, updateMaterial to api.ts"
```

---

## Task 3: `app/actions/materials.ts` — Server Actions

**Files:**
- Create: `frontend/app/actions/materials.ts`

- [ ] **Step 3.1: Create `frontend/app/actions/materials.ts`**

Full content:

```ts
"use server"

import { auth } from "@/lib/auth"
import {
  createMaterial,
  uploadMaterial,
  updateMaterial,
  ApiError,
  type MaterialCreate,
  type MaterialUpdate,
} from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createMaterialAction(
  data: MaterialCreate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await createMaterial(token, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}

export async function uploadMaterialAction(
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await uploadMaterial(token, formData)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}

export async function updateMaterialAction(
  matId: string,
  data: MaterialUpdate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!matId) return { error: "Invalid request" }
  try {
    await updateMaterial(token, matId, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}
```

- [ ] **Step 3.2: Run tests — verify 38 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 3.3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/app/actions/materials.ts && git commit -m "feat: add createMaterialAction, uploadMaterialAction, updateMaterialAction"
```

---

## Task 4: Navigation — Add "Materials" link to `app/(app)/layout.tsx`

**Files:**
- Modify: `frontend/app/(app)/layout.tsx`

- [ ] **Step 4.1: Add the Materials link to `layout.tsx`**

The current nav element:
```tsx
      <nav className="bg-slate-900 border-b border-slate-800 h-12 flex items-center justify-between px-6">
        <Link href="/dashboard" className="text-sm font-semibold text-slate-50">
          Configurator
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">{session.user.email}</span>
```

Replace with:
```tsx
      <nav className="bg-slate-900 border-b border-slate-800 h-12 flex items-center justify-between px-6">
        <Link href="/dashboard" className="text-sm font-semibold text-slate-50">
          Configurator
        </Link>
        <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
          Materials
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">{session.user.email}</span>
```

- [ ] **Step 4.2: Run tests — verify 38 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 4.3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/layout.tsx" && git commit -m "feat: add Materials nav link to app layout"
```

---

## Task 5: Materials List Page — `app/(app)/materials/page.tsx`

**Files:**
- Create: `frontend/app/(app)/materials/page.tsx`

- [ ] **Step 5.1: Create `frontend/app/(app)/materials/page.tsx`**

Full content:

```tsx
import { auth } from "@/lib/auth"
import { listMaterials } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function MaterialsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  const materials = await listMaterials(token)
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Materials</h1>
        {canManage && (
          <Link
            href="/materials/new"
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
          >
            New Material
          </Link>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-slate-400">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">SKU</th>
              <th className="text-left py-3 px-4">Category</th>
              <th className="text-right py-3 px-4">Thickness (mm)</th>
              <th className="text-right py-3 px-4">Price/m²</th>
              <th className="text-left py-3 px-4">Grain</th>
              <th className="text-center py-3 px-4">Textures</th>
              {canManage && <th className="py-3 px-4" />}
            </tr>
          </thead>
          <tbody>
            {materials.map((mat) => (
              <tr key={mat.id} className="border-b border-slate-800 last:border-0">
                <td className="py-3 px-4 text-slate-200">{mat.name}</td>
                <td className="py-3 px-4 font-mono text-xs">{mat.sku}</td>
                <td className="py-3 px-4">{mat.category}</td>
                <td className="py-3 px-4 text-right">{mat.thickness_options.join(", ")}</td>
                <td className="py-3 px-4 text-right">${mat.price_per_m2.toFixed(2)}</td>
                <td className="py-3 px-4">{mat.grain_direction}</td>
                <td className="py-3 px-4 text-center">{mat.s3_albedo ? "✓" : "—"}</td>
                {canManage && (
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/materials/${mat.id}/edit`}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {materials.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No materials found.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2: Run tests — verify 38 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 5.3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/materials/page.tsx" && git commit -m "feat: add materials list page"
```

---

## Task 6: New Material Page + `NewMaterialForm.tsx`

**Files:**
- Create: `frontend/app/(app)/materials/new/page.tsx`
- Create: `frontend/app/(app)/materials/new/_components/NewMaterialForm.tsx`

- [ ] **Step 6.1: Create `frontend/app/(app)/materials/new/page.tsx`**

Full content:

```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { NewMaterialForm } from "./_components/NewMaterialForm"

export default async function NewMaterialPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect("/materials")

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/materials" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to materials
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Material</h1>
      <NewMaterialForm />
    </div>
  )
}
```

- [ ] **Step 6.2: Create `frontend/app/(app)/materials/new/_components/NewMaterialForm.tsx`**

Full content:

```tsx
"use client"

import { useState, useRef } from "react"
import { createMaterialAction, uploadMaterialAction } from "@/app/actions/materials"

export function NewMaterialForm() {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [category, setCategory] = useState("")
  const [thicknessInput, setThicknessInput] = useState("")
  const [pricePerM2, setPricePerM2] = useState("")
  const [edgebandingPrice, setEdgebandingPrice] = useState("")
  const [grainDirection, setGrainDirection] = useState<"horizontal" | "vertical" | "none">("none")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const thicknessOptions = thicknessInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))

    const file = fileRef.current?.files?.[0]

    let result: { error?: string }
    if (file) {
      const fd = new FormData()
      fd.append("name", name)
      fd.append("sku", sku)
      fd.append("category", category)
      fd.append("thickness_options", JSON.stringify(thicknessOptions))
      fd.append("price_per_m2", pricePerM2)
      if (edgebandingPrice) fd.append("edgebanding_price_per_mm", edgebandingPrice)
      fd.append("grain_direction", grainDirection)
      fd.append("file", file)
      result = await uploadMaterialAction(fd)
    } else {
      result = await createMaterialAction({
        name,
        sku,
        category,
        thickness_options: thicknessOptions,
        price_per_m2: parseFloat(pricePerM2),
        edgebanding_price_per_mm: edgebandingPrice ? parseFloat(edgebandingPrice) : null,
        grain_direction: grainDirection,
      })
    }

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: actions redirect to /materials — no further state update needed
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">SKU</label>
        <input
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Category</label>
        <input
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Thickness options (mm, comma-separated)
        </label>
        <input
          required
          placeholder="16, 18, 22"
          value={thicknessInput}
          onChange={(e) => setThicknessInput(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Price per m²</label>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          value={pricePerM2}
          onChange={(e) => setPricePerM2(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Edgebanding price per mm (optional)
        </label>
        <input
          type="number"
          step="0.001"
          min="0"
          value={edgebandingPrice}
          onChange={(e) => setEdgebandingPrice(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Grain direction</label>
        <select
          value={grainDirection}
          onChange={(e) =>
            setGrainDirection(e.target.value as "horizontal" | "vertical" | "none")
          }
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
        >
          <option value="none">None</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          PBR texture ZIP (optional)
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-700 file:text-slate-200 file:text-xs hover:file:bg-slate-600"
        />
        <p className="mt-1 text-xs text-slate-600">
          ZIP must contain albedo.png, normal.png, roughness.png, ao.png
        </p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Creating…" : "Create Material"}
      </button>
    </form>
  )
}
```

- [ ] **Step 6.3: Run tests — verify 38 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 6.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/materials/new/page.tsx" "frontend/app/(app)/materials/new/_components/NewMaterialForm.tsx" && git commit -m "feat: add new material page with create/upload form"
```

---

## Task 7: Edit Material Page + `EditMaterialForm.tsx`

**Files:**
- Create: `frontend/app/(app)/materials/[matId]/edit/page.tsx`
- Create: `frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx`

- [ ] **Step 7.1: Create `frontend/app/(app)/materials/[matId]/edit/page.tsx`**

Full content:

```tsx
import { auth } from "@/lib/auth"
import { getMaterial, ApiError } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { EditMaterialForm } from "./_components/EditMaterialForm"

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ matId: string }>
}) {
  const { matId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect("/materials")

  let material
  try {
    material = await getMaterial(session.user.access_token, matId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/materials" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to materials
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-2">Edit Material</h1>
      <p className="text-xs text-slate-500 mb-6 font-mono">{material.id}</p>
      <EditMaterialForm material={material} />
    </div>
  )
}
```

- [ ] **Step 7.2: Create `frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx`**

Full content:

```tsx
"use client"

import { useState } from "react"
import { updateMaterialAction } from "@/app/actions/materials"
import type { Material } from "@/lib/api"

type Props = { material: Material }

export function EditMaterialForm({ material }: Props) {
  const [name, setName] = useState(material.name)
  const [sku, setSku] = useState(material.sku)
  const [category, setCategory] = useState(material.category)
  const [thicknessInput, setThicknessInput] = useState(material.thickness_options.join(", "))
  const [pricePerM2, setPricePerM2] = useState(String(material.price_per_m2))
  const [edgebandingPrice, setEdgebandingPrice] = useState(
    material.edgebanding_price_per_mm != null ? String(material.edgebanding_price_per_mm) : ""
  )
  const [grainDirection, setGrainDirection] = useState<"horizontal" | "vertical" | "none">(
    material.grain_direction as "horizontal" | "vertical" | "none"
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const thicknessOptions = thicknessInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))

    const result = await updateMaterialAction(material.id, {
      name,
      sku,
      category,
      thickness_options: thicknessOptions,
      price_per_m2: parseFloat(pricePerM2),
      edgebanding_price_per_mm: edgebandingPrice ? parseFloat(edgebandingPrice) : null,
      grain_direction: grainDirection,
    })

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: updateMaterialAction redirects to /materials
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">SKU</label>
        <input
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Category</label>
        <input
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Thickness options (mm, comma-separated)
        </label>
        <input
          required
          value={thicknessInput}
          onChange={(e) => setThicknessInput(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Price per m²</label>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          value={pricePerM2}
          onChange={(e) => setPricePerM2(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Edgebanding price per mm (optional)
        </label>
        <input
          type="number"
          step="0.001"
          min="0"
          value={edgebandingPrice}
          onChange={(e) => setEdgebandingPrice(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Grain direction</label>
        <select
          value={grainDirection}
          onChange={(e) =>
            setGrainDirection(e.target.value as "horizontal" | "vertical" | "none")
          }
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
        >
          <option value="none">None</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save Changes"}
      </button>
    </form>
  )
}
```

- [ ] **Step 7.3: Run tests — verify 38 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 38 passed, 38 total`

- [ ] **Step 7.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/materials/[matId]/edit/page.tsx" "frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx" && git commit -m "feat: add edit material page with update form"
```
