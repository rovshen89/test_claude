# Furniture Type Edit + Delete Endpoints — Implementation Plan (Sub-plan 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PUT /furniture-types/{id}` and `DELETE` endpoints for furniture types, materials, configurations, and projects — with full frontend coverage including an edit form and delete buttons.

**Architecture:** Backend-first (4 tasks), then frontend (3 tasks). Backend adds endpoints + tests to existing router files. Frontend adds api.ts functions, server actions, shared DeleteButton component, and edit/delete UI.

**Tech Stack:** FastAPI + SQLAlchemy async + pytest; Next.js 15 App Router + NextAuth v5 + Tailwind CSS + Jest.

---

### Task 1: Backend — `PUT /furniture-types/{ft_id}` + tests

**Files:**
- Modify: `backend/app/schemas/furniture_type.py`
- Modify: `backend/app/api/furniture_types.py`
- Modify: `backend/tests/test_furniture_types.py`

- [x] **Step 1: Add `FurnitureTypeUpdate` schema**

In `backend/app/schemas/furniture_type.py`, add after `FurnitureTypeCreate`:

```python
class FurnitureTypeUpdate(BaseModel):
    category: Optional[str] = None
    schema: Optional[Dict[str, Any]] = None
```

- [x] **Step 2: Write 4 failing tests**

Add at the end of `backend/tests/test_furniture_types.py`:

```python
@pytest.mark.asyncio
async def test_update_furniture_type(client):
    headers = await _register_and_login(client, "upd@example.com")
    r = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    ft_id = r.json()["id"]

    response = await client.put(
        f"/furniture-types/{ft_id}",
        json={"category": "cabinet", "schema": {"columns": 3}},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "cabinet"
    assert data["schema"] == {"columns": 3}


@pytest.mark.asyncio
async def test_update_global_furniture_type_admin_only(client):
    # Admin creates a global furniture type (no tenant_id)
    admin_headers = await _register_and_login(client, "adm@example.com", role="admin")
    r = await client.post(
        "/furniture-types",
        json={"category": "global_type", "schema": _WARDROBE_SCHEMA},
        headers=admin_headers,
    )
    ft_id = r.json()["id"]

    # Manufacturer cannot update global type
    mfr_headers = await _register_and_login(client, "mfr_upd@example.com", role="manufacturer")
    response = await client.put(
        f"/furniture-types/{ft_id}",
        json={"category": "blocked"},
        headers=mfr_headers,
    )
    assert response.status_code == 403

    # Admin can update global type
    response = await client.put(
        f"/furniture-types/{ft_id}",
        json={"category": "updated_global"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["category"] == "updated_global"


@pytest.mark.asyncio
async def test_delete_furniture_type(client):
    headers = await _register_and_login(client, "del_ft@example.com")
    r = await client.post(
        "/furniture-types",
        json={"category": "to_delete", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    ft_id = r.json()["id"]

    response = await client.delete(f"/furniture-types/{ft_id}", headers=headers)
    assert response.status_code == 204

    get_response = await client.get(f"/furniture-types/{ft_id}", headers=headers)
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_furniture_type_blocked_by_configuration(client):
    headers = await _register_and_login(client, "del_ft_cfg@example.com")
    r = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    ft_id = r.json()["id"]

    r = await client.post("/projects", json={"name": "P"}, headers=headers)
    project_id = r.json()["id"]
    await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {},
    }, headers=headers)

    response = await client.delete(f"/furniture-types/{ft_id}", headers=headers)
    assert response.status_code == 409
```

