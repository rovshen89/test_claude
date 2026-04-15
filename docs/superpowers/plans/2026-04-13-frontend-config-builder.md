# Frontend Configuration Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configuration creation form to the Next.js frontend — furniture type selector, dynamic dimension inputs from schema, save as draft, and a confirm button on project detail cards.

**Architecture:** Server Component shell fetches furniture types and passes them to a Client Component form. All backend mutations go through `"use server"` Server Actions in `app/actions/configurations.ts` — the JWT token never reaches the browser. A `<ConfirmButton>` Client Component on draft cards calls the confirm Server Action and triggers a `revalidatePath` refresh.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Actions, Jest 29 unit tests.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/lib/api.ts` | Modify | Add `getFurnitureTypes`, `createConfiguration`, `confirmConfiguration` |
| `frontend/tests/lib/api.test.ts` | Modify | Add 4 tests for the three new helpers |
| `frontend/app/actions/configurations.ts` | Create | Server Actions: `createConfigurationAction`, `confirmConfigurationAction` |
| `frontend/app/(app)/projects/[id]/_components/ConfirmButton.tsx` | Create | Client Component — confirm draft button |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify | Activate New Config link, add `<ConfirmButton>` to draft cards |
| `frontend/app/(app)/projects/[id]/configurations/new/page.tsx` | Create | Server Component shell — auth + fetch furniture types |
| `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` | Create | Client Component — type selector + dimension inputs |

---

## Task 1: API Helpers + Tests

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

- [ ] **Step 1: Add 4 failing tests to `frontend/tests/lib/api.test.ts`**

Add these three `describe` blocks at the end of the file, and update the import at the top.

Replace the existing import block (lines 1–8):

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
} from "@/lib/api"
```

Append at the end of the file:

```ts
describe("getFurnitureTypes", () => {
  it("calls GET /furniture-types with Authorization header and returns array", async () => {
    const fixture = [{ id: "ft1", category: "wardrobe", schema: {}, tenant_id: null }]
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getFurnitureTypes("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toEqual(fixture)
  })
})

describe("createConfiguration", () => {
  it("posts to /configurations with project_id, furniture_type_id, applied_config", async () => {
    const fixture = {
      id: "c1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { width: 900 },
      placement: null,
      status: "draft",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await createConfiguration("tok", "p1", "ft1", { width: 900 })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project_id: "p1",
          furniture_type_id: "ft1",
          applied_config: { width: 900 },
        }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("c1")
    expect(result.status).toBe("draft")
  })
})

describe("confirmConfiguration", () => {
  it("posts to /configurations/{id}/confirm and returns updated config", async () => {
    const fixture = {
      id: "c1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: {},
      placement: null,
      status: "confirmed",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await confirmConfiguration("tok", "c1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/c1/confirm",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.status).toBe("confirmed")
  })

  it("throws ApiError(409) on 409 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => "already confirmed" })
    await expect(confirmConfiguration("tok", "c1")).rejects.toMatchObject({ status: 409 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm test 2>&1 | tail -20
```

Expected: 4 new tests FAIL with something like `"getFurnitureTypes is not a function"`. The existing 10 tests should still pass.

- [ ] **Step 3: Add three new functions to `frontend/lib/api.ts`**

Append after the existing `getFurnitureType` function (after line 68):

```ts
export async function getFurnitureTypes(token: string): Promise<FurnitureType[]> {
  return apiFetch<FurnitureType[]>("/furniture-types", token)
}

export async function createConfiguration(
  token: string,
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: Record<string, number>
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

export async function confirmConfiguration(token: string, configId: string): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}/confirm`, token, {
    method: "POST",
  })
}
```

- [ ] **Step 4: Run tests to verify all 14 pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm test 2>&1 | tail -15
```

Expected:
```
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
```

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/lib/api.ts frontend/tests/lib/api.test.ts
git commit -m "feat: add getFurnitureTypes, createConfiguration, confirmConfiguration API helpers"
```

---

## Task 2: Server Actions

**Files:**
- Create: `frontend/app/actions/configurations.ts`

- [ ] **Step 1: Create `frontend/app/actions/` directory and file**

Create `frontend/app/actions/configurations.ts` with this exact content:

```ts
"use server"

