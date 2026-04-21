# Frontend CRM Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Dispatch to CRM" section to the order detail page that triggers `POST /orders/{id}/dispatch` and shows the CRM's response status inline.

**Architecture:** `lib/api.ts` gains `DispatchResponse` type and `dispatchOrder()`; `app/actions/orders.ts` gains `dispatchOrderAction()` which calls `revalidatePath` and returns the CRM HTTP status to the client; a new `DispatchButton` client component renders the button with inline result feedback; `page.tsx` adds a "CRM Dispatch" section that passes `order.crm_ref` and `order.last_dispatch` as initial props to `DispatchButton`.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, TypeScript, Jest.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `DispatchResponse` type and `dispatchOrder()` |
| `frontend/tests/lib/api.test.ts` | Modify | 2 new tests for `dispatchOrder` |
| `frontend/app/actions/orders.ts` | Modify | Add `dispatchOrderAction()` |
| `frontend/app/(app)/projects/[id]/orders/[orderId]/_components/DispatchButton.tsx` | Create | Client dispatch button with inline result/error display |
| `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx` | Modify | Import `DispatchButton`, extract `lastDispatch`, add CRM Dispatch section |

---

## Background: Existing Patterns

**`apiFetch` in `lib/api.ts`** (never call `fetch` directly):
```ts
async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}
```

**Test convention** (`api.test.ts`):
```ts
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
// errors:
mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "message" })
```

**Server Action pattern** (`app/actions/orders.ts` already has `"use server"` at module level):
```ts
const session = await auth()
if (!session?.user?.access_token) redirect("/login")
const token = session.user.access_token
try {
  const res = await someApiFn(token, ...)
  revalidatePath(`/path/to/page`)
  return { result: ... }
} catch (e) {
  if (e instanceof ApiError && e.status === 401) redirect("/login")
  if (e instanceof ApiError) return { error: e.message }
  throw e
}
```

**`Order` type** (already in `lib/api.ts`):
```ts
export type Order = {
  id: string
  configuration_id: string
  pricing_snapshot: PricingSnapshot
  bom_snapshot: BomSnapshot
  export_urls: { dxf: string; pdf: string }
  crm_ref: string | null
  last_dispatch: Record<string, unknown> | null
  created_at: string
}
```

**Backend dispatch response** (`POST /orders/{id}/dispatch`) — HTTP 200 always on success:
```json
{
  "order_id": "...",
  "dispatched_at": "2026-04-21T12:00:00Z",
  "http_status": 201,
  "response_body": "{\"id\": \"crm-789\"}",
  "crm_ref": "crm-789"
}
```
Note: `http_status` is the CRM's status code (not the dispatch endpoint's status). If the CRM returns 4xx/5xx, the backend still returns HTTP 200 with the CRM's status in `http_status`.

**Backend error responses for dispatch:**
- 422: no webhook URL configured for tenant
- 502: CRM unreachable / timeout
- 500: DB error after successful CRM call
- 401: token invalid
- 404: order not found

**`order.last_dispatch` shape** (stored by backend):
```ts
{ dispatched_at: string; http_status: number; response_body: string }
```
Typed as `Record<string, unknown> | null` in the frontend `Order` type — must be narrowed safely on use.

**Run tests:** `cd /Users/rovshennurybayev/claude_agents/frontend && npm test`

**Current test count:** 28 tests passing.

---

## Task 1: `lib/api.ts` — `DispatchResponse` type + `dispatchOrder()` (TDD)

