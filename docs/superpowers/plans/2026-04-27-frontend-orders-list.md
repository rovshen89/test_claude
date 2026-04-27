# Frontend Orders List — Implementation Plan (Sub-plan 11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global `/orders` page listing all user orders, with a nav link in the app layout.

**Architecture:** One new Server Component page (`/orders/page.tsx`) + one line change in `layout.tsx`. No new API functions — `listOrders` and `getConfiguration` already exist. Each order links to the existing project-scoped detail page; `project_id` is resolved by fetching each order's configuration in parallel.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components.

---

### Task 1: Add "Orders" nav link + create orders list page

**Files:**
- Modify: `frontend/app/(app)/layout.tsx`
- Create: `frontend/app/(app)/orders/page.tsx`

Context: The nav bar has three items currently: "Configurator" (brand), "Materials", "Furniture Types", then the user email + sign out. Add "Orders" between "Materials" and "Furniture Types". The `listOrders` function returns `Order[]` where `Order.configuration_id` is the FK to get `project_id` from `getConfiguration`. Configuration has a `project_id` field. The order detail URL is `/projects/${projectId}/orders/${orderId}`.

- [ ] **Step 1: Add "Orders" nav link to `frontend/app/(app)/layout.tsx`**

Find this exact text in the file (lines 20-25):
```tsx
        <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
          Materials
        </Link>
        <Link href="/furniture-types" className="text-xs text-slate-400 hover:text-slate-200">
          Furniture Types
        </Link>
```

Replace with:
```tsx
        <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
          Materials
        </Link>
        <Link href="/orders" className="text-xs text-slate-400 hover:text-slate-200">
          Orders
        </Link>
        <Link href="/furniture-types" className="text-xs text-slate-400 hover:text-slate-200">
          Furniture Types
        </Link>
```

- [ ] **Step 2: Create `frontend/app/(app)/orders/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import {
  listOrders,
  getConfiguration,
  ApiError,
  type Order,
  type Configuration,
} from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function OrdersPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let orders: Order[] = []
  try {
    orders = await listOrders(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Resolve project_id for each order via its configuration.
  // Failures are silently skipped — those order rows render without a "View" link.
  const configResults = await Promise.allSettled(
    orders.map((o) => getConfiguration(token, o.configuration_id))
  )
  const projectMap: Record<string, string> = {}
  configResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      projectMap[orders[i].configuration_id] = result.value.project_id
    }
  })

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Orders</h1>
      {orders.length === 0 ? (
        <p className="text-slate-500 text-sm">No orders yet.</p>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Order ID</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Date</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Total</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">CRM Ref</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {orders.map((order) => {
                const projectId = projectMap[order.configuration_id]
                return (
                  <tr key={order.id} className="hover:bg-slate-750">
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-mono text-slate-400"
                        title={order.id}
                      >
                        {order.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 text-sm">
                      ${fmt(order.pricing_snapshot.total)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {order.crm_ref ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {projectId ? (
                        <Link
                          href={`/projects/${projectId}/orders/${order.id}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          View →
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (clean compile).

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx jest --no-coverage 2>&1 | tail -10
```

Expected: 46 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && git add "app/(app)/layout.tsx" "app/(app)/orders/page.tsx" && git commit -m "feat: add orders list page and nav link (sub-plan 11)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
