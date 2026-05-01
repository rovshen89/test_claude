# Configurations List Delete Button — Implementation Plan (Sub-plan 19)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a delete button for draft configurations directly on the global `/configurations` list page, so users don't need to navigate into each configuration's 3D viewer to delete it.

**Architecture:** A new server action `deleteConfigurationFromListAction(configId)` in `frontend/app/actions/configurations.ts` handles deletion and redirects to `/configurations`. The configurations list page imports `DeleteButton` (existing shared component) and renders it alongside the "View" link for draft-status rows only.

**Tech Stack:** Next.js 15 App Router + NextAuth v5 + Tailwind CSS. No backend changes, no new API functions, no new Jest tests.

---

### Task 1: Add action + delete button to configurations list

**Files:**
- Modify: `frontend/app/actions/configurations.ts`
- Modify: `frontend/app/(app)/configurations/page.tsx`

Context: `frontend/app/actions/configurations.ts` already has a `deleteConfigurationAction(configId, projectId)` that calls `deleteConfiguration(token, configId)` and then redirects to `/projects/${projectId}`. The new action does the same thing but redirects to `/configurations` and requires no `projectId` param.

`frontend/app/(app)/configurations/page.tsx` is a Server Component. It renders a `<table>` with one row per configuration. The last column (`<td>`) currently contains only a `<Link>View</Link>`. We'll add a `DeleteButton` to that cell for draft configs.

`DeleteButton` (at `frontend/app/(app)/_components/DeleteButton.tsx`) accepts:
```ts
{
  action: () => Promise<{ error?: string } | undefined>
  label?: string         // defaults to "Delete"
  confirmMessage?: string
}
```

Current Jest test count: 57. Current TypeScript errors: 0. These must remain unchanged after this task.

- [ ] **Step 1: Add `deleteConfigurationFromListAction` to `frontend/app/actions/configurations.ts`**

Read the file first. It ends at line 86 (`}`). Append the following after the closing brace of `deleteConfigurationAction`:

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

All imports (`auth`, `deleteConfiguration`, `ApiError`, `redirect`, `revalidatePath`) already exist in this file — no new imports needed.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no output (0 errors).

- [ ] **Step 3: Update `frontend/app/(app)/configurations/page.tsx` to add delete button**

Read the file first. The full page is at `/Users/rovshennurybayev/claude_agents/frontend/app/(app)/configurations/page.tsx`.

**A) Add two imports at the top.** Find the current import block:

```tsx
import { auth } from "@/lib/auth"
import {
  getProjects,
  listAllConfigurations,
  ApiError,
  type Configuration,
  type Project,
} from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"
```

Replace with (add two imports):

```tsx
import { auth } from "@/lib/auth"
import {
  getProjects,
  listAllConfigurations,
  ApiError,
  type Configuration,
  type Project,
} from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
import { deleteConfigurationFromListAction } from "@/app/actions/configurations"
```

**B) Replace the last table cell** to include both the "View" link and the conditional `DeleteButton`. Find:

```tsx
                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/projects/${cfg.project_id}/configurations/${cfg.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    View
                  </Link>
                </td>
```

Replace with:

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

- [ ] **Step 4: Verify TypeScript + Jest**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 57 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/actions/configurations.ts" "app/(app)/configurations/page.tsx" && git commit -m "feat: add delete button for draft configs on configurations list page (sub-plan 19)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Push

- [ ] **Step 1: Run full frontend checks**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 57 tests pass.

- [ ] **Step 2: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
