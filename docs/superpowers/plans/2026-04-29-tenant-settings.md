# Tenant Settings — Implementation Plan (Sub-plan 14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /tenants/me` and `PUT /tenants/me` backend endpoints plus a `/settings` frontend page so manufacturers can configure their webhook URL, CRM config, margin, and tenant name.

**Architecture:** Backend adds a new `tenants.py` router with two endpoints and Pydantic schemas. Frontend adds two API functions, a server action, and a settings page with a client-side form. The nav gains a "Settings" link.

**Tech Stack:** FastAPI + SQLAlchemy async + pytest; Next.js 15 App Router + NextAuth v5 + Tailwind CSS + Jest.

---

### Task 1: Backend — schemas + GET/PUT /tenants/me + tests

**Files:**
- Create: `backend/app/schemas/tenant.py`
- Create: `backend/app/api/tenants.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_tenants.py`

- [ ] **Step 1: Create `backend/app/schemas/tenant.py`**

```python
# backend/app/schemas/tenant.py
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, field_serializer


class TenantResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    name: str
    margin_pct: Decimal
    webhook_url: Optional[str] = None
    crm_config: Optional[Dict[str, Any]] = None

    @field_serializer("margin_pct")
    def serialize_margin(self, v: Decimal) -> float:
        return float(v)


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    margin_pct: Optional[Decimal] = None
    webhook_url: Optional[str] = None
    crm_config: Optional[Dict[str, Any]] = None
```

- [ ] **Step 2: Write 4 failing tests in `backend/tests/test_tenants.py`**

```python
# backend/tests/test_tenants.py
import pytest


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "password", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_get_my_tenant(client):
    headers = await _register_and_login(client, "tenant_get@example.com")
    response = await client.get("/tenants/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "name" in data
    assert "margin_pct" in data
    assert data["webhook_url"] is None
    assert data["crm_config"] is None


@pytest.mark.asyncio
async def test_update_tenant(client):
    headers = await _register_and_login(client, "tenant_upd@example.com")
    response = await client.put(
        "/tenants/me",
        json={
            "name": "Acme Furniture",
            "webhook_url": "https://example.com/webhook",
            "margin_pct": 12.5,
            "crm_config": {"api_key": "secret"},
        },
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Acme Furniture"
    assert data["webhook_url"] == "https://example.com/webhook"
    assert data["margin_pct"] == 12.5
    assert data["crm_config"] == {"api_key": "secret"}


@pytest.mark.asyncio
async def test_get_tenant_no_tenant(client):
    """Admin without a tenant gets 404."""
    headers = await _register_and_login(client, "tenant_admin@example.com", role="admin")
    response = await client.get("/tenants/me", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_tenant_no_tenant(client):
    """Admin without a tenant gets 404 on PUT."""
    headers = await _register_and_login(client, "tenant_admin_put@example.com", role="admin")
    response = await client.put(
        "/tenants/me",
        json={"name": "Should Fail"},
        headers=headers,
    )
    assert response.status_code == 404
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_tenants.py -x -q 2>&1 | tail -10
```

Expected: 4 failures (404 Not Found — router not registered yet).

- [ ] **Step 4: Create `backend/app/api/tenants.py`**

```python
# backend/app/api/tenants.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.tenant import TenantResponse, TenantUpdate

router = APIRouter()


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this account")
    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/me", response_model=TenantResponse)
async def update_my_tenant(
    body: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this account")
    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    await db.commit()
    await db.refresh(tenant)
    return tenant
```

- [ ] **Step 5: Register tenants router in `backend/app/api/router.py`**

Find:
```python
from app.api import auth, bom, configurations, furniture_types, materials, orders, pricing, projects
```

Replace with:
```python
from app.api import auth, bom, configurations, furniture_types, materials, orders, pricing, projects, tenants
```

Find:
```python
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
```

Replace with:
```python
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
```

- [ ] **Step 6: Run tests to confirm all pass**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest tests/test_tenants.py -x -q 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 7: Run full backend suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 117 passed (113 + 4 new), 0 failures.