- [x] **Step 3: Run tests to confirm they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && python -m pytest tests/test_furniture_types.py -x -q 2>&1 | tail -15
```

Expected: 4 new tests fail.

- [x] **Step 4: Update imports in `furniture_types.py`**

Add `FurnitureTypeUpdate` to the schema import:
```python
from app.schemas.furniture_type import FurnitureTypeCreate, FurnitureTypeUpdate, FurnitureTypeResponse
```

Also add `Configuration` model import:
```python
from app.models.configuration import Configuration
```

- [x] **Step 5: Add PUT endpoint to `backend/app/api/furniture_types.py`**

Add after the existing `GET /{ft_id}` endpoint:

```python
@router.put("/{ft_id}", response_model=FurnitureTypeResponse)
async def update_furniture_type(
    ft_id: UUID,
    body: FurnitureTypeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    ft = await db.get(FurnitureType, ft_id)
    if not ft:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is not None and ft.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is None and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify global furniture types")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ft, field, value)
    await db.commit()
    await db.refresh(ft)
    return ft
```

- [x] **Step 6: Add DELETE endpoint to `backend/app/api/furniture_types.py`**

Add after the PUT endpoint:

```python
@router.delete("/{ft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_furniture_type(
    ft_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    ft = await db.get(FurnitureType, ft_id)
    if not ft:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is not None and ft.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is None and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete global furniture types")
    result = await db.execute(
        select(Configuration).where(Configuration.furniture_type_id == ft_id).limit(1)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: furniture type is used by existing configurations",
        )
    await db.delete(ft)
    await db.commit()
```

- [x] **Step 7: Run tests to confirm all pass**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && python -m pytest tests/test_furniture_types.py -x -q 2>&1 | tail -10
```

Expected: all tests pass (7+ tests, 0 failures).

- [x] **Step 8: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && git add app/schemas/furniture_type.py app/api/furniture_types.py tests/test_furniture_types.py && git commit -m "feat: add PUT and DELETE /furniture-types/{id} endpoints (sub-plan 13, task 1)"
```

---

### Task 2: Backend — DELETE endpoints for materials, configurations, projects + tests

**Files:**
- Modify: `backend/app/api/materials.py`
- Modify: `backend/app/api/configurations.py`
- Modify: `backend/app/api/projects.py`
- Modify: `backend/tests/test_materials.py`
- Modify: `backend/tests/test_configurations.py`
- Modify: `backend/tests/test_projects.py`

Context: configurations.py already imports `Configuration`, `Project`, `User`, `_get_owned_project`. projects.py already imports `Project`, `User`. Need to add `Configuration` + `Order` imports to projects.py.

- [x] **Step 1: Write 6 failing tests**

Add to `backend/tests/test_materials.py`:
```python
@pytest.mark.asyncio
async def test_delete_material(client):
    headers = await _register_and_login(client, "del_mat@example.com")
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=headers)
    mat_id = r.json()["id"]

    response = await client.delete(f"/materials/{mat_id}", headers=headers)
    assert response.status_code == 204

    get_response = await client.get(f"/materials/{mat_id}", headers=headers)
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_material_wrong_tenant(client):
    headers_a = await _register_and_login(client, "del_mat_a@example.com")
    headers_b = await _register_and_login(client, "del_mat_b@example.com")
    r = await client.post("/materials", json=_MATERIAL_BASE, headers=headers_a)
    mat_id = r.json()["id"]

    response = await client.delete(f"/materials/{mat_id}", headers=headers_b)
    assert response.status_code == 404
```

Add to `backend/tests/test_configurations.py`:
```python
@pytest.mark.asyncio
async def test_delete_draft_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.delete(f"/configurations/{config_id}", headers=headers)
    assert response.status_code == 204

    get_response = await client.get(f"/configurations/{config_id}", headers=headers)
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_confirmed_configuration_rejected(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {},
    }, headers=headers)
    config_id = r.json()["id"]
    await client.post(f"/configurations/{config_id}/confirm", headers=headers)

    response = await client.delete(f"/configurations/{config_id}", headers=headers)
    assert response.status_code == 409
