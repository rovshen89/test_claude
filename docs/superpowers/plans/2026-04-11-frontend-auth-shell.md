# Frontend Auth + Project Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Next.js 15 App Router frontend with NextAuth v5 login/register, a project list dashboard, and a project detail page showing configurations read-only.

**Architecture:** Route groups `(auth)` and `(app)` provide separate layouts; `middleware.ts` guards all `/(app)/*` routes via NextAuth; all data fetching uses Server Components calling `lib/api.ts` typed helpers with the user's FastAPI JWT obtained from the NextAuth session.

**Tech Stack:** Next.js 15, React 19, NextAuth (Auth.js) v5 Credentials, Tailwind CSS 3, Jest 29 (unit tests for `lib/api.ts` only; no E2E in this plan).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/api/configurations.py` | Modify | Add `GET /configurations?project_id=` list endpoint |
| `backend/tests/test_configurations.py` | Modify | Add 2 integration tests for the new list endpoint |
| `frontend/package.json` | Create | Dependencies + scripts |
| `frontend/tsconfig.json` | Create | TypeScript config with `@/` path alias |
| `frontend/next.config.ts` | Create | Next.js config (empty for Sub-plan 1) |
| `frontend/tailwind.config.ts` | Create | Tailwind content paths |
| `frontend/postcss.config.js` | Create | Tailwind + autoprefixer |
| `frontend/app/globals.css` | Create | Tailwind directives |
| `frontend/types/next-auth.d.ts` | Create | Module augmentation: add `access_token` to Session + JWT |
| `frontend/lib/auth.ts` | Create | NextAuth v5 config: Credentials provider, jwt/session callbacks |
| `frontend/app/api/auth/[...nextauth]/route.ts` | Create | NextAuth route handlers (GET + POST) |
| `frontend/jest.config.ts` | Create | Jest config using `next/jest.js` |
| `frontend/lib/api.ts` | Create | `ApiError`, `apiFetch`, typed helpers for projects/configs/furniture-types |
| `frontend/tests/lib/api.test.ts` | Create | Jest unit tests for `lib/api.ts` |
| `frontend/middleware.ts` | Create | Auth guard: unauthenticated requests to protected routes → `/login` |
| `frontend/app/layout.tsx` | Create | Root layout: HTML shell + Tailwind body styles |
| `frontend/app/page.tsx` | Create | Root redirect: session → `/dashboard`, no session → `/login` |
| `frontend/app/not-found.tsx` | Create | Global 404 page |
| `frontend/app/error.tsx` | Create | Global error boundary (Client Component) |
| `frontend/app/(auth)/layout.tsx` | Create | Centered card layout for auth pages |
| `frontend/app/(auth)/login/page.tsx` | Create | Login form with Server Action |
| `frontend/app/(auth)/register/page.tsx` | Create | Register form with Server Action (auto-login on success) |
| `frontend/app/(app)/layout.tsx` | Create | App shell: top nav (logo + email + sign-out) |
| `frontend/app/(app)/dashboard/page.tsx` | Create | Project grid; fetches `GET /projects` |
| `frontend/app/(app)/projects/new/page.tsx` | Create | Create project form; Server Action → `POST /projects` → redirect |
| `frontend/app/(app)/projects/[id]/page.tsx` | Create | Project detail + config cards; parallel fetches |
| `frontend/app/(app)/projects/[id]/not-found.tsx` | Create | Project-specific 404 page |

---

## Task 1: Backend — List Configurations by Project

**Files:**
- Modify: `backend/app/api/configurations.py`
- Modify: `backend/tests/test_configurations.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_configurations.py`:

```python
@pytest.mark.asyncio
async def test_list_configurations_by_project(client):
    """GET /configurations?project_id= returns only configs for that project."""
    headers, project_id, ft_id = await _setup(client)

    # Create a second project
    r = await client.post("/projects", json={"name": "Other Project"}, headers=headers)
    other_project_id = r.json()["id"]

    # Create one config in each project
    c1 = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    c2 = await client.post("/configurations", json={
        "project_id": other_project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 900},
    }, headers=headers)
    assert c1.status_code == 201
    assert c2.status_code == 201

    r = await client.get(f"/configurations?project_id={project_id}", headers=headers)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert c1.json()["id"] in ids
    assert c2.json()["id"] not in ids


