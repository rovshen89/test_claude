# Configurations List Delete Button — Design Spec (Sub-plan 19)
**Date:** 2026-04-30
**Status:** Approved

---

## Overview

The global `/configurations` list page shows all configurations across projects but has no delete button — users must navigate into each configuration's 3D viewer to delete it. This adds a `Delete` button for draft configurations directly on the list page, so users can quickly clean up drafts without deep navigation.

---

## Non-Goals

- Deleting confirmed/in_production/completed configurations (backend returns 409 for these — by design, confirmed configs are immutable)
- Bulk delete
- Filtering or sorting on the list page

---

## Architecture

```
frontend/
  app/
    actions/
      configurations.ts    ← MODIFY: add deleteConfigurationFromListAction
    (app)/
      configurations/
        page.tsx           ← MODIFY: add DeleteButton for draft rows
```

No backend changes. No new API functions. No new Jest tests.

---

## Behavior

### `deleteConfigurationFromListAction(configId: string)`

New server action (added to `frontend/app/actions/configurations.ts`):

```ts
export async function deleteConfigurationFromListAction(
  configId: string
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
  revalidatePath("/configurations")
  redirect("/configurations")
}
```

The only difference from the existing `deleteConfigurationAction` is the redirect target: `/configurations` instead of `/projects/${projectId}`. No `projectId` parameter is needed since there is no project-scoped redirect.

### Configurations list page changes

In `frontend/app/(app)/configurations/page.tsx`:
- Import `DeleteButton` from `@/app/(app)/_components/DeleteButton`
- Import `deleteConfigurationFromListAction` from `@/app/actions/configurations`
- In the last table column, replace the bare "View" link cell with a flex container holding both "View" and a `DeleteButton` (the latter only for `cfg.status === "draft"`)

```tsx
<td className="py-3 px-4 text-right">
  <div className="flex items-center justify-end gap-3">
    <Link
      href={`/projects/${cfg.project_id}/configurations/${cfg.id}`}
      className="text-xs text-indigo-400 hover:text-indigo-300"
    >
      View
    </Link>
    {cfg.status === "draft" && (
      <DeleteButton
        action={() => deleteConfigurationFromListAction(cfg.id)}
        confirmMessage="Delete this draft configuration? This cannot be undone."
      />
    )}
  </div>
</td>
```

---

## Testing

- No new backend tests (no backend changes)
- No new Jest tests (no new API functions)
- TypeScript: `npx tsc --noEmit` must produce 0 errors
- Jest: all 57 existing tests must continue to pass

---

## File Summary

| File | Action |
|------|--------|
| `frontend/app/actions/configurations.ts` | Modify — add `deleteConfigurationFromListAction` |
| `frontend/app/(app)/configurations/page.tsx` | Modify — add `DeleteButton` for draft rows |
