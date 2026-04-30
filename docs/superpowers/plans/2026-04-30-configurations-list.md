# Configurations List Page — Implementation Plan (Sub-plan 17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level `/configurations` page listing all of the current user's configurations across every project, backed by making `project_id` optional on `GET /configurations`.

**Architecture:** The backend `list_configurations` endpoint gains an optional `project_id` param; when omitted it joins through `Project` to return all configs owned by the current user. The frontend gets a `listAllConfigurations` API function, a new Server Component page, and a nav link.

**Tech Stack:** FastAPI + SQLAlchemy async + pytest; Next.js 15 App Router + NextAuth v5 + Tailwind CSS + Jest.

---

### Task 1: Backend — make `project_id` optional + 2 tests

**Files:**
- Modify: `backend/app/api/configurations.py`
- Modify: `backend/tests/test_configurations.py`

Context: `list_configurations` currently declares `project_id: UUID = Query(...)` (mandatory). `Optional` is not yet imported in `configurations.py`. The `_setup` helper in the test file registers a manufacturer user, creates one project and one furniture type, and returns `(headers, project_id, ft_id)`. Current backend test count: 119.

- [ ] **Step 1: Write 2 failing tests at the end of `backend/tests/test_configurations.py`**

```python
@pytest.mark.asyncio
async def test_list_all_configurations(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/projects", json={"name": "Second"}, headers=headers)
    project_id_2 = r.json()["id"]
    await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200, "height": 2100, "depth": 580},
    }, headers=headers)
    await client.post("/configurations", json={
        "project_id": project_id_2,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1000, "height": 2000, "depth": 500},
    }, headers=headers)

    response = await client.get("/configurations", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_list_all_configurations_isolation(client):
    headers_a, project_id_a, ft_id_a = await _setup(client)
    headers_b, _, _ = await _setup(client)
    await client.post("/configurations", json={
        "project_id": project_id_a,
        "furniture_type_id": ft_id_a,
        "applied_config": {"width": 1200, "height": 2100, "depth": 580},
    }, headers=headers_a)

    response = await client.get("/configurations", headers=headers_b)
    assert response.status_code == 200
    assert len(response.json()) == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_configurations.py::test_list_all_configurations tests/test_configurations.py::test_list_all_configurations_isolation -x -q 2>&1 | tail -10
```

Expected: 2 failures (422 Unprocessable Entity — missing required `project_id`).

- [ ] **Step 3: Add `Optional` import to `backend/app/api/configurations.py`**

Read the file. The current imports start with:
```python
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
```

Add `from typing import Optional` after the `from uuid import UUID` line:
```python
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
```

- [ ] **Step 4: Update `list_configurations` in `backend/app/api/configurations.py`**

Find the existing `list_configurations` function (lines ~52–62):
```python
@router.get("", response_model=list[ConfigurationResponse])
async def list_configurations(
    project_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user)
    result = await db.execute(
        select(Configuration).where(Configuration.project_id == project_id)
    )
    return result.scalars().all()
```

Replace with:
```python
@router.get("", response_model=list[ConfigurationResponse])
async def list_configurations(
    project_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if project_id is not None:
        await _get_owned_project(db, project_id, user)
        result = await db.execute(
            select(Configuration).where(Configuration.project_id == project_id)
        )
    else:
        result = await db.execute(
            select(Configuration)
            .join(Project, Configuration.project_id == Project.id)
            .where(Project.user_id == user.id)
        )
    return result.scalars().all()
```

- [ ] **Step 5: Run new tests to confirm they pass**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_configurations.py::test_list_all_configurations tests/test_configurations.py::test_list_all_configurations_isolation -x -q 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 6: Run full backend suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 121 passed, 0 failures.

- [ ] **Step 7: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && git add app/api/configurations.py tests/test_configurations.py && git commit -m "feat: make project_id optional in GET /configurations (sub-plan 17, task 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — `listAllConfigurations` API function + test

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

Context: `apiFetch<T>(path, token, options?)` is the generic fetch helper. `listConfigurations` at line 109 already calls `/configurations?project_id=...`. Current Jest test count: 55. The test file mocks `fetch` via `mockFetch` and uses `mockResolvedValueOnce`.

