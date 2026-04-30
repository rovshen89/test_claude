# Material Detail Page — Design Spec (Sub-plan 16)
**Date:** 2026-04-30
**Status:** Approved

---

## Overview

Replaces the separate `/materials/[matId]/edit` page with a unified `/materials/[matId]` detail+edit page. Admin and manufacturer users see an inline edit form and a delete button. Designer users see a read-only property card. The materials list gains name links so all users can reach the detail page.

---

## Non-Goals

- Texture/PBR file upload on the detail page (already at `/materials/new` via upload action)
- Pagination or filtering on the materials list

---

## Architecture

```
frontend/
  app/
    actions/
      materials.ts                        ← MODIFY: updateMaterialAction redirects to /materials/${matId}
    (app)/
      materials/
        page.tsx                          ← MODIFY: name → link to /materials/[matId]; Edit link → /materials/[matId]
        [matId]/
          page.tsx                        ← CREATE: Server Component, auth guard, fetches material
          _components/
            MaterialDetailForm.tsx        ← CREATE: "use client" inline edit form + delete button
          edit/
            page.tsx                      ← DELETE
            _components/
              EditMaterialForm.tsx        ← DELETE
```

---

## Behavior

### `/materials/[matId]` (Server Component)

- Auth guard: unauthenticated → redirect `/login`
- Fetches material via `getMaterial(token, matId)`
- 404 → `notFound()`, 401 → redirect `/login`
- For canManage (admin or manufacturer): renders `MaterialDetailForm`
- For designer: renders a read-only property card

### `MaterialDetailForm` ("use client")

Same 7 fields as the old `EditMaterialForm`:
- Name (text, required)
- SKU (text, required)
- Category (text, required)
- Thickness options (comma-separated mm values, required, at least one valid int)
- Price per m² (number, step 0.01, required)
- Edgebanding price per mm (number, step 0.001, optional)
- Grain direction (select: None / Horizontal / Vertical)

On submit: calls `updateMaterialAction(material.id, data)`. On error: shows inline error, re-enables form. On success: server action redirects to `/materials/${matId}` (stays on detail page).

Also includes a `DeleteButton` (reuses existing shared component) that calls `deleteMaterialAction(material.id)` → redirects to `/materials`.

### Read-only card (designer view)

Displays: Name, SKU, Category, Thickness options, Price/m², Edgebanding price, Grain direction. No edit controls.

### `updateMaterialAction` change

Currently redirects to `/materials`. Change to redirect to `/materials/${matId}` after a successful update so the user stays on the detail page.

### Materials list changes (`/materials/page.tsx`)

- Material name cell: wrap in `<Link href={`/materials/${mat.id}`}>` for all users
- canManage action column: change "Edit" link href from `/materials/${mat.id}/edit` to `/materials/${mat.id}`
- DeleteButton remains unchanged

---

## Testing

- No new backend tests (no backend changes)
- No new Jest tests (no new API functions)
- TypeScript: `npx tsc --noEmit` must produce 0 errors
- Jest: all 55 existing tests must pass

---

## File Summary

| File | Action |
|------|--------|
| `frontend/app/actions/materials.ts` | Modify — redirect to `/materials/${matId}` after update |
| `frontend/app/(app)/materials/page.tsx` | Modify — name link + Edit link URL |
| `frontend/app/(app)/materials/[matId]/page.tsx` | Create |
| `frontend/app/(app)/materials/[matId]/_components/MaterialDetailForm.tsx` | Create |
| `frontend/app/(app)/materials/[matId]/edit/page.tsx` | Delete |
| `frontend/app/(app)/materials/[matId]/edit/_components/EditMaterialForm.tsx` | Delete |
