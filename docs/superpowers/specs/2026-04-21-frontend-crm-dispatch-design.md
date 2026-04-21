# Frontend CRM Dispatch — Design Spec (Sub-plan 6)
**Date:** 2026-04-21
**Status:** Approved

---

## Overview

Adds a "Dispatch to CRM" section to the order detail page that triggers `POST /orders/{id}/dispatch` on the backend. The backend fires an HTTP POST to the tenant's configured `webhook_url`, records the attempt on the order (`last_dispatch`), and optionally captures a `crm_ref` from the CRM's response. The frontend adds the API function, Server Action, and a client-side dispatch button that shows the CRM's response status inline.

---

## Goals

- Users can dispatch any order to their tenant's CRM directly from the order detail page
- The CRM's response status (2xx / 4xx / 5xx from the CRM, or 422/502/500 from the backend) is shown immediately after dispatch
- The page always reflects the most recent `last_dispatch` (dispatched_at + HTTP status) and `crm_ref`
- JWT never leaves the server — dispatch is triggered via Server Action

---

## Non-Goals

- Tenant webhook URL configuration UI (admin concern — out of scope)
- Dispatch history log (only the most recent attempt is stored and shown)
- Retry / scheduled re-dispatch
- E2E / Playwright tests

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Backend Contract

`POST /orders/{id}/dispatch` (already implemented):

**Success response (HTTP 200):**
```json
{
  "order_id": "<uuid>",
  "dispatched_at": "2026-04-21T12:00:00Z",
  "http_status": 201,
  "response_body": "{\"id\": \"crm-789\"}",
  "crm_ref": "crm-789"
}
```

**Backend error responses:**
| Status | Cause |
|--------|-------|
| 422 | User has no tenant or tenant has no `webhook_url` |
| 502 | `httpx.RequestError` — CRM unreachable / timeout |
| 500 | DB error after successful CRM call |
| 404 | Order not found or not owned by user |

**Note:** If the CRM returns 4xx/5xx, the backend still returns HTTP 200 with `http_status` reflecting the CRM's status. The frontend must check `DispatchResponse.http_status` to determine if the CRM accepted the payload.

---

## Architecture

```
frontend/
  lib/
    api.ts                    ← MODIFY: add DispatchResponse type; add dispatchOrder()
  tests/
    lib/
      api.test.ts             ← MODIFY: 2 new tests for dispatchOrder
  app/
    actions/
      orders.ts               ← MODIFY: add dispatchOrderAction()
    (app)/
      projects/
        [id]/
          orders/
            [orderId]/
              _components/
                DispatchButton.tsx   ← CREATE: "use client" dispatch button
              page.tsx              ← MODIFY: render DispatchButton, show last_dispatch
```

---

## `lib/api.ts` Additions

### New type

```ts
export type DispatchResponse = {
  order_id: string
  dispatched_at: string
  http_status: number
  response_body: string
  crm_ref: string | null
}
```

### New function

```ts
export async function dispatchOrder(token: string, orderId: string): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>(`/orders/${orderId}/dispatch`, token, { method: "POST" })
}
```

---

## `app/actions/orders.ts` Addition

The file already has `"use server"` at module level — do not add it to the function body.

```ts
export async function dispatchOrderAction(
  orderId: string,
  projectId: string,
): Promise<{ error?: string; result?: { http_status: number; crm_ref: string | null } }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    const res = await dispatchOrder(token, orderId)
    revalidatePath(`/projects/${projectId}/orders/${orderId}`)
    return { result: { http_status: res.http_status, crm_ref: res.crm_ref } }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
}
```

`revalidatePath` is called on success so the Server Component page refreshes `order.last_dispatch` and `order.crm_ref`.

---

## `DispatchButton.tsx`

`"use client"` component. Props:

```ts
type Props = {
  orderId: string
  projectId: string
  initialCrmRef: string | null
  initialLastDispatch: { dispatched_at: string; http_status: number } | null
}
```

State:
- `isDispatching: boolean`
- `result: { http_status: number; crm_ref: string | null } | null` — set after action resolves
- `error: string | null`

Behavior:
- "Dispatch to CRM" button, disabled while `isDispatching`
- On click: calls `dispatchOrderAction(orderId, projectId)`
- On success: sets `result`; `revalidatePath` triggered server-side causes the page to reload `last_dispatch` from the DB
- On error: sets `error`

Display logic:
- If `result` is set: show a status badge — green if `http_status < 300`, amber if `http_status >= 300`
- If `error` is set: show a red error box
- Below the button: show previous dispatch info from `initialLastDispatch` if present (date + CRM HTTP status), and `initialCrmRef` if non-null

---

## `[orderId]/page.tsx` Changes

Add a "CRM Dispatch" section below the Downloads section:

```tsx
import { DispatchButton } from "./_components/DispatchButton"

// Inside render:
const rawDispatch = order.last_dispatch as { dispatched_at?: string; http_status?: number } | null
const lastDispatch =
  rawDispatch?.dispatched_at && rawDispatch?.http_status !== undefined
    ? { dispatched_at: rawDispatch.dispatched_at, http_status: rawDispatch.http_status }
    : null

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

---

## User Flow

| Step | Action |
|---|---|
| 1 | User opens order detail page |
| 2 | Sees "CRM Dispatch" section — previous dispatch status shown if any |
| 3 | Clicks "Dispatch to CRM" |
| 4 | Button shows "Dispatching…" |
| 5a | CRM accepts (2xx): green badge "CRM accepted (201)" + crm_ref if any; page reloads from DB |
| 5b | CRM rejects (4xx/5xx): amber badge "CRM returned 400" |
| 5c | Backend error (422/502/500): red error box with message |

---

## Error Handling

| Scenario | Frontend Display |
|---|---|
| 422 — no webhook URL | "No CRM webhook URL configured for your account." |
| 502 — CRM unreachable | Error message from `ApiError.message` (includes "Webhook delivery failed: …") |
| 500 — DB error | Error message from `ApiError.message` |
| CRM returned 4xx/5xx | Amber badge: "CRM returned {http_status}" |
| 401 | `redirect("/login")` |

---

## Testing

Jest unit tests in `frontend/tests/lib/api.test.ts`:

**New tests (2):**
- `dispatchOrder` — POSTs to `/orders/{id}/dispatch` with Authorization header, returns `DispatchResponse`
- `dispatchOrder` — non-ok response throws `ApiError`

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `DispatchResponse` type and `dispatchOrder()` |
| `frontend/tests/lib/api.test.ts` | Modify | 2 new tests for `dispatchOrder` |
| `frontend/app/actions/orders.ts` | Modify | Add `dispatchOrderAction()` |
| `frontend/app/(app)/projects/[id]/orders/[orderId]/_components/DispatchButton.tsx` | Create | Client dispatch button with inline result display |
| `frontend/app/(app)/projects/[id]/orders/[orderId]/page.tsx` | Modify | Render DispatchButton, extract `last_dispatch` for prop |