- [ ] **Step 8: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && git add app/schemas/tenant.py app/api/tenants.py app/api/router.py tests/test_tenants.py && git commit -m "feat: add GET/PUT /tenants/me endpoints (sub-plan 14, task 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — lib/api.ts additions + tests

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

Context: `apiFetch` is already defined and handles 204. Current test count: 51.

- [ ] **Step 1: Add `TenantSettings`, `TenantUpdate` types and `getTenant`, `updateTenant` functions to `frontend/lib/api.ts`**

Append at the end of `frontend/lib/api.ts`:

```ts
export type TenantSettings = {
  id: string
  name: string
  margin_pct: number
  webhook_url: string | null
  crm_config: Record<string, unknown> | null
}

export type TenantUpdate = {
  name?: string
  margin_pct?: number
  webhook_url?: string | null
  crm_config?: Record<string, unknown> | null
}

export async function getTenant(token: string): Promise<TenantSettings> {
  return apiFetch<TenantSettings>("/tenants/me", token)
}

export async function updateTenant(
  token: string,
  data: TenantUpdate
): Promise<TenantSettings> {
  return apiFetch<TenantSettings>("/tenants/me", token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}
```

- [ ] **Step 2: Write 3 failing tests**

First, add `getTenant`, `updateTenant`, `type TenantSettings`, `type TenantUpdate` to the import block in `frontend/tests/lib/api.test.ts`.

Then append at the end of the file:

```ts
describe("getTenant", () => {
  it("GETs /tenants/me with Authorization header", async () => {
    const fixture = {
      id: "t-1",
      name: "Acme",
      margin_pct: 10,
      webhook_url: "https://example.com",
      crm_config: null,
    }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await getTenant("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/tenants/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.name).toBe("Acme")
    expect(result.margin_pct).toBe(10)
  })
})

describe("updateTenant", () => {
  it("PUTs /tenants/me with body and returns TenantSettings", async () => {
    const fixture = {
      id: "t-1",
      name: "Updated",
      margin_pct: 15,
      webhook_url: "https://hook.example.com",
      crm_config: { key: "val" },
    }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await updateTenant("tok", {
      name: "Updated",
      margin_pct: 15,
      webhook_url: "https://hook.example.com",
      crm_config: { key: "val" },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/tenants/me",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({
          name: "Updated",
          margin_pct: 15,
          webhook_url: "https://hook.example.com",
          crm_config: { key: "val" },
        }),
      })
    )
    expect(result.name).toBe("Updated")
    expect(result.webhook_url).toBe("https://hook.example.com")
  })

  it("handles 404 ApiError when no tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "No tenant associated with this account",
    })

    await expect(updateTenant("tok", { name: "x" })).rejects.toThrow(ApiError)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -10
```

Expected: 54 tests, 0 failures (51 + 3 new).

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add lib/api.ts tests/lib/api.test.ts && git commit -m "feat: add getTenant + updateTenant API functions (sub-plan 14, task 2)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — server action + settings page + nav link

**Files:**
- Create: `frontend/app/actions/tenant.ts`
- Create: `frontend/app/(app)/settings/page.tsx`
- Create: `frontend/app/(app)/settings/_components/TenantSettingsForm.tsx`
- Modify: `frontend/app/(app)/layout.tsx`

- [ ] **Step 1: Create `frontend/app/actions/tenant.ts`**

```ts
"use server"

import { auth } from "@/lib/auth"
import { updateTenant, ApiError, type TenantUpdate } from "@/lib/api"
import { revalidatePath } from "next/cache"

export async function updateTenantAction(
  data: TenantUpdate
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth()
  if (!session?.user?.access_token) return { error: "Not authenticated" }
  const token = session.user.access_token
  try {
    await updateTenant(token, data)
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/settings")
  return { success: true }
}
```

Note: This action returns `{ success: true }` instead of redirecting — the settings page stays open after save so the user can see their updated values.

- [ ] **Step 2: Create `frontend/app/(app)/settings/_components/TenantSettingsForm.tsx`**

