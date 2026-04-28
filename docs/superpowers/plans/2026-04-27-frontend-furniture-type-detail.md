# Frontend Furniture Type Detail — Implementation Plan (Sub-plan 12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/furniture-types/[ftId]` detail page showing the full schema JSON, and add "View →" links from the furniture types list.

**Architecture:** One new Server Component page + one table modification. No new API functions — `getFurnitureType` already exists.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components.

---

### Task 1: Add "View →" links to list page + create detail page

**Files:**
- Modify: `frontend/app/(app)/furniture-types/page.tsx`
- Create: `frontend/app/(app)/furniture-types/[ftId]/page.tsx`

Context: `getFurnitureType(token, id)` is already in `lib/api.ts` (returns `FurnitureType` with `id`, `tenant_id`, `category`, `schema`). The list page currently has 4 columns: Category, ID, Tenant, Schema keys.

- [ ] **Step 1: Modify `frontend/app/(app)/furniture-types/page.tsx`**

Add `Link` import if not already present (it is already imported). Add a 5th column to the table.

Find this exact text:
```tsx
              <th className="text-left py-3 px-4">Schema keys</th>
            </tr>
```

Replace with:
```tsx
              <th className="text-left py-3 px-4">Schema keys</th>
              <th className="py-3 px-4"></th>
            </tr>
```

Find this exact text (inside the `furnitureTypes.map` row):
```tsx
                <td className="py-3 px-4 text-xs">
                  {Object.keys(ft.schema).join(", ") || "—"}
                </td>
              </tr>
```

Replace with:
```tsx
                <td className="py-3 px-4 text-xs">
                  {Object.keys(ft.schema).join(", ") || "—"}
                </td>
                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/furniture-types/${ft.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    View →
                  </Link>
                </td>
              </tr>
```

- [ ] **Step 2: Create `frontend/app/(app)/furniture-types/[ftId]/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getFurnitureType, ApiError } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

export default async function FurnitureTypeDetailPage({
  params,
}: {
  params: Promise<{ ftId: string }>
}) {
  const { ftId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let ft
  try {
    ft = await getFurnitureType(token, ftId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <Link href="/furniture-types" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Furniture Types
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">{ft.category}</h1>

      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
        <dl className="space-y-2 text-xs">
          <div className="flex gap-4">
            <dt className="text-slate-500 w-16 shrink-0">ID</dt>
            <dd className="font-mono text-slate-300">{ft.id}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="text-slate-500 w-16 shrink-0">Tenant</dt>
            <dd className="text-slate-300">{ft.tenant_id ?? "Global"}</dd>
          </div>
        </dl>
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 className="text-xs font-medium text-slate-400 mb-3">Schema</h2>
        <pre className="bg-slate-900 border border-slate-700 rounded-md p-4 text-xs text-slate-300 font-mono overflow-auto">
          {JSON.stringify(ft.schema, null, 2)}
        </pre>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -5
```

Expected: 46 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/furniture-types/page.tsx" "app/(app)/furniture-types/[ftId]/page.tsx" && git commit -m "feat: add furniture type detail page with View links (sub-plan 12)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
