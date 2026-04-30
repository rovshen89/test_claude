# Configurations List Page — Design Spec (Sub-plan 17)
**Date:** 2026-04-30
**Status:** Approved

---

## Overview

Adds a top-level `/configurations` page showing all of the current user's configurations across all projects. Currently, configurations are only reachable from within a specific project's detail page. This mirrors the existing orders list pattern.

---

## Non-Goals

- Filtering/searching by status or project (YAGNI)
- Paginating (YAGNI at current scale)
- Adding `created_at` to `ConfigurationResponse` (not needed for MVP list)

---

## Backend Contract

### `GET /configurations` (modified)

Make `project_id` optional. Existing per-project behavior is preserved.

**With `project_id`:** existing behavior — verify ownership, return configs for that project.

**Without `project_id`:** return all configurations where the configuration's project belongs to the current user.

Query (no project_id case):
```python
select(Configuration)
    .join(Project, Configuration.project_id == Project.id)
    .where(Project.user_id == user.id)
```

**Response:** `list[ConfigurationResponse]` (unchanged schema)

---

## Architecture

```
backend/
  app/
    api/configurations.py    ← MODIFY: project_id Optional, add cross-project query
  tests/
    test_configurations.py   ← MODIFY: 2 new tests (119 → 121)

frontend/
  lib/api.ts                 ← MODIFY: add listAllConfigurations(token)
  tests/lib/api.test.ts      ← MODIFY: 1 new test (55 → 56)
  app/
    (app)/
      configurations/
        page.tsx             ← CREATE: Server Component
      layout.tsx             ← MODIFY: add "Configurations" nav link
```

---

## Backend Detail

### `list_configurations` change

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

`Optional` must be imported from `typing` (already used in the file elsewhere).

### New backend tests (2)

`test_list_all_configurations` — user creates 2 projects each with 1 config, calls `GET /configurations` (no `project_id` param), gets exactly 2 back.

`test_list_all_configurations_isolation` — user A creates 1 config, user B calls `GET /configurations` (no param), gets 0 configs (not user A's).

---

## Frontend Detail

### `listAllConfigurations` API function

```ts
export async function listAllConfigurations(token: string): Promise<Configuration[]> {
  return apiFetch<Configuration[]>("/configurations", token)
}
```

### Configurations page (`/configurations/page.tsx`)

Server Component. Auth guard → redirect `/login`. Calls `getProjects(token)` and `listAllConfigurations(token)` in parallel. Builds `projectMap: Record<string, string>` (project id → name). Renders a table:

| Column | Content |
|--------|---------|
| Project | `<Link href="/projects/[id]">` with project name |
| Config ID | Truncated to first 8 chars, monospace |
| Status | Inline badge: "draft" (amber) / "confirmed" (green) |
| — | `<Link href="/projects/[id]/configurations/[cfgId]">View</Link>` |

Empty state: "No configurations yet."

### Nav link

Add `<Link href="/configurations">` between "Materials" and "Orders" in `frontend/app/(app)/layout.tsx`.

---

## Testing

### Backend (2 new tests)

- `test_list_all_configurations` — 2 projects × 1 config each → 2 results, no `project_id` param
- `test_list_all_configurations_isolation` — user B sees 0 of user A's configs

### Frontend (1 new Jest test, 55 → 56)

- `listAllConfigurations` — GETs `/configurations` with Authorization header, no query param, returns array

---

## File Summary

| File | Action |
|------|--------|
| `backend/app/api/configurations.py` | Modify — `project_id` optional, add cross-project query branch |
| `backend/tests/test_configurations.py` | Modify — 2 new tests |
| `frontend/lib/api.ts` | Modify — `listAllConfigurations` function |
| `frontend/tests/lib/api.test.ts` | Modify — 1 new test |
| `frontend/app/(app)/configurations/page.tsx` | Create |
| `frontend/app/(app)/layout.tsx` | Modify — add Configurations nav link |