```tsx
"use client"

import { useState } from "react"
import { updateTenantAction } from "@/app/actions/tenant"
import type { TenantSettings } from "@/lib/api"

export function TenantSettingsForm({ tenant }: { tenant: TenantSettings }) {
  const [name, setName] = useState(tenant.name)
  const [marginPct, setMarginPct] = useState(String(tenant.margin_pct))
  const [webhookUrl, setWebhookUrl] = useState(tenant.webhook_url ?? "")
  const [crmConfigText, setCrmConfigText] = useState(
    tenant.crm_config ? JSON.stringify(tenant.crm_config, null, 2) : ""
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    let crm_config: Record<string, unknown> | null = null
    if (crmConfigText.trim()) {
      try {
        crm_config = JSON.parse(crmConfigText)
      } catch (err) {
        setError(`Invalid CRM Config JSON: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    }

    setIsSubmitting(true)
    const result = await updateTenantAction({
      name,
      margin_pct: parseFloat(marginPct) || 0,
      webhook_url: webhookUrl.trim() || null,
      crm_config,
    })
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-950 border border-green-900 rounded-md px-3 py-2 text-xs text-green-400">
          Settings saved.
        </div>
      )}
      <div>
        <label htmlFor="name" className="block mb-1 text-xs font-medium text-slate-400">
          Tenant Name
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
      <div>
        <label htmlFor="margin_pct" className="block mb-1 text-xs font-medium text-slate-400">
          Margin %
        </label>
        <input
          id="margin_pct"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={marginPct}
          onChange={(e) => setMarginPct(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="webhook_url" className="block mb-1 text-xs font-medium text-slate-400">
          Webhook URL
        </label>
        <input
          id="webhook_url"
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://your-crm.example.com/webhook"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="crm_config" className="block mb-1 text-xs font-medium text-slate-400">
          CRM Config (JSON, optional)
        </label>
        <textarea
          id="crm_config"
          rows={6}
          value={crmConfigText}
          onChange={(e) => setCrmConfigText(e.target.value)}
          placeholder='{"headers": {"X-Api-Key": "..."}}'
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-indigo-500 resize-y"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save Settings"}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create `frontend/app/(app)/settings/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getTenant, ApiError, type TenantSettings } from "@/lib/api"
import { redirect } from "next/navigation"
import { TenantSettingsForm } from "./_components/TenantSettingsForm"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let tenant: TenantSettings | null = null
  try {
    tenant = await getTenant(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    // 404 = no tenant (admin) — render informational message below
    if (!(e instanceof ApiError && e.status === 404)) throw e
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Settings</h1>
      {tenant ? (
        <TenantSettingsForm tenant={tenant} />
      ) : (
        <p className="text-sm text-slate-500">
          No tenant is associated with your account. Settings are configured per tenant.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add "Settings" nav link to `frontend/app/(app)/layout.tsx`**

Read the file first. Find the nav links group:
```tsx
        <div className="flex items-center gap-6">
          <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
            Materials
          </Link>
          <Link href="/orders" className="text-xs text-slate-400 hover:text-slate-200">
            Orders
          </Link>
          <Link href="/furniture-types" className="text-xs text-slate-400 hover:text-slate-200">
            Furniture Types
          </Link>
        </div>
```

Replace with:
```tsx
        <div className="flex items-center gap-6">
          <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
            Materials
          </Link>
          <Link href="/orders" className="text-xs text-slate-400 hover:text-slate-200">
            Orders
          </Link>
          <Link href="/furniture-types" className="text-xs text-slate-400 hover:text-slate-200">
            Furniture Types
          </Link>
          <Link href="/settings" className="text-xs text-slate-400 hover:text-slate-200">
            Settings
          </Link>
        </div>
```

- [ ] **Step 5: Verify TypeScript + tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 54 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add app/actions/tenant.ts "app/(app)/settings/" "app/(app)/layout.tsx" && git commit -m "feat: add tenant settings page with webhook/margin/CRM config form (sub-plan 14, task 3)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Push everything

- [ ] **Step 1: Run full backend test suite**

```bash
cd /Users/rovshennurybayev/claude_agents/backend && .venv312/bin/python -m pytest -q 2>&1 | tail -5
```

Expected: 117 passed, 0 failures.

- [ ] **Step 2: Run full frontend tests + TypeScript check**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 54 tests pass.

- [ ] **Step 3: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
