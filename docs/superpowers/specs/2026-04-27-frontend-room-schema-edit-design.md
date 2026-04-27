# Frontend Room Schema Edit — Design Spec (Sub-plan 10)
**Date:** 2026-04-27
**Status:** Approved

---

## Overview

Exposes the `PUT /projects/{project_id}/room-schema` endpoint through the frontend. The project detail page gains a "Room Schema" section showing the current schema (or "Not configured" if null) with an "Edit →" link. The edit page provides a JSON textarea pre-populated with the current schema, following the same pattern as the Furniture Type form.

---

## Goals

- Users can view and edit their project's room schema from the project page
- The form pre-populates with the existing schema if set
- Client-side JSON validation before calling the server action
- Follows established patterns from Sub-plans 8 and 9

---

## Non-Goals

- Structured field editor for room schema (textarea is sufficient)
- Role gating (any authenticated user owns their own projects)
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Backend Contract

**`PUT /projects/{project_id}/room-schema`** (authenticated, owner only):
```json
{ "room_schema": { "width": 3000, "height": 2400, "depth": 4000 } }
```
Returns full `ProjectResponse` (same shape as existing `Project` type). HTTP 200.

**Backend error statuses:**
| Status | Cause |
|--------|-------|
| 200 | Updated |
| 401 | Token invalid |
| 404 | Project not found or not owned by user |

---

## Architecture

```
frontend/
  lib/
    api.ts                                    ← MODIFY: add updateRoomSchema()
  tests/
    lib/
      api.test.ts                             ← MODIFY: 2 new tests
  app/
    actions/
      projects.ts                             ← CREATE: updateRoomSchemaAction
    (app)/
      projects/[id]/
        page.tsx                              ← MODIFY: add Room Schema section
        room-schema/
          edit/
            page.tsx                          ← CREATE: edit page (Server Component)
            _components/
              RoomSchemaForm.tsx              ← CREATE: "use client" JSON textarea form
```

---

## `lib/api.ts` Addition

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

No new types needed — `Project` already exists.

---

## `app/actions/projects.ts`

New file with `"use server"` at module level:

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

---

## `projects/[id]/page.tsx` Modification

Add a "Room Schema" section between the project header and the configurations grid:

```tsx
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
```

Insertion point: after the closing `</div>` of the `flex justify-between items-center mb-6` header block (around line 93), before `{configs.length === 0 ? (`.

---

## Pages

### `/app/(app)/projects/[id]/room-schema/edit/page.tsx`

Server Component. Gets `{ id }` from params.

1. Auth guard: redirect to `/login` if no token
2. Fetch `getProject(token, id)` — 404 → `notFound()`, 401 → redirect
3. Render `<RoomSchemaForm projectId={id} currentSchema={project.room_schema} />`

### `RoomSchemaForm.tsx` ("use client")

Props: `{ projectId: string; currentSchema: Record<string, unknown> | null }`

**Fields:**
- `schema` — textarea (required), label `"Room Schema (JSON)"`, id `"schema"`, rows=12, monospace font
- Pre-filled with `JSON.stringify(currentSchema, null, 2)` if `currentSchema` is not null, else `""`
- Placeholder shows example: `{"width": 3000, "height": 2400, "depth": 4000}`

**On submit:**
1. Parse textarea value with `JSON.parse` — if throws, set error `"Invalid JSON: <message>"` and return
2. Call `updateRoomSchemaAction(projectId, parsedSchema)`
3. On error: display in red box, re-enable form
4. On success: server action redirects to `/projects/${projectId}`

**State:** `schemaText`, `isSubmitting`, `error`

---

## Testing

2 new Jest tests in `frontend/tests/lib/api.test.ts`:

| Function | Case | Expected |
|----------|------|----------|
| `updateRoomSchema` | ok | PUTs `{ room_schema: {...} }` with Auth header, returns Project |
| `updateRoomSchema` | 404 | throws ApiError with status 404 |

---

## File Summary

| File | Action |
|------|--------|
| `frontend/lib/api.ts` | Modify — add `updateRoomSchema()` |
| `frontend/tests/lib/api.test.ts` | Modify — 2 new tests |
| `frontend/app/actions/projects.ts` | Create — `updateRoomSchemaAction` |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify — add Room Schema section |
| `frontend/app/(app)/projects/[id]/room-schema/edit/page.tsx` | Create — edit page |
| `frontend/app/(app)/projects/[id]/room-schema/edit/_components/RoomSchemaForm.tsx` | Create — client form |
