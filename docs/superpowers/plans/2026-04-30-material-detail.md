# Material Detail Page — Implementation Plan (Sub-plan 16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate `/materials/[matId]/edit` page with a unified `/materials/[matId]` detail+edit page where admin/manufacturer users see an inline edit form and designers see a read-only card.

**Architecture:** Three frontend-only changes: (1) fix the `updateMaterialAction` redirect so it returns to the detail page after save, (2) create the `MaterialDetailForm` client component (same fields as `EditMaterialForm` plus a delete button), (3) create the Server Component page that gates on role and remove the now-superseded edit pages. The materials list gets name links so all users can navigate to the detail page.

**Tech Stack:** Next.js 15 App Router + NextAuth v5 + Tailwind CSS + TypeScript + Jest.

---

### Task 1: Update `updateMaterialAction` redirect + materials list links

**Files:**
- Modify: `frontend/app/actions/materials.ts`
- Modify: `frontend/app/(app)/materials/page.tsx`

Context: `updateMaterialAction` currently does `revalidatePath("/materials"); redirect("/materials")`. After a save we want the user to stay on the detail page. The materials list currently shows the name as plain text and has an "Edit" link pointing to `/materials/${mat.id}/edit`. Both need updating.

- [ ] **Step 1: Update `updateMaterialAction` in `frontend/app/actions/materials.ts`**

Read the file first. Find the `updateMaterialAction` function. Change the two lines at the end from:

```ts
  revalidatePath("/materials")
  redirect("/materials")
```

To:

```ts
  revalidatePath("/materials")
  revalidatePath(`/materials/${matId}`)
  redirect(`/materials/${matId}`)
```

The function signature is `updateMaterialAction(matId: string, data: MaterialUpdate)` — `matId` is already available.

- [ ] **Step 2: Update `frontend/app/(app)/materials/page.tsx`**

Read the file first. Make two changes:

**Change 1 — name cell:** The name is currently plain text:
```tsx
<td className="py-3 px-4 text-slate-200">{mat.name}</td>
```
Replace with a link for all users:
```tsx
<td className="py-3 px-4">
  <Link href={`/materials/${mat.id}`} className="text-slate-200 hover:text-indigo-300">
    {mat.name}
  </Link>
</td>
```

**Change 2 — Edit link href:** Currently:
```tsx
href={`/materials/${mat.id}/edit`}
```
Replace with:
```tsx
href={`/materials/${mat.id}`}
```

- [ ] **Step 3: Verify TypeScript + Jest**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TypeScript errors; 55 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add app/actions/materials.ts "app/(app)/materials/page.tsx" && git commit -m "feat: update updateMaterialAction redirect + materials list links (sub-plan 16, task 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create `MaterialDetailForm` client component

**Files:**
- Create: `frontend/app/(app)/materials/[matId]/_components/MaterialDetailForm.tsx`

Context: This is essentially `EditMaterialForm` with one addition: a `DeleteButton` at the bottom. The `DeleteButton` shared component is at `frontend/app/(app)/_components/DeleteButton.tsx` and takes `action` (async fn returning `{ error?: string }`) and `confirmMessage` props. The `deleteMaterialAction` is already exported from `frontend/app/actions/materials.ts`.

- [ ] **Step 1: Create the directory and file**

Create `frontend/app/(app)/materials/[matId]/_components/MaterialDetailForm.tsx` with this exact content:

```tsx
"use client"

import { useState } from "react"
import { updateMaterialAction, deleteMaterialAction } from "@/app/actions/materials"
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
import type { Material } from "@/lib/api"

type Props = { material: Material }

export function MaterialDetailForm({ material }: Props) {
  const [name, setName] = useState(material.name)
  const [sku, setSku] = useState(material.sku)
  const [category, setCategory] = useState(material.category)
  const [thicknessInput, setThicknessInput] = useState(
    (material.thickness_options ?? []).join(", ")
  )
  const [pricePerM2, setPricePerM2] = useState(
    material.price_per_m2 != null ? String(material.price_per_m2) : ""
  )
  const [edgebandingPrice, setEdgebandingPrice] = useState(
    material.edgebanding_price_per_mm != null ? String(material.edgebanding_price_per_mm) : ""
  )
  const [grainDirection, setGrainDirection] = useState<"horizontal" | "vertical" | "none">(
    (["horizontal", "vertical", "none"] as const).includes(
      material.grain_direction as "horizontal" | "vertical" | "none"
    )
      ? (material.grain_direction as "horizontal" | "vertical" | "none")
      : "none"
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

    if (thicknessOptions.length === 0) {
      setError("Please enter at least one valid thickness value (e.g. 16, 18, 22)")
      setIsSubmitting(false)
      return
    }

    const parsedPrice = parseFloat(pricePerM2)
    if (!Number.isFinite(parsedPrice)) {
      setError("Please enter a valid price per m²")
      setIsSubmitting(false)
      return
    }

    const result = await updateMaterialAction(material.id, {
      name,
      sku,
      category,
      thickness_options: thicknessOptions,
      price_per_m2: parsedPrice,
      edgebanding_price_per_mm: edgebandingPrice ? parseFloat(edgebandingPrice) : null,
      grain_direction: grainDirection,
    })

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: updateMaterialAction redirects to /materials/${matId}
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-xs text-slate-400 mb-1">
          Name
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="sku" className="block text-xs text-slate-400 mb-1">
          SKU
        </label>
        <input
          id="sku"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-xs text-slate-400 mb-1">
          Category
        </label>
        <input
          id="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="thicknessInput" className="block text-xs text-slate-400 mb-1">
          Thickness options (mm, comma-separated)
        </label>
        <input
          id="thicknessInput"
          required
          value={thicknessInput}
          onChange={(e) => setThicknessInput(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="pricePerM2" className="block text-xs text-slate-400 mb-1">
          Price per m²
        </label>
        <input
          id="pricePerM2"
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
        <label htmlFor="edgebandingPrice" className="block text-xs text-slate-400 mb-1">
          Edgebanding price per mm (optional)
        </label>
        <input
          id="edgebandingPrice"
          type="number"
          step="0.001"
          min="0"
          value={edgebandingPrice}
          onChange={(e) => setEdgebandingPrice(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="grainDirection" className="block text-xs text-slate-400 mb-1">
          Grain direction
        </label>
        <select
          id="grainDirection"
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

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
        >
          {isSubmitting ? "Saving…" : "Save Changes"}
        </button>
        <DeleteButton
          action={() => deleteMaterialAction(material.id)}
          confirmMessage={`Delete "${material.name}"? This cannot be undone.`}
        />
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Verify TypeScript + Jest**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TypeScript errors; 55 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/materials/[matId]/_components/MaterialDetailForm.tsx" && git commit -m "feat: add MaterialDetailForm inline edit component (sub-plan 16, task 2)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create detail page + remove old edit pages

**Files:**
- Create: `frontend/app/(app)/materials/[matId]/page.tsx`
- Delete: `frontend/app/(app)/materials/[matId]/edit/page.tsx`
- Delete: `frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx`

Context: The Server Component fetches the material via `getMaterial(token, matId)` (already in `lib/api.ts`). Role check: `session.user.role === "admin" || session.user.role === "manufacturer"`. The old edit pages at `[matId]/edit/` are superseded and must be removed so Next.js doesn't keep serving the old route.

- [ ] **Step 1: Create `frontend/app/(app)/materials/[matId]/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getMaterial, ApiError, type Material } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { MaterialDetailForm } from "./_components/MaterialDetailForm"

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ matId: string }>
}) {
  const { matId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"

  let material!: Material
  try {
    material = await getMaterial(token, matId)
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
      <h1 className="text-lg font-semibold text-slate-50 mb-2">{material.name}</h1>
      <p className="text-xs text-slate-500 mb-6 font-mono">{material.id}</p>

      {canManage ? (
        <MaterialDetailForm material={material} />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col gap-3 text-sm">
          <div>
            <span className="block text-xs text-slate-400 mb-1">SKU</span>
            <p className="text-slate-100">{material.sku}</p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Category</span>
            <p className="text-slate-100">{material.category}</p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Thickness options (mm)</span>
            <p className="text-slate-100">{(material.thickness_options ?? []).join(", ")}</p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Price per m²</span>
            <p className="text-slate-100">
              {material.price_per_m2 != null ? `$${Number(material.price_per_m2).toFixed(2)}` : "—"}
            </p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Edgebanding price per mm</span>
            <p className="text-slate-100">
              {material.edgebanding_price_per_mm != null
                ? `$${Number(material.edgebanding_price_per_mm).toFixed(3)}`
                : "—"}
            </p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Grain direction</span>
            <p className="text-slate-100">{material.grain_direction}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete old edit pages**

```bash
rm "/Users/rovshennurybayev/claude_agents/frontend/app/(app)/materials/[matId]/edit/page.tsx"
rm "/Users/rovshennurybayev/claude_agents/frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx"
rmdir "/Users/rovshennurybayev/claude_agents/frontend/app/(app)/materials/[matId]/edit/_components"
rmdir "/Users/rovshennurybayev/claude_agents/frontend/app/(app)/materials/[matId]/edit"
```

- [ ] **Step 3: Verify TypeScript + Jest**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TypeScript errors; 55 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/materials/[matId]/page.tsx" && git rm "app/(app)/materials/[matId]/edit/page.tsx" "app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx" && git commit -m "feat: add material detail page, remove separate edit pages (sub-plan 16, task 3)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Push

- [ ] **Step 1: Run full frontend checks**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 55 tests pass.

- [ ] **Step 2: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
