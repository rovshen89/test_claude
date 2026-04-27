# Frontend Room Schema Edit — Implementation Plan (Sub-plan 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the `PUT /projects/{project_id}/room-schema` endpoint through the frontend, allowing users to view and edit their project's room schema from the project detail page.

**Architecture:** Add `updateRoomSchema()` to `lib/api.ts`, create a server action `updateRoomSchemaAction` in `app/actions/projects.ts`, add a Room Schema section to the project detail page, and create an edit page with a JSON textarea form following the same pattern as the Furniture Type form.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

### Task 1: Add `updateRoomSchema` to `lib/api.ts` with tests

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

Context: `apiFetch<T>()` is the internal helper that adds `Authorization` + `Content-Type` headers. All other PUT endpoints follow the same pattern. The existing `Project` type already has `room_schema: Record<string, unknown> | null`. Current test count is 44.

- [ ] **Step 1: Write 2 failing tests**

Add to `frontend/tests/lib/api.test.ts`:

First, add `updateRoomSchema` to the import block at the top (after `generateBom`):
```ts
import {
  // ... existing imports ...
  updateRoomSchema,
  // ... rest of imports ...
} from "@/lib/api"
```

Then add these two describe blocks at the end of the file:

```ts
describe("updateRoomSchema", () => {
  it("PUTs room_schema with Authorization header and returns Project", async () => {
    const schema = { width: 3000, height: 2400, depth: 4000 }
    const fixture = {
      id: "proj-1",
      user_id: "u1",
      name: "My Project",
      room_schema: schema,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await updateRoomSchema("tok", "proj-1", schema)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/room-schema",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ room_schema: schema }),
      })
    )
    expect(result.id).toBe("proj-1")
    expect(result.room_schema).toEqual(schema)
  })

  it("throws ApiError with status 404 when project not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    })

    await expect(updateRoomSchema("tok", "bad-id", {})).rejects.toMatchObject({
      status: 404,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest tests/lib/api.test.ts --no-coverage 2>&1 | tail -20
```

Expected: 2 failures mentioning `updateRoomSchema` is not exported / not a function.

- [ ] **Step 3: Implement `updateRoomSchema` in `frontend/lib/api.ts`**

Add after `generateBom` (at the very end of the file):

```ts
export async function updateRoomSchema(
  token: string,
  projectId: string,
  schema: Record<string, unknown>
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/room-schema`, token, {
    method: "PUT",
    body: JSON.stringify({ room_schema: schema }),
  })
}
```

- [ ] **Step 4: Run tests to verify all 46 pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest tests/lib/api.test.ts --no-coverage 2>&1 | tail -10
```

Expected: 46 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add lib/api.ts tests/lib/api.test.ts && git commit -m "feat: add updateRoomSchema API function with tests (sub-plan 10, task 1)"
```

---

### Task 2: Server action + project page Room Schema section

**Files:**
- Create: `frontend/app/actions/projects.ts`
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`

Context: The server action pattern follows `app/actions/furniture-types.ts` exactly — `"use server"` at module top, `auth()` for token, try/catch for ApiError, `revalidatePath` then `redirect` outside the try block. The project page currently has a `flex justify-between items-center mb-6` header div at line 85-93, followed by `{configs.length === 0 ? (` at line 94. The Room Schema section goes between those two.

- [ ] **Step 1: Create `frontend/app/actions/projects.ts`**

```ts
"use server"

import { auth } from "@/lib/auth"
import { updateRoomSchema, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function updateRoomSchemaAction(
  projectId: string,
  schema: Record<string, unknown>
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await updateRoomSchema(token, projectId, schema)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
```

- [ ] **Step 2: Add Room Schema section to `frontend/app/(app)/projects/[id]/page.tsx`**

The file currently has the `</div>` closing the header block at line 93, then `{configs.length === 0 ? (` at line 94. Insert the Room Schema section between them.

Find this exact block (lines 93-94):
```tsx
      </div>
      {configs.length === 0 ? (
```

Replace with:
```tsx
      </div>
      {/* Room Schema */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-slate-300">Room Schema</h2>
          <Link
            href={`/projects/${id}/room-schema/edit`}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            Edit →
          </Link>
        </div>
        {project.room_schema ? (
          <div className="text-xs text-slate-400 space-y-0.5">
            {Object.entries(project.room_schema).map(([k, v]) => (
              <div key={k}>
                <span className="text-slate-500">{k}:</span>{" "}
                <span>{String(v)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Not configured</p>
        )}
      </section>
      {configs.length === 0 ? (
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (clean compile).

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add app/actions/projects.ts "app/(app)/projects/[id]/page.tsx" && git commit -m "feat: add updateRoomSchemaAction and Room Schema section on project page (sub-plan 10, task 2)"
```

---

### Task 3: Room Schema edit page and client form

**Files:**
- Create: `frontend/app/(app)/projects/[id]/room-schema/edit/page.tsx`
- Create: `frontend/app/(app)/projects/[id]/room-schema/edit/_components/RoomSchemaForm.tsx`

Context: The edit page follows the same Server Component pattern as `furniture-types/new/page.tsx` — auth guard, fetch project (with 404/401 handling), render client form. The form follows `NewFurnitureTypeForm.tsx` — JSON textarea, `JSON.parse` validation, call server action, show error in red box. No role gating for room schema (any authenticated user owns their own projects).

- [ ] **Step 1: Create `frontend/app/(app)/projects/[id]/room-schema/edit/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getProject, ApiError } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import { RoomSchemaForm } from "./_components/RoomSchemaForm"

export default async function RoomSchemaEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let project
  try {
    project = await getProject(token, id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Edit Room Schema</h1>
      <RoomSchemaForm projectId={id} currentSchema={project.room_schema} />
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/app/(app)/projects/[id]/room-schema/edit/_components/RoomSchemaForm.tsx`**

```tsx
"use client"

import { useState } from "react"
import { updateRoomSchemaAction } from "@/app/actions/projects"

export function RoomSchemaForm({
  projectId,
  currentSchema,
}: {
  projectId: string
  currentSchema: Record<string, unknown> | null
}) {
  const [schemaText, setSchemaText] = useState(
    currentSchema !== null ? JSON.stringify(currentSchema, null, 2) : ""
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(schemaText)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    setIsSubmitting(true)
    const result = await updateRoomSchemaAction(projectId, parsed)
    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: server action redirects to /projects/${projectId}
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="schema" className="text-xs font-medium text-slate-400">
          Room Schema (JSON)
        </label>
        <textarea
          id="schema"
          required
          rows={12}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          placeholder={'{\n  "width": 3000,\n  "height": 2400,\n  "depth": 4000\n}'}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save"}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (clean compile).

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -15
```

Expected: 46 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/projects/[id]/room-schema/" && git commit -m "feat: add room schema edit page and form (sub-plan 10, task 3)"
```