```

Add to `backend/tests/test_projects.py`:
```python
@pytest.mark.asyncio
async def test_delete_project_cascades(client):
    headers = await _register_and_login(client, "del_proj@example.com")
    r = await client.post("/projects", json={"name": "To Delete"}, headers=headers)
    project_id = r.json()["id"]

    # Create a configuration in the project
    r_ft = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": {"x": 1}},
        headers=headers,
    )
    ft_id = r_ft.json()["id"]
    r_cfg = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {},
    }, headers=headers)
    config_id = r_cfg.json()["id"]

    response = await client.delete(f"/projects/{project_id}", headers=headers)
    assert response.status_code == 204

    assert (await client.get(f"/projects/{project_id}", headers=headers)).status_code == 404
    assert (await client.get(f"/configurations/{config_id}", headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_delete_other_users_project_returns_404(client):
    headers_a = await _register_and_login(client, "del_own@example.com")
    headers_b = await _register_and_login(client, "del_other@example.com")
    r = await client.post("/projects", json={"name": "Mine"}, headers=headers_a)
    project_id = r.json()["id"]

    response = await client.delete(f"/projects/{project_id}", headers=headers_b)
    assert response.status_code == 404
```

- [x] **Step 2: Run tests to confirm failures**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && python -m pytest tests/test_materials.py tests/test_configurations.py tests/test_projects.py -x -q 2>&1 | tail -15
```

Expected: 6 new tests fail (not found errors for DELETE endpoints).

- [x] **Step 3: Add DELETE to `backend/app/api/materials.py`**

Add after `update_material`:

```python
@router.delete("/{mat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    mat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)
    if mat.tenant_id is None and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete global materials")
    await db.delete(mat)
    await db.commit()
```

- [x] **Step 4: Add DELETE to `backend/app/api/configurations.py`**

Add `Order` import at the top:
```python
from app.models.order import Order
```

Add after `confirm_configuration`:

```python
@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_configuration(
    config_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    config = await db.get(Configuration, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await _get_owned_project(db, config.project_id, user)
    if config.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft configurations can be deleted")
    await db.delete(config)
    await db.commit()
```

- [x] **Step 5: Add DELETE to `backend/app/api/projects.py`**

Add `Configuration` and `Order` imports:
```python
from sqlalchemy import select
from app.models.configuration import Configuration
from app.models.order import Order
```

Add after `update_room_schema`:

```python
@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    configs_result = await db.execute(
        select(Configuration).where(Configuration.project_id == project_id)
    )
    for config in configs_result.scalars().all():
        order_result = await db.execute(
            select(Order).where(Order.configuration_id == config.id)
        )
        order = order_result.scalar_one_or_none()
        if order:
            await db.delete(order)
        await db.delete(config)
    await db.delete(project)
    await db.commit()
```

- [x] **Step 6: Run all backend tests**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && python -m pytest -x -q 2>&1 | tail -10
```

Expected: all tests pass (previously ~113, now ~119).

- [x] **Step 7: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && git add app/api/materials.py app/api/configurations.py app/api/projects.py tests/test_materials.py tests/test_configurations.py tests/test_projects.py && git commit -m "feat: add DELETE endpoints for materials, configurations, projects (sub-plan 13, task 2)"
```

---

### Task 3: Frontend — `lib/api.ts` additions + tests

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

Context: `apiFetch` currently calls `res.json()` for all OK responses. 204 No Content has no body — `res.json()` would throw. Fix: add a 204 check before calling `res.json()`. Current test count: 46.

- [x] **Step 1: Fix `apiFetch` for 204 responses**

In `frontend/lib/api.ts`, find:
```ts
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
```

Replace with:
```ts
  if (!res.ok) throw new ApiError(res.status, await res.text())
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
```

- [x] **Step 2: Add `FurnitureTypeUpdate` type and 5 new functions at the end of `frontend/lib/api.ts`**

```ts
export type FurnitureTypeUpdate = {
  category?: string
  schema?: Record<string, unknown>
}

export async function updateFurnitureType(
  token: string,
  ftId: string,
  data: FurnitureTypeUpdate
): Promise<FurnitureType> {
  return apiFetch<FurnitureType>(`/furniture-types/${ftId}`, token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteFurnitureType(token: string, ftId: string): Promise<void> {
  return apiFetch<void>(`/furniture-types/${ftId}`, token, { method: "DELETE" })
}

export async function deleteMaterial(token: string, matId: string): Promise<void> {
  return apiFetch<void>(`/materials/${matId}`, token, { method: "DELETE" })
}

export async function deleteConfiguration(token: string, configId: string): Promise<void> {
  return apiFetch<void>(`/configurations/${configId}`, token, { method: "DELETE" })
}

export async function deleteProject(token: string, projectId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}`, token, { method: "DELETE" })
}
```

- [x] **Step 3: Write 5 failing tests**

Add `updateFurnitureType`, `deleteFurnitureType`, `deleteMaterial`, `deleteConfiguration`, `deleteProject`, and `type FurnitureTypeUpdate` to the import block in `frontend/tests/lib/api.test.ts`.

Then add at the end of the file:

```ts
describe("updateFurnitureType", () => {
  it("PUTs with Authorization header and returns FurnitureType", async () => {
    const fixture = { id: "ft-1", tenant_id: null, category: "cabinet", schema: { columns: 3 } }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await updateFurnitureType("tok", "ft-1", { category: "cabinet", schema: { columns: 3 } })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types/ft-1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ category: "cabinet", schema: { columns: 3 } }),
      })
    )
    expect(result.category).toBe("cabinet")
  })
})

