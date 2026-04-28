# Frontend Furniture Type Detail — Design Spec (Sub-plan 12)
**Date:** 2026-04-27
**Status:** Approved

---

## Overview

Adds a read-only `/furniture-types/[ftId]` detail page that shows the full schema JSON of a furniture type. The furniture types list page gains a "View →" link on each row.

---

## Goals

- Users can view the full schema of any furniture type
- The list page links to the detail page from each row
- Follows established Server Component patterns

---

## Non-Goals

- Editing furniture type schemas (no backend PUT endpoint exists)
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components.

---

## Backend Contract

**`GET /furniture-types/{ft_id}`** (authenticated):

Returns `FurnitureTypeResponse` — same as the `FurnitureType` type already in `lib/api.ts`. Already available via `getFurnitureType(token, id)`.

---

## Architecture

```
frontend/
  app/
    (app)/
      furniture-types/
        page.tsx              ← MODIFY: add "View →" link on each row
        [ftId]/
          page.tsx            ← CREATE: detail Server Component
```

No changes to `lib/api.ts` — `getFurnitureType` already exists.

---

## `furniture-types/page.tsx` Modification

Add a fifth column to the table with a "View →" link for each row:

Header cell (after "Schema keys"):
```tsx
<th className="text-left py-3 px-4"></th>
```

Row cell (inside the `tr`):
```tsx
<td className="py-3 px-4">
  <Link
    href={`/furniture-types/${ft.id}`}
    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
  >
    View →
  </Link>
</td>
```

---

## `furniture-types/[ftId]/page.tsx`

Server Component. Gets `{ ftId }` from params.

1. Auth guard: redirect to `/login` if no token
2. Fetch `getFurnitureType(token, ftId)` — 404 → `notFound()`, 401 → redirect
3. Render:
   - Back link: `← Furniture Types` → `/furniture-types`
   - Heading: furniture type category
   - Metadata section: ID (monospace), Tenant ("Global" if null)
   - Schema section: `<pre>` block with `JSON.stringify(ft.schema, null, 2)`, monospace font, dark background

**Schema block styling:**
```tsx
<pre className="bg-slate-900 border border-slate-700 rounded-md p-4 text-xs text-slate-300 font-mono overflow-auto">
  {JSON.stringify(ft.schema, null, 2)}
</pre>
```

---

## Testing

No new `lib/api.ts` functions → no new unit tests required. `getFurnitureType` is already tested.

---

## File Summary

| File | Action |
|------|--------|
| `frontend/app/(app)/furniture-types/page.tsx` | Modify — add "View →" link column |
| `frontend/app/(app)/furniture-types/[ftId]/page.tsx` | Create — detail Server Component |
