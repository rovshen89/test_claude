# Frontend Auth + Project Shell — Design Spec (Plan 5, Sub-plan 1)
**Date:** 2026-04-11
**Status:** Approved

---

## Overview

Adds a Next.js 15 App Router frontend to the existing FastAPI backend. Sub-plan 1 covers the auth layer and project shell only: login, register, project list, and project detail (with read-only configuration cards). The 3D viewer (Babylon.js), configuration builder, and orders screen are deferred to Sub-plans 2–4.

---

## Goals

- Authenticated users can log in and register via a Next.js frontend backed by the existing FastAPI JWT auth
- Users can view their projects and navigate to a project detail page listing its configurations
- The app shell (nav, routing, session management) is in place for Sub-plan 2 to build on

---

## Non-Goals (Sub-plan 1)

- Configuration builder / editor (Sub-plan 2)
- 3D Babylon.js viewer (Sub-plan 3)
- Orders, exports, webhook dispatch (Sub-plan 4)
- OAuth providers (Google, GitHub) — NextAuth Credentials only
- E2E tests — introduced in Sub-plan 2
- Project deletion or editing

---

## Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 15 App Router |
| Auth | NextAuth (Auth.js v5) — Credentials provider |
| Styling | Plain Tailwind CSS — no component library |
| Data fetching | React Server Components + native `fetch` |
| Testing | Jest unit tests for `lib/api.ts` |

---

## Architecture

```
frontend/
  app/
    (auth)/
      login/page.tsx          ← login form + Server Action
      register/page.tsx       ← register form + Server Action
      layout.tsx              ← centered card layout (no nav)
    (app)/
      dashboard/page.tsx      ← project list (Server Component)
      projects/
        new/page.tsx          ← create project form
        [id]/page.tsx         ← project detail + config cards
      layout.tsx              ← app shell with top nav bar
    layout.tsx                ← root layout (NextAuth SessionProvider)
    page.tsx                  ← redirect → /dashboard or /login
  lib/
    api.ts                    ← typed fetch helpers + ApiError
    auth.ts                   ← NextAuth config (Credentials provider + callbacks)
  middleware.ts               ← auth guard: unauthenticated → /login
  next.config.ts
  tailwind.config.ts
  package.json
```

Route groups `(auth)` and `(app)` give each page set its own layout without affecting URLs. `middleware.ts` guards all `/(app)/*` routes centrally — no per-page auth checks in Server Components.

---

## Auth Flow

### Login

1. User submits login form → Server Action calls `signIn("credentials", {email, password})`
2. NextAuth `authorize()` in `lib/auth.ts` → `POST /auth/login` on FastAPI → `{access_token}`
3. NextAuth `jwt` callback stores `access_token` inside the session JWT
4. NextAuth `session` callback exposes `access_token` to `auth()` callers
5. Session stored in an httpOnly cookie — frontend JS never sees the token
6. Server Components call `auth()` → extract `access_token` → pass to `lib/api.ts`

### Register

1. Register form → Server Action → `POST /auth/register` on FastAPI
2. On success → `signIn("credentials", {email, password})` (auto-login)
3. Redirect to `/dashboard`

### Auth errors

NextAuth sets `?error=CredentialsSignin` on failure. Login/register pages read the param and render an inline error message below the form.

### Middleware

`middleware.ts` uses NextAuth's exported `auth` function. Any request to `/(app)/*` without a valid session cookie is redirected to `/login` before the page renders.

---

## Pages

### `/login`

Server Component + Server Action. Centered card layout (no nav). Email + password fields. On error: inline message under the form. Link to `/register`.

### `/register`

Server Component + Server Action. Same centered card layout. Name + email + password fields. On success: auto-login + redirect to `/dashboard`. On 409 (email taken): inline error.

### `/dashboard`

Server Component. Fetches `GET /projects` with the user's `access_token`. Renders a grid of project cards (name, created date). "New Project" button navigates to `/projects/new`. Top nav bar (logo, user email, sign-out link).