**Files:**
- Modify: `frontend/tests/lib/api.test.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1.1: Add failing tests to `api.test.ts`**

Open `frontend/tests/lib/api.test.ts`.

**1a. Add `dispatchOrder` and `type DispatchResponse` to the import block at the top of the file:**

```ts
import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
  getFurnitureTypes,
  createConfiguration,
  confirmConfiguration,
  getConfiguration,
  updateConfiguration,
  createOrder,
  getOrder,
  listOrders,
  listMaterials,
  dispatchOrder,
  type Order,
  type AppliedConfig,
  type Material,
  type DispatchResponse,
} from "@/lib/api"
```

**1b. Append the following block after the last `describe` block (after the `listMaterials` block ending at line 430):**

```ts
const dispatchFixture: DispatchResponse = {
  order_id: "ord1",
  dispatched_at: "2026-04-21T12:00:00Z",
  http_status: 201,
  response_body: '{"id": "crm-789"}',
  crm_ref: "crm-789",
}

describe("dispatchOrder", () => {
  it("POSTs to /orders/{id}/dispatch with Authorization header and returns DispatchResponse", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => dispatchFixture })

    const result = await dispatchOrder("tok", "ord1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders/ord1/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.order_id).toBe("ord1")
    expect(result.http_status).toBe(201)
    expect(result.crm_ref).toBe("crm-789")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => "No webhook URL configured for this tenant",
    })
    await expect(dispatchOrder("tok", "ord1")).rejects.toMatchObject({ status: 422 })
  })
})
```

- [ ] **Step 1.2: Run tests — verify 2 new tests fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -15
```

Expected: 2 failures (`dispatchOrder is not a function`, `DispatchResponse` import error or similar). 28 tests still pass, 2 fail.

- [ ] **Step 1.3: Add `DispatchResponse` type and `dispatchOrder` to `lib/api.ts`**

Open `frontend/lib/api.ts`. After the `listMaterials` function (currently the last function in the file), append:

```ts
export type DispatchResponse = {
  order_id: string
  dispatched_at: string
  http_status: number
  response_body: string
  crm_ref: string | null
}

export async function dispatchOrder(token: string, orderId: string): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>(`/orders/${orderId}/dispatch`, token, { method: "POST" })
}
```

- [ ] **Step 1.4: Run tests — verify all 30 pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected:
```
Tests: 30 passed, 30 total
```

- [ ] **Step 1.5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/lib/api.ts frontend/tests/lib/api.test.ts && git commit -m "feat: add DispatchResponse type and dispatchOrder to api.ts"
```

---

## Task 2: `app/actions/orders.ts` — add `dispatchOrderAction`

**Files:**
- Modify: `frontend/app/actions/orders.ts`

- [ ] **Step 2.1: Update `orders.ts`**

Open `frontend/app/actions/orders.ts`. The file currently looks like:

```ts
"use server"

import { auth } from "@/lib/auth"
import { createOrder, ApiError, type Order } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createOrderAction(
  configId: string,
  projectId: string
): Promise<{ error: string }> {
  ...
}
```

Make two changes:

**2a. Update the import line** to add `dispatchOrder` and `type DispatchResponse`:

```ts
import { createOrder, dispatchOrder, ApiError, type Order, type DispatchResponse } from "@/lib/api"
```

**2b. Append `dispatchOrderAction` after the existing `createOrderAction` function:**

```ts
export async function dispatchOrderAction(
  orderId: string,
  projectId: string,
): Promise<{ error?: string; result?: { http_status: number; crm_ref: string | null } }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    const res: DispatchResponse = await dispatchOrder(token, orderId)
    revalidatePath(`/projects/${projectId}/orders/${orderId}`)
    return { result: { http_status: res.http_status, crm_ref: res.crm_ref } }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
}
```

- [ ] **Step 2.2: Run tests — verify 30 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 30 passed, 30 total`

- [ ] **Step 2.3: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add frontend/app/actions/orders.ts && git commit -m "feat: add dispatchOrderAction to orders Server Actions"
```

---

## Task 3: `DispatchButton.tsx` + `page.tsx` — CRM Dispatch UI

**Files:**
- Create: `frontend/app/(app)/projects/[id]/orders/[orderId]/_components/DispatchButton.tsx`
- Modify: `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx`

- [ ] **Step 3.1: Create `_components/DispatchButton.tsx`**

Create the directory and file:

`frontend/app/(app)/projects/[id]/orders/[orderId]/_components/DispatchButton.tsx`

Full content:

```tsx
"use client"

