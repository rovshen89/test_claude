# Frontend Furniture Type Admin UI — Design Spec (Sub-plan 8)
**Date:** 2026-04-23
**Status:** Approved

---

## Overview

Adds a "Furniture Types" catalog section to the frontend. All authenticated users can browse the list. Users with `admin` or `manufacturer` roles see a "New Furniture Type" button and can create new definitions via a form with a free-form JSON schema editor.

There is no edit page — the backend provides no `PUT /furniture-types/{id}` endpoint.

---

## Goals

- All users can view the furniture type catalog
- Admin/manufacturer users can create new furniture types
- The JSON schema field is validated client-side before submission
- Follows established patterns from Material Admin (Sub-plan 7)

---

## Non-Goals

- Editing or deleting existing furniture types (no backend endpoint)
- Structured form editor for schema fields (textarea is sufficient)
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Backend Contract

**`GET /furniture-types`** — returns `FurnitureType[]`. Available to all authenticated users.

**`POST /furniture-types`** (role-gated: admin, manufacturer):
```json
{
  "category": "wardrobe",
  "schema": {
    "dimensions": {
      "width": { "min": 300, "max": 1200, "step": 10, "default": 600 },
      "height": { "min": 600, "max": 2400, "step": 10, "default": 1800 }
    },
    "panels": [
      {
        "name": "Top Panel",
        "width_key": "width",
        "height_key": "depth",
        "quantity": 1,
        "grain_direction": "horizontal",
        "edge_banding": { "left": true, "right": true, "top": false, "bottom": false }
      }
    ]
  }
}
```
Returns `FurnitureType` (HTTP 201).

**Backend error statuses:**
| Status | Cause |
|--------|-------|
| 201 | Created |
| 401 | Token invalid |
| 403 | Insufficient role |
| 422 | Validation error |

**Existing `FurnitureType` type** (already in `lib/api.ts`):
```ts
export type FurnitureType = {
  id: string
  tenant_id: string | null
  category: string
  schema: Record<string, unknown>
}
```

---

## Architecture

```
frontend/
  lib/
    api.ts                  ← MODIFY: add FurnitureTypeCreate type + createFurnitureType()
  tests/
    lib/
      api.test.ts           ← MODIFY: 2 new tests
  app/
    actions/
      furniture-types.ts    ← CREATE: createFurnitureTypeAction
    (app)/
      layout.tsx            ← MODIFY: add "Furniture Types" nav link
      furniture-types/
        page.tsx            ← CREATE: list page
        new/
          page.tsx          ← CREATE: role guard, renders NewFurnitureTypeForm
          _components/
            NewFurnitureTypeForm.tsx  ← CREATE: "use client" form
```

---

## `lib/api.ts` Additions

```ts
export type FurnitureTypeCreate = {
  category: string
  schema: Record<string, unknown>
}

export async function createFurnitureType(
  token: string,
  data: FurnitureTypeCreate
): Promise<FurnitureType> {
  return apiFetch<FurnitureType>("/furniture-types", token, {
    method: "POST",
    body: JSON.stringify(data),
  })
}
```

---

## `app/actions/furniture-types.ts`

New file with `"use server"` at module level. Follows the same pattern as `app/actions/materials.ts`:

```ts
"use server"

import { auth } from "@/lib/auth"
import { createFurnitureType, ApiError, type FurnitureTypeCreate } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createFurnitureTypeAction(
  data: FurnitureTypeCreate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) return { error: "Forbidden" }
  try {
    await createFurnitureType(token, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/furniture-types")
  redirect("/furniture-types")
}
```

---

## Pages

### `/app/(app)/furniture-types/page.tsx`

Server Component. Calls `getFurnitureTypes(token)`. Checks `session.user.role`.

| Column | Value |
|--------|-------|
| Category | `ft.category` |
| ID | `ft.id` (monospace) |
| Tenant | "Global" if `tenant_id` is null, else the tenant UUID |
| Schema keys | Top-level keys of the schema object joined with commas (e.g. `"dimensions, panels"`) |

"New Furniture Type" button shown only for `canManage`.

### `/app/(app)/furniture-types/new/page.tsx`

Server Component. Role guard: if not admin/manufacturer, `redirect("/furniture-types")`. Renders `<NewFurnitureTypeForm />`.

### `NewFurnitureTypeForm.tsx` ("use client")

**Fields:**
- `category` — text input (required), label `"Category"`, id `"category"`
- `schema` — textarea (required), label `"Schema (JSON)"`, id `"schema"`, rows=16, monospace font. Pre-filled with a placeholder JSON showing the expected structure

**On submit:**
1. Parse `schema` textarea value with `JSON.parse` — if it throws, set error: `"Invalid JSON: <error message>"` and return (no server action call)
2. Call `createFurnitureTypeAction({ category, schema: parsedSchema })`
3. On error: display in red box, re-enable form
4. On success: server action redirects to `/furniture-types`

**Placeholder JSON** shown in the textarea's placeholder attribute:
```json
{
  "dimensions": {
    "width": { "min": 300, "max": 1200, "step": 10, "default": 600 }
  },
  "panels": []
}
```

---

## Navigation

Add "Furniture Types" link to `app/(app)/layout.tsx`, after the "Materials" link:

```tsx
<Link href="/furniture-types" className="text-xs text-slate-400 hover:text-slate-200">
  Furniture Types
</Link>
```

---

## Testing

2 new Jest tests in `frontend/tests/lib/api.test.ts`:

| Function | Case | Expected |
|----------|------|----------|
| `createFurnitureType` | ok | POSTs JSON with Auth header, returns FurnitureType |
| `createFurnitureType` | 403 | throws ApiError |

---

## File Summary

| File | Action |
|------|--------|
| `frontend/lib/api.ts` | Modify — add `FurnitureTypeCreate` type + `createFurnitureType()` |
| `frontend/tests/lib/api.test.ts` | Modify — 2 new tests |
| `frontend/app/actions/furniture-types.ts` | Create — `createFurnitureTypeAction` |
| `frontend/app/(app)/layout.tsx` | Modify — add Furniture Types nav link |
| `frontend/app/(app)/furniture-types/page.tsx` | Create — list page |
| `frontend/app/(app)/furniture-types/new/page.tsx` | Create — new furniture type page |
| `frontend/app/(app)/furniture-types/new/_components/NewFurnitureTypeForm.tsx` | Create — client form |