import { auth } from "@/lib/auth"
import { createConfiguration, confirmConfiguration, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createConfigurationAction(
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: Record<string, number>
): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
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
  try {
    await confirmConfiguration(token, configId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError && e.status === 409) return { error: "already_confirmed" }
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  return null
}
```

Note on `redirect()` and try/catch: `redirect()` throws `NEXT_REDIRECT` internally. Calling `redirect("/login")` inside the catch block throws `NEXT_REDIRECT`, which exits the catch block and propagates up — this is intentional and correct. The final `redirect(...)` / `revalidatePath(...)` outside the try/catch only runs when no error occurred.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/app/actions/configurations.ts
git commit -m "feat: add createConfigurationAction and confirmConfigurationAction Server Actions"
```

---

## Task 3: ConfirmButton + Update Project Detail Page

**Files:**
- Create: `frontend/app/(app)/projects/[id]/_components/ConfirmButton.tsx`
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Create `frontend/app/(app)/projects/[id]/_components/ConfirmButton.tsx`**

```tsx
"use client"

import { useState } from "react"
import { confirmConfigurationAction } from "@/app/actions/configurations"

export function ConfirmButton({
  configId,
  projectId,
}: {
  configId: string
  projectId: string
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleClick() {
    setState("loading")
    setErrorMsg(null)
    const result = await confirmConfigurationAction(configId, projectId)
    if (result?.error) {
      setState("error")
      setErrorMsg(result.error === "already_confirmed" ? "Already confirmed" : "Failed to confirm")
    } else {
      setState("idle")
      // revalidatePath in the Server Action causes the parent Server Component to re-render
    }
  }

  if (state === "error") {
    return <span className="text-xs text-red-400">{errorMsg}</span>
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {state === "loading" ? "Confirming…" : "Confirm"}
    </button>
  )
}
```

- [ ] **Step 2: Update `frontend/app/(app)/projects/[id]/page.tsx`**

Make two changes:

**Change 1** — add `ConfirmButton` import at the top (after the existing imports):

```ts
import { ConfirmButton } from "./_components/ConfirmButton"
```

**Change 2** — replace the disabled `<button>` with an active `<Link>`:

Find and replace:
```tsx
        <button
          disabled
          title="Configuration builder coming in Sub-plan 2"
          className="border border-slate-700 text-slate-600 rounded-md px-4 py-2 text-sm font-medium cursor-not-allowed"
        >
          + New Configuration
        </button>
```

Replace with:
```tsx
        <Link
          href={`/projects/${id}/configurations/new`}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Configuration
        </Link>
```

**Change 3** — add `<ConfirmButton>` inside each draft config card. Find the config card's inner div (after the `<span>` status badge):

Find:
```tsx
              </div>
            </div>
          </div>
```

This closing structure appears at the end of the card. The full card currently is:
```tsx
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
            </div>
```

Replace with:
```tsx
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
              {cfg.status === "draft" && (
                <div className="mt-3 flex justify-end">
                  <ConfirmButton configId={cfg.id} projectId={id} />
                </div>
              )}
            </div>
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add "frontend/app/(app)/projects/[id]/_components/ConfirmButton.tsx" "frontend/app/(app)/projects/[id]/page.tsx"
git commit -m "feat: add ConfirmButton to draft cards, activate New Configuration link"
```

---

## Task 4: Configuration Creation Page + Form

**Files:**
- Create: `frontend/app/(app)/projects/[id]/configurations/new/page.tsx`
- Create: `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx`

- [ ] **Step 1: Create `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx`**

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { createConfigurationAction } from "@/app/actions/configurations"
import type { FurnitureType } from "@/lib/api"

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
        newErrors[key] = `Must be between ${spec.min} and ${spec.max} mm (step ${spec.step})`
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
    const result = await createConfigurationAction(projectId, selectedTypeId, dimensions)
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
                    step={spec.step}
                    value={dimensions[key] ?? spec.default}
                    onChange={(e) => handleDimensionChange(key, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    {spec.min} – {spec.max}, step {spec.step}
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

- [ ] **Step 2: Create `frontend/app/(app)/projects/[id]/configurations/new/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getProject, getFurnitureTypes, ApiError, type FurnitureType } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ConfigurationForm } from "./_components/ConfigurationForm"

export default async function NewConfigurationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let furnitureTypes: FurnitureType[] = []
  try {
    const results = await Promise.all([
      getProject(token, id),       // validates project exists + ownership → 404 if not found
      getFurnitureTypes(token),
    ])
    furnitureTypes = results[1]
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link href={`/projects/${id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Configuration</h1>
      {furnitureTypes.length === 0 ? (
        <p className="text-slate-500 text-sm">No furniture types available.</p>
      ) : (
        <ConfigurationForm furnitureTypes={furnitureTypes} projectId={id} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm test 2>&1 | tail -10
```

Expected:
```
Tests:       14 passed, 14 total
```

```bash
cd /Users/rovshennurybayev/claude_agents/backend
.venv312/bin/python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 103 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add "frontend/app/(app)/projects/[id]/configurations/new/page.tsx" "frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx"
git commit -m "feat: add configuration creation page with dynamic dimension form"
```
