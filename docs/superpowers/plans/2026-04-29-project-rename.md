# Project Rename — Implementation Plan (Sub-plan 15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PUT /projects/{id}` backend endpoint and a `/projects/[id]/edit` frontend page so users can rename their projects.

**Architecture:** Backend adds `ProjectUpdate` schema and a PUT endpoint following the same ownership pattern as the delete endpoint. Frontend adds `updateProject` API function, `updateProjectAction` server action, an edit page, and an "Edit name →" link on the project detail page.

**Tech Stack:** FastAPI + SQLAlchemy async + pytest; Next.js 15 App Router + NextAuth v5 + Tailwind CSS + Jest.

---

### Task 1: Backend — `ProjectUpdate` schema + `PUT /projects/{id}` + tests

**Files:**
- Modify: `backend/app/schemas/project.py`
- Modify: `backend/app/api/projects.py`
- Modify: `backend/tests/test_projects.py`

Context: `ProjectCreate` has only `name: str`. `_register_and_login` in test_projects.py defaults to `role="designer"`. The delete endpoint checks `project.user_id != user.id` — same pattern for PUT.

- [x] **Step 1: Add `ProjectUpdate` to `backend/app/schemas/project.py`**

Add after `ProjectCreate`:

```python
class ProjectUpdate(BaseModel):
    name: Optional[str] = None
```

`Optional` is already imported.

- [x] **Step 2: Write 2 failing tests at the end of `backend/tests/test_projects.py`**

```python
@pytest.mark.asyncio
async def test_update_project(client):
    headers = await _register_and_login(client, "upd_proj@example.com")
    r = await client.post("/projects", json={"name": "Original"}, headers=headers)
    project_id = r.json()["id"]

    response = await client.put(
        f"/projects/{project_id}",
        json={"name": "Renamed"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


@pytest.mark.asyncio
async def test_update_project_wrong_owner(client):
    headers_a = await _register_and_login(client, "upd_own@example.com")
    headers_b = await _register_and_login(client, "upd_other@example.com")
    r = await client.post("/projects", json={"name": "Mine"}, headers=headers_a)
    project_id = r.json()["id"]

    response = await client.put(
        f"/projects/{project_id}",
        json={"name": "Stolen"},
        headers=headers_b,
    )
    assert response.status_code == 404
```

- [x] **Step 3: Run tests to confirm they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_projects.py::test_update_project tests/test_projects.py::test_update_project_wrong_owner -x -q 2>&1 | tail -10
```

Expected: 2 failures (405 Method Not Allowed).

- [x] **Step 4: Update imports in `backend/app/api/projects.py`**

Read the file. The current schema import is:
```python
from app.schemas.project import ProjectCreate, ProjectResponse, RoomSchemaUpdate
```

Replace with:
```python
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate, RoomSchemaUpdate
```

- [x] **Step 5: Add PUT endpoint to `backend/app/api/projects.py`**

Add after the `GET /{project_id}` endpoint (before `update_room_schema`):

```python
@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project
```

- [x] **Step 6: Run all project tests**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_projects.py -q 2>&1 | tail -10
```

Expected: all pass.

- [x] **Step 7: Run full backend suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 119 passed (117 + 2 new), 0 failures.

- [x] **Step 8: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && git add app/schemas/project.py app/api/projects.py tests/test_projects.py && git commit -m "feat: add PUT /projects/{id} rename endpoint (sub-plan 15, task 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — `updateProject` API function + test

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

Context: Current test count is 54. `apiFetch` is already defined.

- [x] **Step 1: Add `ProjectUpdate` type and `updateProject` function to `frontend/lib/api.ts`**

Append at the end of `frontend/lib/api.ts`:

```ts
export type ProjectUpdate = {
  name?: string
}

export async function updateProject(
  token: string,
  projectId: string,
  data: ProjectUpdate
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}`, token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}
```

- [x] **Step 2: Write 1 failing test**

Add `updateProject` and `type ProjectUpdate` to the import block in `frontend/tests/lib/api.test.ts`. Then append at the end of the file:

```ts
describe("updateProject", () => {
  it("PUTs /projects/:id with Authorization header and returns Project", async () => {
    const fixture = {
      id: "p-1",
      user_id: "u-1",
      name: "Renamed",
      room_schema: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await updateProject("tok", "p-1", { name: "Renamed" })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/p-1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ name: "Renamed" }),
      })
    )
    expect(result.name).toBe("Renamed")
  })
})
```

- [x] **Step 3: Run tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -10
```

Expected: 55 tests, 0 failures.

- [x] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add lib/api.ts tests/lib/api.test.ts && git commit -m "feat: add updateProject API function (sub-plan 15, task 2)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — server action + edit page + edit form + project detail link

**Files:**
- Modify: `frontend/app/actions/projects.ts`
- Create: `frontend/app/(app)/projects/[id]/edit/page.tsx`
- Create: `frontend/app/(app)/projects/[id]/edit/_components/EditProjectForm.tsx`
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`

- [x] **Step 1: Add `updateProjectAction` to `frontend/app/actions/projects.ts`**

Read the file first. The current import is:
```ts
import { updateRoomSchema, deleteProject, ApiError } from "@/lib/api"
```

Replace with:
```ts
import { updateRoomSchema, deleteProject, updateProject, ApiError } from "@/lib/api"
```

Then append to the file:

```ts
export async function updateProjectAction(
  projectId: string,
  data: { name: string }
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await updateProject(token, projectId, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
```

- [x] **Step 2: Create `frontend/app/(app)/projects/[id]/edit/_components/EditProjectForm.tsx`**

```tsx
"use client"

import { useState } from "react"
import { updateProjectAction } from "@/app/actions/projects"

export function EditProjectForm({
  projectId,
  currentName,
}: {
  projectId: string
  currentName: string
}) {
  const [name, setName] = useState(currentName)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const result = await updateProjectAction(projectId, { name })
    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: action redirects to project page
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="name" className="block mb-1 text-xs font-medium text-slate-400">
          Project Name
        </label>
        <input
          id="name"
          required
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save"}
      </button>
    </form>
  )
}
```

- [x] **Step 3: Create `frontend/app/(app)/projects/[id]/edit/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getProject, ApiError, type Project } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { EditProjectForm } from "./_components/EditProjectForm"

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let project!: Project
  try {
    project = await getProject(token, id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-lg">
      <div className="mb-2">
        <Link href={`/projects/${id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Rename Project</h1>
      <EditProjectForm projectId={id} currentName={project.name} />
    </div>
  )
}
```

- [x] **Step 4: Add "Edit name →" link to `frontend/app/(app)/projects/[id]/page.tsx`**

Read the file first. Find the header section:

```tsx
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold text-slate-50">{project.name}</h1>
        <Link
          href={`/projects/${id}/configurations/new`}
```

Replace with:

```tsx
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-50">{project.name}</h1>
          <Link
            href={`/projects/${id}/edit`}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Edit name
          </Link>
        </div>
        <Link
          href={`/projects/${id}/configurations/new`}
```

- [x] **Step 5: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors; 55 tests pass.

- [x] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add app/actions/projects.ts "app/(app)/projects/[id]/edit/" "app/(app)/projects/[id]/page.tsx" && git commit -m "feat: add project rename edit page (sub-plan 15, task 3)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Push everything

- [x] **Step 1: Run full backend test suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 119 passed, 0 failures.

- [x] **Step 2: Run full frontend tests + TypeScript check**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors; 55 tests pass.

- [x] **Step 3: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
