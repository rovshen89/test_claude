# Frontend Material Admin UI — Design Spec (Sub-plan 7)
**Date:** 2026-04-23
**Status:** Approved

---

## Overview

Adds a material administration UI for users with `admin` or `manufacturer` roles. From a Materials list page already rendered for all authenticated users (as a read-only catalog), privileged users see a "New Material" button and per-row "Edit" links. The "New" page supports both texture-less JSON creation (`POST /materials`) and ZIP-bundled PBR texture creation (`POST /materials/upload`). The "Edit" page allows updating all non-texture fields (`PUT /materials/{id}`).

Role detection happens server-side by decoding the JWT payload in NextAuth's `jwt` callback (no secret needed — we're just reading claims), then exposing `role` through the session.

---

## Goals

- Admin/manufacturer users can create materials (with or without PBR textures)
- Admin/manufacturer users can edit material metadata
- Role is visible in the session without adding a backend `/auth/me` endpoint
- All users continue to see the read-only materials catalog

---

## Non-Goals

- Texture replacement on existing materials (`PUT /materials/{id}` doesn't support it)
- Tenant management or `tenant_id` assignment in the UI (admin-only edge case, out of scope)
- Deleting materials
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Backend Contract

**`POST /materials`** (JSON, role-gated):
```json
{
  "category": "sheet",
  "name": "Oak Veneer",
  "sku": "OAK-001",
  "thickness_options": [16, 18, 22],
  "price_per_m2": 45.00,
  "edgebanding_price_per_mm": 0.012,
  "grain_direction": "vertical"
}
```
Returns `Material` (HTTP 201).

**`POST /materials/upload`** (multipart, role-gated):
Form fields: `name`, `sku`, `category`, `price_per_m2`, `thickness_options` (JSON string e.g. `"[16,18,22]"`), `edgebanding_price_per_mm` (optional), `grain_direction`, `tenant_id` (optional, admin only).
`file`: ZIP containing `albedo.png`, `normal.png`, `roughness.png`, `ao.png`.
Returns `Material` (HTTP 201).

**`PUT /materials/{id}`** (JSON, role-gated):
Accepts any subset of: `name`, `sku`, `category`, `thickness_options`, `price_per_m2`, `edgebanding_price_per_mm`, `grain_direction`. No texture update.
Returns `Material` (HTTP 200).

**Backend error statuses:**
| Status | Cause |
|--------|-------|
| 201 | Created |
| 401 | Token invalid |
| 403 | Insufficient role or modifying global material as manufacturer |
| 404 | Material not found |
| 422 | Validation error (invalid ZIP, malformed thickness_options, etc.) |

---

## Architecture

```
frontend/
  types/
    next-auth.d.ts          ← MODIFY: add role to User, JWT, Session
  lib/
    auth.ts                 ← MODIFY: decode JWT payload to set token.role; expose in session
    api.ts                  ← MODIFY: add MaterialCreate, MaterialUpdate types;
                                       getMaterial, createMaterial, uploadMaterial, updateMaterial
  tests/
    lib/
      api.test.ts           ← MODIFY: 8 new tests (getMaterial×2, createMaterial×2,
                                       uploadMaterial×2, updateMaterial×2)
  app/
    actions/
      materials.ts          ← CREATE: createMaterialAction, uploadMaterialAction, updateMaterialAction
    (app)/
      layout.tsx            ← MODIFY: add "Materials" nav link
      materials/
        page.tsx            ← CREATE: Server Component list; shows manage buttons for admin/manufacturer
        new/
          page.tsx          ← CREATE: Server Component shell with role guard
          _components/
            NewMaterialForm.tsx  ← CREATE: "use client" create/upload form
        [matId]/
          edit/
            page.tsx        ← CREATE: Server Component shell; fetches material, role guard
            _components/
              EditMaterialForm.tsx ← CREATE: "use client" edit form
```

---

## Session Extension

In `lib/auth.ts`, update the `jwt` callback to decode the JWT payload (base64, no secret):

```ts
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
```

Update `types/next-auth.d.ts` to add `role: string` to `User`, `JWT`, and `Session.user`.

---

## `lib/api.ts` Additions

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

// uploadMaterial does NOT use apiFetch — must not set Content-Type so fetch adds multipart boundary
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

---

## `app/actions/materials.ts`

New file with `"use server"` at module level. All three actions follow the same pattern as `orders.ts`:

```ts
"use server"

import { auth } from "@/lib/auth"
import { createMaterial, uploadMaterial, updateMaterial, ApiError, type MaterialCreate, type MaterialUpdate } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createMaterialAction(data: MaterialCreate): Promise<{ error?: string }> {
  // auth guard → createMaterial → revalidatePath("/materials") → redirect("/materials")
}

export async function uploadMaterialAction(formData: FormData): Promise<{ error?: string }> {
  // auth guard → uploadMaterial(token, formData) → revalidatePath("/materials") → redirect("/materials")
}

export async function updateMaterialAction(matId: string, data: MaterialUpdate): Promise<{ error?: string }> {
  // auth guard → updateMaterial → revalidatePath("/materials") → redirect("/materials")
}
```

Each action: auth guard (`redirect("/login")` if no token), 401 catch → `redirect("/login")`, `ApiError` catch → `return { error: e.message }`, unknown errors re-thrown.

---

## Pages

### `/app/(app)/materials/page.tsx`

Server Component. Fetches `listMaterials`. Checks `session.user.role`.

| Column | Value |
|--------|-------|
| Name | `material.name` |
| SKU | `material.sku` (mono) |
| Category | `material.category` |
| Thickness | `material.thickness_options.join(", ") mm` |
| Price/m² | `$material.price_per_m2.toFixed(2)` |
| Textures | checkmark if `s3_albedo` is set |
| Actions | "Edit" link — shown only for `canManage` |

"New Material" button (top right) — shown only for `canManage`.

### `/app/(app)/materials/new/page.tsx`

Server Component. Checks `session.user.role`; if not admin/manufacturer, `redirect("/materials")`. Renders `<NewMaterialForm />`.

### `NewMaterialForm.tsx` ("use client")

Single form with all fields. File input (optional). On submit:
- If `file` selected: build `FormData`, call `uploadMaterialAction(formData)`
- If no file: call `createMaterialAction(data)`

Fields: name, SKU, category, thickness options (comma-separated text → parse to `number[]`), price/m², edgebanding price/mm (optional), grain direction (select).

State: `isSubmitting`, `error`.

### `/app/(app)/materials/[matId]/edit/page.tsx`

Server Component. Fetches `getMaterial`. Checks role; if not admin/manufacturer, `redirect("/materials")`. Renders `<EditMaterialForm material={material} />`.

### `EditMaterialForm.tsx` ("use client")

Form pre-populated from `material` prop. Fields: name, SKU, category, thickness options, price/m², edgebanding price/mm, grain direction. No file input.

On submit: calls `updateMaterialAction(material.id, data)`.

State: `isSubmitting`, `error`.

---

## Navigation

In `app/(app)/layout.tsx`, add a "Materials" nav link (visible to all users — the page is read-only for non-admin):

```tsx
<Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
  Materials
</Link>
```

---

## Testing

Jest unit tests in `frontend/tests/lib/api.test.ts` — 8 new tests:

| Function | Case | Expected |
|----------|------|----------|
| `getMaterial` | ok | returns Material |
| `getMaterial` | 404 | throws ApiError |
| `createMaterial` | ok | POSTs JSON, returns Material |
| `createMaterial` | 403 | throws ApiError |
| `uploadMaterial` | ok | POSTs with Auth header (no Content-Type), returns Material |
| `uploadMaterial` | 422 | throws ApiError |
| `updateMaterial` | ok | PUTs JSON, returns Material |
| `updateMaterial` | 404 | throws ApiError |

---

## Error Handling

| Scenario | Display |
|----------|---------|
| 401 | `redirect("/login")` |
| 403 | Red error box: e.message |
| 404 (edit) | `notFound()` in page |
| 422 | Red error box: e.message (e.g. "Invalid ZIP file") |
| Unknown | Re-thrown (Next.js error boundary) |

---

## File Summary

| File | Action |
|------|--------|
| `frontend/types/next-auth.d.ts` | Modify — add `role` to User, JWT, Session |
| `frontend/lib/auth.ts` | Modify — decode JWT payload to set `token.role` |
| `frontend/lib/api.ts` | Modify — add 4 functions + 2 types |
| `frontend/tests/lib/api.test.ts` | Modify — 8 new tests |
| `frontend/app/actions/materials.ts` | Create — 3 server actions |
| `frontend/app/(app)/layout.tsx` | Modify — add Materials nav link |
| `frontend/app/(app)/materials/page.tsx` | Create — list page |
| `frontend/app/(app)/materials/new/page.tsx` | Create — new material page |
| `frontend/app/(app)/materials/new/_components/NewMaterialForm.tsx` | Create — client form |
| `frontend/app/(app)/materials/[matId]/edit/page.tsx` | Create — edit page |
| `frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx` | Create — client form |