- [ ] **Step 1: Append `listAllConfigurations` to `frontend/lib/api.ts`**

Append at the end of `frontend/lib/api.ts`:
```ts
export async function listAllConfigurations(token: string): Promise<Configuration[]> {
  return apiFetch<Configuration[]>("/configurations", token)
}
```

- [ ] **Step 2: Add `listAllConfigurations` to the import in `frontend/tests/lib/api.test.ts`**

Read the file. Find the import block that imports from `@/lib/api`. Add `listAllConfigurations` to it.

- [ ] **Step 3: Append the new test at the end of `frontend/tests/lib/api.test.ts`**

```ts
describe("listAllConfigurations", () => {
  it("GETs /configurations with Authorization header and returns array", async () => {
    const fixture = [
      {
        id: "c-1",
        project_id: "p-1",
        furniture_type_id: "ft-1",
        applied_config: {},
        placement: null,
        status: "draft",
      },
    ]
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await listAllConfigurations("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("c-1")
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -5
```

Expected: 56 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add lib/api.ts tests/lib/api.test.ts && git commit -m "feat: add listAllConfigurations API function (sub-plan 17, task 2)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — configurations page + nav link

**Files:**
- Create: `frontend/app/(app)/configurations/page.tsx`
- Modify: `frontend/app/(app)/layout.tsx`

Context: `getProjects(token)` returns `Project[]`. `listAllConfigurations(token)` returns `Configuration[]` (added in Task 2). `Configuration` has `id`, `project_id`, `status` fields. `Project` has `id`, `name` fields. The nav in `layout.tsx` has links: Materials, Orders, Furniture Types, Settings. Add "Configurations" between Materials and Orders.

- [ ] **Step 1: Create `frontend/app/(app)/configurations/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import {
  getProjects,
  listAllConfigurations,
  ApiError,
  type Configuration,
  type Project,
} from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function ConfigurationsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let configurations: Configuration[] = []
  let projects: Project[] = []
  try {
    configurations = await listAllConfigurations(token)
    projects = await getProjects(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  const projectMap: Record<string, string> = {}
  for (const project of projects) {
    projectMap[project.id] = project.name
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Configurations</h1>
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-slate-400">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Project</th>
              <th className="text-left py-3 px-4">Config ID</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody>
            {configurations.map((cfg) => (
              <tr key={cfg.id} className="border-b border-slate-800 last:border-0">
                <td className="py-3 px-4">
                  <Link
                    href={`/projects/${cfg.project_id}`}
                    className="text-slate-200 hover:text-indigo-300"
                  >
                    {projectMap[cfg.project_id] ?? cfg.project_id}
                  </Link>
                </td>
                <td className="py-3 px-4 font-mono text-xs">{cfg.id.slice(0, 8)}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      cfg.status === "confirmed"
                        ? "bg-green-950 text-green-400 border border-green-900"
                        : "bg-amber-950 text-amber-400 border border-amber-900"
                    }`}
                  >
                    {cfg.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/projects/${cfg.project_id}/configurations/${cfg.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configurations.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No configurations yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add "Configurations" nav link to `frontend/app/(app)/layout.tsx`**

Read the file. Find the nav links section. The current order is: Materials, Orders, Furniture Types, Settings.

Find:
```tsx
          <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
            Materials
          </Link>
          <Link href="/orders" className="text-xs text-slate-400 hover:text-slate-200">
            Orders
          </Link>
```

Replace with:
```tsx
          <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
            Materials
          </Link>
          <Link href="/configurations" className="text-xs text-slate-400 hover:text-slate-200">
            Configurations
          </Link>
          <Link href="/orders" className="text-xs text-slate-400 hover:text-slate-200">
            Orders
          </Link>
```

- [ ] **Step 3: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 56 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/configurations/page.tsx" "app/(app)/layout.tsx" && git commit -m "feat: add configurations list page and nav link (sub-plan 17, task 3)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Push everything

- [ ] **Step 1: Run full backend suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 121 passed, 0 failures.

- [ ] **Step 2: Run full frontend checks**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 56 tests pass.

- [ ] **Step 3: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
