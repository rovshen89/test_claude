# Tenant Settings — Design Spec (Sub-plan 14)
**Date:** 2026-04-29
**Status:** Approved

---

## Overview

Adds a `/settings` page where manufacturers (and other tenanted users) can configure their tenant: display name, margin percentage, CRM webhook URL, and CRM config JSON. This unblocks the CRM dispatch workflow — the dispatch endpoint already reads `tenant.webhook_url` but currently there is no UI to set it.

---

## Goals

- Manufacturers can view and edit their tenant settings (name, margin, webhook URL, CRM config)
- CRM dispatch works end-to-end without manual database edits
- Settings page accessible from the nav for tenanted users

---

## Non-Goals

- Admin managing other tenants (scoped to own tenant only)
- Tenant creation (already auto-created on registration)
- PBR texture upload (separate feature)

---

## Backend Contract

### `GET /tenants/me`

Returns the calling user's tenant. Returns 404 if the user has no tenant (admin without a tenant).

**Response: `TenantResponse`**
```json
{
  "id": "uuid",
  "name": "string",
  "margin_pct": "0.00",
  "webhook_url": "https://...",
  "crm_config": {}
}
```

### `PUT /tenants/me`

Partially updates the calling user's tenant. Returns updated `TenantResponse`. Returns 404 if no tenant.

**Body: `TenantUpdate`** (all fields optional)
```json
{
  "name": "string",
  "margin_pct": "5.00",
  "webhook_url": "https://...",
  "crm_config": {}
}
```

---

## Architecture

```
backend/
  app/
    schemas/tenant.py          ← CREATE: TenantResponse, TenantUpdate
    api/tenants.py             ← CREATE: GET /tenants/me, PUT /tenants/me
    api/router.py              ← MODIFY: include tenants router

frontend/
  lib/api.ts                   ← MODIFY: getTenant, updateTenant, TenantUpdate type
  tests/lib/api.test.ts        ← MODIFY: 3 new tests (51 → 54)
  app/
    actions/tenant.ts          ← CREATE: updateTenantAction
    (app)/
      settings/
        page.tsx               ← CREATE: Server Component, auth guard
        _components/
          TenantSettingsForm.tsx ← CREATE: "use client" form
      layout.tsx               ← MODIFY: add "Settings" link
```

---

## Backend Details

### `backend/app/schemas/tenant.py`

```python
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID
from pydantic import BaseModel

class TenantResponse(BaseModel):
    id: UUID
    name: str
    margin_pct: Decimal
    webhook_url: Optional[str] = None
    crm_config: Optional[Dict[str, Any]] = None

    model_config = {"from_attributes": True}

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    margin_pct: Optional[Decimal] = None
    webhook_url: Optional[str] = None
    crm_config: Optional[Dict[str, Any]] = None
```

### `backend/app/api/tenants.py`

```python
GET /tenants/me
  → get user's tenant_id, 404 if None
  → db.get(Tenant, user.tenant_id), 404 if not found
  → return TenantResponse

PUT /tenants/me
  → same 404 guards
  → model_dump(exclude_unset=True) + setattr loop
  → commit + refresh
  → return TenantResponse
```

---

## Frontend Details

### `lib/api.ts` additions

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

export async function getTenant(token: string): Promise<TenantSettings>
export async function updateTenant(token: string, data: TenantUpdate): Promise<TenantSettings>
```

### Settings page

Server Component at `/settings`. Calls `getTenant`. If 404 (admin without tenant), shows "No tenant to configure." Otherwise renders `TenantSettingsForm` with current values.

### `TenantSettingsForm`

"use client" form with fields:
- **Name** — text input
- **Margin %** — number input (0–100, 2 decimal places)
- **Webhook URL** — text input (optional, can be blank)
- **CRM Config** — JSON textarea (optional, blank = null)

On submit: JSON-parses crm_config if non-empty, calls `updateTenantAction`, shows error or success message (since we stay on the same page after save — no redirect).

### Nav link

Add "Settings" link to the nav in `layout.tsx` for all users (the page handles the "no tenant" case gracefully).

---

## Testing

### Backend (4 new pytest tests)

- `test_get_my_tenant` — manufacturer gets their tenant
- `test_update_tenant` — update name + webhook_url + margin_pct, verify response
- `test_get_tenant_no_tenant` — admin without tenant gets 404
- `test_update_tenant_no_tenant` — admin PUT /tenants/me gets 404

### Frontend (3 new Jest tests, 51 → 54)

- `getTenant` — GETs `/tenants/me` with Authorization header, returns TenantSettings
- `updateTenant` — PUTs `/tenants/me` with body, returns updated TenantSettings
- `updateTenant 204` — verify 204 handling (not applicable here but covered by existing apiFetch tests)

---

## File Summary

| File | Action |
|------|--------|
| `backend/app/schemas/tenant.py` | Create |
| `backend/app/api/tenants.py` | Create |
| `backend/app/api/router.py` | Modify — add tenants router |
| `backend/tests/test_tenants.py` | Create — 4 tests |
| `frontend/lib/api.ts` | Modify — 2 functions + 2 types |
| `frontend/tests/lib/api.test.ts` | Modify — 3 tests |
| `frontend/app/actions/tenant.ts` | Create |
| `frontend/app/(app)/settings/page.tsx` | Create |
| `frontend/app/(app)/settings/_components/TenantSettingsForm.tsx` | Create |
| `frontend/app/(app)/layout.tsx` | Modify — add Settings nav link |