describe("deleteFurnitureType", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteFurnitureType("tok", "ft-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types/ft-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("deleteMaterial", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteMaterial("tok", "mat-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/mat-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("deleteConfiguration", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteConfiguration("tok", "cfg-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("deleteProject", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteProject("tok", "proj-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})
```

- [x] **Step 4: Run tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -10
```

Expected: 51 tests, 0 failures (46 + 5 new).

- [x] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add lib/api.ts tests/lib/api.test.ts && git commit -m "feat: add updateFurnitureType + delete API functions with apiFetch 204 fix (sub-plan 13, task 3)"
```

---

### Task 4: Frontend — Server actions (furniture-types, materials, configurations + project delete)

**Files:**
- Create: `frontend/app/actions/furniture-types.ts`
- Create: `frontend/app/actions/materials.ts`
- Create: `frontend/app/actions/configurations.ts`
- Modify: `frontend/app/actions/projects.ts`

- [x] **Step 1: Create `frontend/app/actions/furniture-types.ts`**

```ts
"use server"

import { auth } from "@/lib/auth"
import {
  updateFurnitureType,
  deleteFurnitureType,
  ApiError,
  type FurnitureTypeUpdate,
} from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function updateFurnitureTypeAction(
  ftId: string,
  data: FurnitureTypeUpdate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await updateFurnitureType(token, ftId, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/furniture-types/${ftId}`)
  redirect(`/furniture-types/${ftId}`)
}

export async function deleteFurnitureTypeAction(
  ftId: string
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await deleteFurnitureType(token, ftId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/furniture-types")
  redirect("/furniture-types")
}
```

- [x] **Step 2: Create `frontend/app/actions/materials.ts`**

```ts
"use server"

import { auth } from "@/lib/auth"
import { deleteMaterial, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function deleteMaterialAction(matId: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await deleteMaterial(token, matId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}
```

- [x] **Step 3: Create `frontend/app/actions/configurations.ts`**

```ts
"use server"

import { auth } from "@/lib/auth"
import { deleteConfiguration, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function deleteConfigurationAction(
  configId: string,
  projectId: string
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await deleteConfiguration(token, configId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
```

- [x] **Step 4: Add `deleteProjectAction` to `frontend/app/actions/projects.ts`**

Read the file first. Add these imports to the existing import block:
```ts
import { updateRoomSchema, deleteProject, ApiError } from "@/lib/api"
```
(replace the existing `import { updateRoomSchema, ApiError }`)

Then append to the file:

```ts
export async function deleteProjectAction(
  projectId: string
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await deleteProject(token, projectId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/dashboard")
  redirect("/dashboard")
}
```

- [x] **Step 5: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 51 tests pass.

- [x] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add app/actions/furniture-types.ts app/actions/materials.ts app/actions/configurations.ts app/actions/projects.ts && git commit -m "feat: add server actions for furniture type edit/delete and resource deletes (sub-plan 13, task 4)"
```

---

### Task 5: Frontend — Shared `DeleteButton` + furniture type edit page

**Files:**
- Create: `frontend/app/(app)/_components/DeleteButton.tsx`
- Create: `frontend/app/(app)/furniture-types/[ftId]/edit/page.tsx`
- Create: `frontend/app/(app)/furniture-types/[ftId]/edit/_components/EditFurnitureTypeForm.tsx`
- Modify: `frontend/app/(app)/furniture-types/[ftId]/page.tsx`

- [x] **Step 1: Create `frontend/app/(app)/_components/DeleteButton.tsx`**

```tsx
"use client"

import { useState } from "react"

export function DeleteButton({
  action,
  label = "Delete",
  confirmMessage = "Are you sure? This cannot be undone.",
}: {
  action: () => Promise<{ error?: string } | undefined>
  label?: string
  confirmMessage?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleClick() {
    if (!window.confirm(confirmMessage)) return
    setIsDeleting(true)
    setError(null)
    const result = await action()
    if (result?.error) {
      setError(result.error)
      setIsDeleting(false)
    }
    // On success: action redirects
  }

  return (
    <div>
      {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
      <button
        onClick={handleClick}
        disabled={isDeleting}
        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDeleting ? "Deleting…" : label}
      </button>
    </div>
  )
}
```

- [x] **Step 2: Create `frontend/app/(app)/furniture-types/[ftId]/edit/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getFurnitureType, ApiError, type FurnitureType } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { EditFurnitureTypeForm } from "./_components/EditFurnitureTypeForm"

export default async function FurnitureTypeEditPage({
  params,
}: {
  params: Promise<{ ftId: string }>
}) {
  const { ftId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect(`/furniture-types/${ftId}`)

  let ft!: FurnitureType
  try {
    ft = await getFurnitureType(token, ftId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-lg">
      <div className="mb-2">
        <Link href={`/furniture-types/${ftId}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to furniture type
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Edit Furniture Type</h1>
      <EditFurnitureTypeForm
        ftId={ftId}
        currentCategory={ft.category}
        currentSchema={ft.schema}
      />
    </div>
  )
}
```

- [x] **Step 3: Create `frontend/app/(app)/furniture-types/[ftId]/edit/_components/EditFurnitureTypeForm.tsx`**

```tsx
"use client"

import { useState } from "react"
import { updateFurnitureTypeAction } from "@/app/actions/furniture-types"

export function EditFurnitureTypeForm({
  ftId,
  currentCategory,
  currentSchema,
}: {
  ftId: string
  currentCategory: string
  currentSchema: Record<string, unknown>
}) {
  const [category, setCategory] = useState(currentCategory)
  const [schemaText, setSchemaText] = useState(JSON.stringify(currentSchema, null, 2))
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
    const result = await updateFurnitureTypeAction(ftId, { category, schema: parsed })
    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="category" className="block mb-1 text-xs font-medium text-slate-400">
          Category
        </label>
        <input
          id="category"
          required
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="schema" className="block mb-1 text-xs font-medium text-slate-400">
          Schema (JSON)
        </label>
        <textarea
          id="schema"
          required
          rows={18}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-indigo-500 resize-y"
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

- [x] **Step 4: Modify `frontend/app/(app)/furniture-types/[ftId]/page.tsx`**

Read the file. Add these imports if not present:
```tsx
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
import { deleteFurnitureTypeAction } from "@/app/actions/furniture-types"
```

After the `<h1>` heading (after `<h1 className="text-lg font-semibold text-slate-50 mb-6">{ft.category}</h1>`), add the action buttons for canManage users. First compute `canManage` from the session. The page currently has `const session = await auth()` but only uses it for the token. Add the canManage check and render buttons.

After the `<h1>` line, add:
```tsx
      {session.user.role === "admin" || session.user.role === "manufacturer" ? (
        <div className="flex gap-4 mb-6">
          <Link
            href={`/furniture-types/${ftId}/edit`}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
          >
            Edit →
          </Link>
          <DeleteButton
            action={() => deleteFurnitureTypeAction(ftId)}
            confirmMessage="Delete this furniture type? This cannot be undone."
          />
        </div>
      ) : null}
```

- [x] **Step 5: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors; 51 tests pass.

- [x] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/_components/DeleteButton.tsx" "app/(app)/furniture-types/[ftId]/edit/" "app/(app)/furniture-types/[ftId]/page.tsx" && git commit -m "feat: add DeleteButton component and furniture type edit page (sub-plan 13, task 5)"
```

---

### Task 6: Frontend — Delete buttons for materials, projects, and draft configurations

**Files:**
- Modify: `frontend/app/(app)/materials/page.tsx`
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`
- Modify: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`

- [x] **Step 1: Add delete buttons to materials list**

Read `app/(app)/materials/page.tsx`. Add imports:
```tsx
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
import { deleteMaterialAction } from "@/app/actions/materials"
```

In the table row where the "Edit →" link currently appears (there is already a link per row), add a delete button next to it. The table currently has: Name, Category, SKU, Price, Grain, Action. Add `DeleteButton` next to the Edit link but only for `canManage` users. Since the page already computes `canManage`, use it.

Find the cell that contains the Edit link (look for `href={/materials/${mat.id}/edit}`). Add the DeleteButton in the same cell after the link:

```tsx
{canManage && (
  <DeleteButton
    action={() => deleteMaterialAction(mat.id)}
    confirmMessage={`Delete "${mat.name}"? This cannot be undone.`}
  />
)}
```

- [x] **Step 2: Add delete project button to project detail page**

Read `app/(app)/projects/[id]/page.tsx`. Add imports:
```tsx
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
import { deleteProjectAction } from "@/app/actions/projects"
```

In the header section (`flex justify-between items-center mb-6`), add the DeleteButton next to the "+ New Configuration" link. Place it before the closing `</div>` of the header:

```tsx
<DeleteButton
  action={() => deleteProjectAction(id)}
  confirmMessage="Delete this project and all its configurations? This cannot be undone."
/>
```

- [x] **Step 3: Add delete configuration button in ConfigurationViewer**

Read `app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`. The file has `"use client"` at the top. It already imports from `@/app/actions/orders`. Add:
```tsx
import { deleteConfigurationAction } from "@/app/actions/configurations"
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
```

In the sidebar section, find where `isReadOnly` controls UI. Add the delete button only when `!isReadOnly && configuration.status === "draft"`. Find the save/draft section (around the `{!isReadOnly && (` block) and add after the existing save controls but before the confirm section:

```tsx
{!isReadOnly && configuration.status === "draft" && (
  <DeleteButton
    action={() => deleteConfigurationAction(configuration.id, projectId)}
    confirmMessage="Delete this draft configuration? This cannot be undone."
  />
)}
```

- [x] **Step 4: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors; 51 tests pass.

- [x] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/materials/page.tsx" "app/(app)/projects/[id]/page.tsx" "app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx" && git commit -m "feat: add delete buttons for materials, project, and draft configurations (sub-plan 13, task 6)"
```

---

### Task 7: Push everything

- [x] **Step 1: Run full backend test suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && python -m pytest -q 2>&1 | tail -10
```

- [x] **Step 2: Run full frontend tests + TypeScript check**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

- [x] **Step 3: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