### `/projects/new`

Server Component with a form. Server Action → `POST /projects` → on success redirect to `/projects/{id}`. Validates name is non-empty client-side (HTML `required`).

### `/projects/[id]`

Server Component. Fetches `GET /projects/{id}` and `GET /configurations?project_id={id}` in parallel. Renders project name + metadata header, then a grid of configuration cards (furniture type name, status badge). "New Configuration" button is a **disabled placeholder** — Sub-plan 2 activates it.

Resolving furniture type names: each configuration card needs the furniture type name. The page fetches `GET /furniture-types/{id}` for each unique `furniture_type_id` in the configuration list (parallel fetches, deduplicated by ID).

---

## `lib/api.ts`

Central fetch helper used by all typed functions:

```ts
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json()
}

export async function getProjects(token: string): Promise<Project[]>
export async function getProject(token: string, id: string): Promise<Project>
export async function createProject(token: string, name: string): Promise<Project>
export async function listConfigurations(token: string, projectId: string): Promise<Configuration[]>
export async function getFurnitureType(token: string, id: string): Promise<FurnitureType>
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Wrong password | NextAuth `?error=CredentialsSignin` → inline form error |
| Email already taken (register) | Backend 409 → Server Action returns error state → inline form error |
| Backend 401 in Server Component | `ApiError(401)` caught in page → `redirect("/login")` |
| Project not found | `ApiError(404)` caught in page → `notFound()` → `not-found.tsx` |
| Network / 5xx | Unhandled → Next.js `error.tsx` boundary → generic retry page |
| Unauthenticated route | `middleware.ts` intercepts → `redirect("/login")` |

---

## Backend Addition

`GET /configurations?project_id={id}` added to `backend/app/api/configurations.py`. Returns all configurations owned by the requesting user that belong to the given project. Filters by `project_id` + ownership check (configuration → project → `project.user_id == user.id`).

One integration test added to `backend/tests/test_configurations.py`: list returns only configurations belonging to the specified project.

---

## Testing

**Jest unit tests for `lib/api.ts`** (mock `fetch`):
- `getProjects` — correct URL + `Authorization` header, returns typed array
- `getProject` — 404 response throws `ApiError(404)`
- `createProject` — correct POST body, 201 returns new project
- `listConfigurations` — `?project_id=` query param set correctly
- `apiFetch` — non-ok responses always throw `ApiError` with correct status

No E2E or component tests in Sub-plan 1. Playwright is introduced in Sub-plan 2.

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/app/(auth)/login/page.tsx` | Create | Login form + Server Action |
| `frontend/app/(auth)/register/page.tsx` | Create | Register form + Server Action |
| `frontend/app/(auth)/layout.tsx` | Create | Centered card layout |
| `frontend/app/(app)/dashboard/page.tsx` | Create | Project list (Server Component) |
| `frontend/app/(app)/projects/new/page.tsx` | Create | Create project form |
| `frontend/app/(app)/projects/[id]/page.tsx` | Create | Project detail + config cards |
| `frontend/app/(app)/layout.tsx` | Create | App shell with nav |
| `frontend/app/layout.tsx` | Create | Root layout (SessionProvider) |
| `frontend/app/page.tsx` | Create | Root redirect |
| `frontend/lib/api.ts` | Create | Typed fetch helpers + ApiError |
| `frontend/lib/auth.ts` | Create | NextAuth v5 Credentials config |
| `frontend/middleware.ts` | Create | Auth guard middleware |
| `frontend/next.config.ts` | Create | Next.js config (BACKEND_URL env) |
| `frontend/tailwind.config.ts` | Create | Tailwind config |
| `frontend/package.json` | Create | Dependencies |
| `frontend/tests/lib/api.test.ts` | Create | Jest unit tests for api.ts |
| `backend/app/api/configurations.py` | Modify | Add `GET /configurations?project_id=` |
| `backend/tests/test_configurations.py` | Modify | Add list-by-project integration test |