@pytest.mark.asyncio
async def test_list_configurations_wrong_owner_returns_404(client):
    """GET /configurations?project_id= returns 404 for another user's project."""
    headers_a, project_id, _ = await _setup(client)

    email_b = f"cfg_b_{_uuid.uuid4().hex[:8]}@example.com"
    await client.post("/auth/register", json={"email": email_b, "password": "password", "role": "manufacturer"})
    r = await client.post("/auth/login", json={"email": email_b, "password": "password"})
    headers_b = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await client.get(f"/configurations?project_id={project_id}", headers=headers_b)
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/backend
.venv312/bin/python -m pytest tests/test_configurations.py::test_list_configurations_by_project tests/test_configurations.py::test_list_configurations_wrong_owner_returns_404 -v
```

Expected: FAIL — `405 Method Not Allowed` or route not found.

- [ ] **Step 3: Add the list endpoint**

Edit `backend/app/api/configurations.py`.

Add `Query` to the fastapi import and `select` from sqlalchemy:
```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
```

Insert this route **before** the existing `GET "/{config_id}"` route (line 50):

```python
@router.get("", response_model=list[ConfigurationResponse])
async def list_configurations(
    project_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user)
    result = await db.execute(
        select(Configuration).where(Configuration.project_id == project_id)
    )
    return result.scalars().all()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rovshennurybayev/claude_agents/backend
.venv312/bin/python -m pytest tests/test_configurations.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add backend/app/api/configurations.py backend/tests/test_configurations.py
git commit -m "feat: add GET /configurations?project_id= list endpoint"
```

---

## Task 2: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/app/globals.css`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "furniture-configurator-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "test": "jest"
  },
  "dependencies": {
    "next": "15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next-auth": "5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `frontend/next.config.ts`**

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 4: Create `frontend/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Create `frontend/postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create `frontend/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no output (no errors). If `next-env.d.ts` is missing, run `npx next build` once to generate it, then re-run tsc.

- [ ] **Step 9: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/
git commit -m "feat: scaffold Next.js 15 frontend with Tailwind"
```

---

## Task 3: NextAuth Config

**Files:**
- Create: `frontend/types/next-auth.d.ts`
- Create: `frontend/lib/auth.ts`
- Create: `frontend/app/api/auth/[...nextauth]/route.ts`

NextAuth v5 stores `access_token` (the FastAPI JWT) inside its own session JWT cookie. The type augmentation in `types/next-auth.d.ts` tells TypeScript about this extra field so `session.user.access_token` is typed correctly.

- [ ] **Step 1: Create `frontend/types/next-auth.d.ts`**

```ts
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    access_token?: string
  }
  interface Session {
    user: {
      email?: string | null
      access_token: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string
  }
}
```

- [ ] **Step 2: Create `frontend/lib/auth.ts`**

`authorize()` calls `POST /auth/login` on the FastAPI backend and returns the access token. The `jwt` callback copies it into the NextAuth JWT. The `session` callback exposes it via `auth()`.

```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const res = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        })
        if (!res.ok) return null
        const data = (await res.json()) as { access_token: string }
        return {
          id: credentials.email as string,
          email: credentials.email as string,
          access_token: data.access_token,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.access_token = (user as { access_token: string }).access_token
      return token
    },
    async session({ session, token }) {
      session.user = { ...session.user, access_token: token.access_token as string }
      return session
    },
  },
  pages: { signIn: "/login" },
})
```

- [ ] **Step 3: Create `frontend/app/api/auth/[...nextauth]/route.ts`**

Create the directories `frontend/app/api/auth/[...nextauth]/` then create `route.ts`:

```ts
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

- [ ] **Step 4: Create `.env.local` with required env vars**

Create `frontend/.env.local` (this file is gitignored by Next.js):

```
AUTH_SECRET=replace-with-openssl-rand-base64-32
BACKEND_URL=http://localhost:8000
```

Generate a real secret:
```bash
openssl rand -base64 32
```

Paste the output as the `AUTH_SECRET` value. **Do not commit this file.**

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/types/ frontend/lib/auth.ts frontend/app/api/
git commit -m "feat: add NextAuth v5 Credentials provider config"
```

---

## Task 4: API Client + Tests

**Files:**
- Create: `frontend/jest.config.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/tests/lib/api.test.ts`

- [ ] **Step 1: Create `frontend/jest.config.ts`**

`nextJest` handles TypeScript transpilation and resolves `@/` path aliases automatically.

```ts
import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({ dir: "./" })

const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["**/tests/**/*.test.ts"],
}

export default createJestConfig(config)
```

- [ ] **Step 2: Write failing tests**

Create `frontend/tests/lib/api.test.ts`:

```ts
import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
} from "@/lib/api"

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.BACKEND_URL = "http://localhost:8000"
})

describe("ApiError", () => {
  it("stores status and message", () => {
    const e = new ApiError(404, "not found")
    expect(e.status).toBe(404)
    expect(e.message).toBe("not found")
    expect(e).toBeInstanceOf(Error)
  })
})

describe("getProjects", () => {
  it("calls GET /projects with Authorization header and returns array", async () => {
    const fixture = [{ id: "p1", name: "A", user_id: "u1", room_schema: null, created_at: "", updated_at: "" }]
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getProjects("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toEqual(fixture)
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(getProjects("bad")).rejects.toMatchObject({ status: 401 })
  })
})

describe("getProject", () => {
  it("calls GET /projects/{id}", async () => {
    const fixture = { id: "p1", name: "A", user_id: "u1", room_schema: null, created_at: "", updated_at: "" }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getProject("tok", "p1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/p1",
      expect.anything()
    )
    expect(result.id).toBe("p1")
  })

  it("throws ApiError(404) on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getProject("tok", "x")).rejects.toMatchObject({ status: 404 })
  })
})

describe("createProject", () => {
  it("calls POST /projects with name in body", async () => {
    const fixture = { id: "p2", name: "New", user_id: "u1", room_schema: null, created_at: "", updated_at: "" }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await createProject("tok", "New")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New" }),
      })
    )
    expect(result.name).toBe("New")
  })
})

describe("listConfigurations", () => {
  it("includes project_id query param", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

    await listConfigurations("tok", "proj-123")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations?project_id=proj-123",
      expect.anything()
    )
  })
})

describe("getFurnitureType", () => {
  it("calls GET /furniture-types/{id}", async () => {
    const fixture = { id: "ft1", category: "wardrobe", schema: {}, tenant_id: null }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getFurnitureType("tok", "ft1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types/ft1",
      expect.anything()
    )
    expect(result.category).toBe("wardrobe")
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm test
```

Expected: FAIL — `Cannot find module '@/lib/api'`.

- [ ] **Step 4: Create `frontend/lib/api.ts`**

```ts
export type Project = {
  id: string
  user_id: string
  name: string
  room_schema: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type Configuration = {
  id: string
  project_id: string
  furniture_type_id: string
  applied_config: Record<string, unknown>
  placement: Record<string, unknown> | null
  status: string
}

export type FurnitureType = {
  id: string
  tenant_id: string | null
  category: string
  schema: Record<string, unknown>
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = "ApiError"
  }
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}

export async function getProjects(token: string): Promise<Project[]> {
  return apiFetch<Project[]>("/projects", token)
}

export async function getProject(token: string, id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`, token)
}