import { useState } from "react"
import { dispatchOrderAction } from "@/app/actions/orders"

type Props = {
  orderId: string
  projectId: string
  initialCrmRef: string | null
  initialLastDispatch: { dispatched_at: string; http_status: number } | null
}

export function DispatchButton({
  orderId,
  projectId,
  initialCrmRef,
  initialLastDispatch,
}: Props) {
  const [isDispatching, setIsDispatching] = useState(false)
  const [result, setResult] = useState<{ http_status: number; crm_ref: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDispatch() {
    setIsDispatching(true)
    setError(null)
    setResult(null)
    const res = await dispatchOrderAction(orderId, projectId)
    if (res.error) {
      setError(res.error)
    } else if (res.result) {
      setResult(res.result)
    }
    setIsDispatching(false)
  }

  const crmRef = result?.crm_ref ?? initialCrmRef

  return (
    <div className="flex flex-col gap-3">
      {initialLastDispatch && !result && (
        <p className="text-xs text-slate-500">
          Last dispatched:{" "}
          {new Date(initialLastDispatch.dispatched_at).toLocaleString()} —{" "}
          <span
            className={
              initialLastDispatch.http_status < 300 ? "text-green-400" : "text-amber-400"
            }
          >
            HTTP {initialLastDispatch.http_status}
          </span>
        </p>
      )}

      {result && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            result.http_status < 300
              ? "bg-green-950 border border-green-900 text-green-400"
              : "bg-amber-950 border border-amber-900 text-amber-400"
          }`}
        >
          {result.http_status < 300
            ? `CRM accepted (${result.http_status})`
            : `CRM returned ${result.http_status}`}
          {result.crm_ref && (
            <span className="ml-2 font-mono">{result.crm_ref}</span>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {crmRef && !result && (
        <p className="text-xs text-slate-500">
          CRM ref: <span className="font-mono text-slate-400">{crmRef}</span>
        </p>
      )}

      <button
        onClick={handleDispatch}
        disabled={isDispatching}
        className="w-fit px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-slate-200 font-medium transition-colors"
      >
        {isDispatching ? "Dispatching…" : "Dispatch to CRM"}
      </button>
    </div>
  )
}
```

- [ ] **Step 3.2: Update `page.tsx`**

Open `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx`.

**3a. Add `DispatchButton` import** after the existing imports at the top of the file:

```ts
import { DispatchButton } from "./_components/DispatchButton"
```

**3b. Add `lastDispatch` extraction** before the `return` statement (after the `const bom = order.bom_snapshot` line):

```ts
const rawDispatch = order.last_dispatch as {
  dispatched_at?: string
  http_status?: number
} | null
const lastDispatch =
  rawDispatch?.dispatched_at != null && rawDispatch?.http_status != null
    ? { dispatched_at: rawDispatch.dispatched_at, http_status: rawDispatch.http_status }
    : null
```

**3c. Add CRM Dispatch section** after the closing `</section>` of the Downloads section and before the closing `</div>` of the page:

```tsx
      {/* CRM Dispatch */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mt-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">CRM Dispatch</h2>
        <DispatchButton
          orderId={orderId}
          projectId={id}
          initialCrmRef={order.crm_ref}
          initialLastDispatch={lastDispatch}
        />
      </section>
```

- [ ] **Step 3.3: Run tests — verify 30 still pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npm test 2>&1 | tail -10
```

Expected: `Tests: 30 passed, 30 total`

- [ ] **Step 3.4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/projects/[id]/orders/[orderId]/_components/DispatchButton.tsx" "frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx" && git commit -m "feat: add CRM dispatch button to order detail page"
```