export async function createProject(token: string, name: string): Promise<Project> {
  return apiFetch<Project>("/projects", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function listConfigurations(token: string, projectId: string): Promise<Configuration[]> {
  return apiFetch<Configuration[]>(`/configurations?project_id=${projectId}`, token)
}

export async function getFurnitureType(token: string, id: string): Promise<FurnitureType> {
  return apiFetch<FurnitureType>(`/furniture-types/${id}`, token)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm test
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/jest.config.ts frontend/lib/api.ts frontend/tests/
git commit -m "feat: add lib/api.ts typed fetch helpers with Jest tests"
```

---

## Task 5: Root Layout, Middleware, and Error Pages

**Files:**
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`
- Create: `frontend/middleware.ts`
- Create: `frontend/app/not-found.tsx`
- Create: `frontend/app/error.tsx`

- [ ] **Step 1: Create `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Furniture Configurator",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-50 antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Create `frontend/app/page.tsx`**

Checks session and redirects immediately. Authenticated users → `/dashboard`; unauthenticated → `/login`.

```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function RootPage() {
  const session = await auth()
  if (session) redirect("/dashboard")
  redirect("/login")
}
```

- [ ] **Step 3: Create `frontend/middleware.ts`**

Protects all routes under `/dashboard` and `/projects`. The `(app)` route group prefix is stripped in URLs.

```ts
export { auth as middleware } from "@/lib/auth"

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*"],
}
```

- [ ] **Step 4: Create `frontend/app/not-found.tsx`**

```tsx
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-400 text-sm">Page not found.</p>
      <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
        Go to dashboard
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: Create `frontend/app/error.tsx`**

Error boundaries must be Client Components.

```tsx
"use client"

import Link from "next/link"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-400 text-sm">Something went wrong.</p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="text-indigo-400 hover:text-indigo-300 text-sm"
        >
          Try again
        </button>
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-400 text-sm">
          Go home
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/app/layout.tsx frontend/app/page.tsx frontend/middleware.ts frontend/app/not-found.tsx frontend/app/error.tsx
git commit -m "feat: add root layout, middleware, and error pages"
```

---

## Task 6: Auth Pages (Login + Register)

**Files:**
- Create: `frontend/app/(auth)/layout.tsx`
- Create: `frontend/app/(auth)/login/page.tsx`
- Create: `frontend/app/(auth)/register/page.tsx`

The `(auth)` route group produces URLs `/login` and `/register` (group name stripped).

**Key pattern for Server Actions with redirects:** `signIn(...)` throws `NEXT_REDIRECT` on success. `AuthError` is thrown on credential failure. Always re-throw non-`AuthError` exceptions so Next.js can handle `NEXT_REDIRECT`.

- [ ] **Step 1: Create `frontend/app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/app/(auth)/login/page.tsx`**

```tsx
import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function loginAction(formData: FormData) {
    "use server"
    try {
      await signIn("credentials", {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
        redirectTo: "/dashboard",
      })
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1")
      throw e
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-slate-50 mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-6">Furniture configurator platform</p>
        {error && (
          <p className="text-sm text-red-400 mb-4">Invalid email or password.</p>
        )}
        <form action={loginAction} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            Sign in
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-5">
          No account?{" "}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/app/(auth)/register/page.tsx`**

The register action calls `POST /auth/register` directly (not via `lib/api.ts` — no token needed), then auto-logs in via `signIn`. `role` defaults to `"consumer"` and `tenant_id` defaults to `null` on the backend; we don't send them from the form.

```tsx
import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function registerAction(formData: FormData) {
    "use server"
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const res = await fetch(`${process.env.BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const body = (await res.json()) as { detail?: string }
      const code = body.detail?.toLowerCase().includes("already") ? "taken" : "error"
      redirect(`/register?error=${code}`)
    }

    // Auto-login after successful registration
    try {
      await signIn("credentials", { email, password, redirectTo: "/dashboard" })
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1")
      throw e
    }
  }

  const errorMessage =
    error === "taken"
      ? "That email is already registered."
      : error
      ? "Something went wrong. Please try again."
      : null

  return (
    <div className="w-full max-w-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-slate-50 mb-1">Create account</h1>
        <p className="text-sm text-slate-500 mb-6">Furniture configurator platform</p>
        {errorMessage && (
          <p className="text-sm text-red-400 mb-4">{errorMessage}</p>
        )}
        <form action={registerAction} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="password">
              Password{" "}
              <span className="text-slate-600">(8+ characters)</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            Create account
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-5">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke test in browser**

Start the backend:
```bash
cd /Users/rovshennurybayev/claude_agents/backend
.venv312/bin/uvicorn app.main:app --reload
```

Start the frontend (separate terminal):
```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm run dev
```

Visit `http://localhost:3000`. Expected: redirected to `/login`.
Register a new user. Expected: redirected to `/dashboard` (blank page is fine — dashboard not built yet).
Sign out. Expected: redirected to `/login`.
Log in with the created credentials. Expected: redirected to `/dashboard`.

- [ ] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/app/\(auth\)/
git commit -m "feat: add login and register pages with Server Actions"
```

---

## Task 7: App Shell Layout + Dashboard

**Files:**
- Create: `frontend/app/(app)/layout.tsx`
- Create: `frontend/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create `frontend/app/(app)/layout.tsx`**

The layout reads the session for the user's email (used in the nav) and renders the sign-out button. The `signOut` Server Action redirect throws `NEXT_REDIRECT`; it must be re-thrown.

```tsx
import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  async function signOutAction() {
    "use server"
    await signOut({ redirectTo: "/login" })
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="bg-slate-900 border-b border-slate-800 h-12 flex items-center justify-between px-6">
        <Link href="/dashboard" className="text-sm font-semibold text-slate-50">
          Configurator
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">{session.user.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="text-xs text-indigo-400 hover:text-indigo-300">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/app/(app)/dashboard/page.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { getProjects } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")

  const projects = await getProjects(session.user.access_token)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Projects</h1>
        <Link
          href="/projects/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Project
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No projects yet.{" "}
          <Link href="/projects/new" className="text-indigo-400 hover:text-indigo-300">
            Create your first one.
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
            >
              <p className="text-sm font-medium text-slate-100">{project.name}</p>
              <p className="text-xs text-slate-500 mt-1">
                Created {new Date(project.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

With backend + frontend running (from Task 6 Step 5), visit `http://localhost:3000/dashboard`. Expected: project grid (empty or with projects). "Configurator" logo in nav. Sign-out link visible.

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/app/\(app\)/layout.tsx frontend/app/\(app\)/dashboard/
git commit -m "feat: add app shell layout and dashboard page"
```

---

## Task 8: New Project Page

**Files:**
- Create: `frontend/app/(app)/projects/new/page.tsx`

- [ ] **Step 1: Create `frontend/app/(app)/projects/new/page.tsx`**

The Server Action calls `auth()` to retrieve the token (cookies are available in Server Actions). After creating the project it redirects to the project detail page.

```tsx
import { auth } from "@/lib/auth"
import { createProject } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function NewProjectPage() {
  async function createAction(formData: FormData) {
    "use server"
    const name = (formData.get("name") as string).trim()
    const session = await auth()
    if (!session?.user?.access_token) redirect("/login")
    const project = await createProject(session.user.access_token, name)
    redirect(`/projects/${project.id}`)
  }

  return (
    <div className="max-w-md">
      <div className="mb-4">
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Project</h1>
      <form action={createAction} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5" htmlFor="name">
            Project name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Kitchen Remodel"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Create project
          </button>
          <Link
            href="/dashboard"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test**

Click "+ New Project" on the dashboard. Fill in a name. Submit. Expected: redirected to `/projects/{id}` (404 or blank page — detail page not built yet).

- [ ] **Step 4: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/app/\(app\)/projects/new/
git commit -m "feat: add new project page"
```

---

## Task 9: Project Detail Page

**Files:**
- Create: `frontend/app/(app)/projects/[id]/page.tsx`
- Create: `frontend/app/(app)/projects/[id]/not-found.tsx`

- [ ] **Step 1: Create `frontend/app/(app)/projects/[id]/not-found.tsx`**

```tsx
import Link from "next/link"

export default function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
      <p className="text-slate-400 text-sm">Project not found.</p>
      <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Back to projects
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/app/(app)/projects/[id]/page.tsx`**

Fetches project + configurations in parallel. Then fetches furniture type names for unique `furniture_type_id` values (also in parallel, deduplicated). `notFound()` is called on `ApiError(404)`.

The "New Configuration" button is disabled — Sub-plan 2 activates it.

```tsx
import { auth } from "@/lib/auth"
import { getProject, listConfigurations, getFurnitureType, ApiError, type Project, type Configuration } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

function statusColors(status: string): string {
  switch (status) {
    case "draft":
      return "bg-cyan-950 text-cyan-300"
    case "confirmed":
      return "bg-blue-950 text-blue-300"
    case "in_production":
      return "bg-amber-950 text-amber-300"
    case "completed":
      return "bg-green-950 text-green-400"
    default:
      return "bg-slate-800 text-slate-400"
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  // Definite-assignment assertions (`!`) tell TypeScript the try block always assigns
  // these or throws (via notFound() / re-throw), so they're safe to use below.
  let project!: Project
  let configs!: Configuration[]
  try {
    ;[project, configs] = await Promise.all([
      getProject(token, id),
      listConfigurations(token, id),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    throw e
  }

  // Fetch furniture type names for all unique IDs in parallel
  const uniqueFtIds = [...new Set(configs.map((c) => c.furniture_type_id))]
  const ftList = await Promise.all(uniqueFtIds.map((ftId) => getFurnitureType(token, ftId)))
  const ftMap = Object.fromEntries(ftList.map((ft) => [ft.id, ft.category]))

  return (
    <div>
      <div className="mb-2">
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
      </div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold text-slate-50">{project.name}</h1>
        <button
          disabled
          title="Configuration builder coming in Sub-plan 2"
          className="border border-slate-700 text-slate-600 rounded-md px-4 py-2 text-sm font-medium cursor-not-allowed"
        >
          + New Configuration
        </button>
      </div>
      {configs.length === 0 ? (
        <p className="text-slate-500 text-sm">No configurations yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {ftMap[cfg.furniture_type_id] ?? "Unknown type"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    {cfg.id.slice(0, 8)}…
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${statusColors(cfg.status)}`}
                >
                  {cfg.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

Navigate to a project from the dashboard. Expected: project name, "New Configuration" button (disabled), configuration cards if any exist (or "No configurations yet." if not).

Visit `/projects/nonexistent-id`. Expected: "Project not found." page with a back link.

- [ ] **Step 5: Run all tests**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend
npm test
```

Expected: all 8 tests PASS.

```bash
cd /Users/rovshennurybayev/claude_agents/backend
.venv312/bin/python -m pytest tests/ -v
```

Expected: all backend tests PASS (including the 2 new configuration list tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents
git add frontend/app/\(app\)/projects/\[id\]/
git commit -m "feat: add project detail page with configuration cards"
```
