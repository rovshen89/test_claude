# Projects Route Rename — Implementation Plan (Sub-plan 20)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the projects list page from `/dashboard` to `/projects`, redirect `/dashboard` → `/projects`, add "Projects" as the first nav item, and update all 11 internal `/dashboard` references across 12 files.

**Architecture:** Create a new `frontend/app/(app)/projects/page.tsx` (copied from `dashboard/page.tsx`), replace `dashboard/page.tsx` with a redirect shim, update `layout.tsx` to add the Projects nav link and fix the logo link, then update the remaining 9 files with simple `/dashboard` → `/projects` string replacements. No backend changes, no new API functions, no new tests.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, TypeScript, Tailwind CSS.

---

### Task 1: Create projects page, update dashboard redirect, update nav

**Files:**
- Create: `frontend/app/(app)/projects/page.tsx`
- Modify: `frontend/app/(app)/dashboard/page.tsx`
- Modify: `frontend/app/(app)/layout.tsx`

Context: The projects list currently lives at `/dashboard` (in `dashboard/page.tsx`). We create an identical copy at `projects/page.tsx` (function renamed to `ProjectsPage`), turn `dashboard/page.tsx` into a one-line redirect, and update the layout to add "Projects" as the first nav item and change the logo link.

Note: There is no `frontend/app/(app)/projects/page.tsx` yet — `frontend/app/(app)/projects/` only contains `[id]/` and `new/` subdirs. The new file sits alongside those dirs.

- [ ] **Step 1: Create `frontend/app/(app)/projects/page.tsx`**

Create the file with this exact content:

```tsx
import { auth } from "@/lib/auth"
import { getProjects, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function ProjectsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")

  let projects
  try {
    projects = await getProjects(session.user.access_token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

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
                Created {new Date(project.created_at).toLocaleDateString("en-US")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace `frontend/app/(app)/dashboard/page.tsx` with a redirect shim**

Replace the entire file content with:

```tsx
import { redirect } from "next/navigation"

export default function DashboardPage() {
  redirect("/projects")
}
```

(The current file has ~54 lines of projects list logic — discard it all.)

- [ ] **Step 3: Update `frontend/app/(app)/layout.tsx`**

Two changes in this file:

**A) Change the Configurator logo link** from `/dashboard` to `/projects`.

Find:
```tsx
        <Link href="/dashboard" className="text-sm font-semibold text-slate-50">
          Configurator
        </Link>
```

Replace with:
```tsx
        <Link href="/projects" className="text-sm font-semibold text-slate-50">
          Configurator
        </Link>
```

**B) Add "Projects" as the first nav item** in the nav links div (before "Materials").

Find:
```tsx
        <div className="flex items-center gap-6">
          <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
            Materials
          </Link>
```

Replace with:
```tsx
        <div className="flex items-center gap-6">
          <Link href="/projects" className="text-xs text-slate-400 hover:text-slate-200">
            Projects
          </Link>
          <Link href="/materials" className="text-xs text-slate-400 hover:text-slate-200">
            Materials
          </Link>
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (0 errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add "frontend/app/(app)/projects/page.tsx" "frontend/app/(app)/dashboard/page.tsx" "frontend/app/(app)/layout.tsx" && git commit -m "feat: add projects list page at /projects, redirect /dashboard, update nav (sub-plan 20)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Update remaining /dashboard references

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/not-found.tsx`
- Modify: `frontend/app/error.tsx`
- Modify: `frontend/app/(auth)/login/page.tsx`
- Modify: `frontend/app/(auth)/register/page.tsx`
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`
- Modify: `frontend/app/(app)/projects/[id]/not-found.tsx`
- Modify: `frontend/app/(app)/projects/new/page.tsx`
- Modify: `frontend/app/actions/projects.ts`

Context: These 9 files each contain one or two `/dashboard` references (as `href`, `redirect()`, `redirectTo:`, or `revalidatePath()` arguments) that must all point to `/projects` instead.

- [ ] **Step 1: Update `frontend/app/page.tsx`**

Find:
```tsx
  if (session) redirect("/dashboard")
```

Replace with:
```tsx
  if (session) redirect("/projects")
```

- [ ] **Step 2: Update `frontend/app/not-found.tsx`**

Find:
```tsx
      <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
        Go to dashboard
      </Link>
```

Replace with:
```tsx
      <Link href="/projects" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Projects
      </Link>
```

- [ ] **Step 3: Update `frontend/app/error.tsx`**

Find:
```tsx
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-400 text-sm">
          Go home
        </Link>
```

Replace with:
```tsx
        <Link href="/projects" className="text-slate-500 hover:text-slate-400 text-sm">
          Go home
        </Link>
```

- [ ] **Step 4: Update `frontend/app/(auth)/login/page.tsx`**

Find:
```tsx
      await signIn("credentials", { email, password, redirectTo: "/dashboard" })
```

Replace with:
```tsx
      await signIn("credentials", { email, password, redirectTo: "/projects" })
```

- [ ] **Step 5: Update `frontend/app/(auth)/register/page.tsx`**

Find:
```tsx
      await signIn("credentials", { email, password, redirectTo: "/dashboard" })
```

Replace with:
```tsx
      await signIn("credentials", { email, password, redirectTo: "/projects" })
```

- [ ] **Step 6: Update `frontend/app/(app)/projects/[id]/page.tsx`**

Find:
```tsx
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
```

Replace with:
```tsx
        <Link href="/projects" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
```

- [ ] **Step 7: Update `frontend/app/(app)/projects/[id]/not-found.tsx`**

Find:
```tsx
      <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Back to projects
      </Link>
```

Replace with:
```tsx
      <Link href="/projects" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Back to projects
      </Link>
```

- [ ] **Step 8: Update `frontend/app/(app)/projects/new/page.tsx`** (two references)

First reference — breadcrumb link:

Find:
```tsx
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
```

Replace with:
```tsx
        <Link href="/projects" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
```

Second reference — Cancel button:

Find:
```tsx
          <Link
            href="/dashboard"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
```

Replace with:
```tsx
          <Link
            href="/projects"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
```

- [ ] **Step 9: Update `frontend/app/actions/projects.ts`** (two references in `deleteProjectAction`)

Find:
```ts
  revalidatePath("/dashboard")
  redirect("/dashboard")
```

Replace with:
```ts
  revalidatePath("/projects")
  redirect("/projects")
```

- [ ] **Step 10: Verify TypeScript + Jest**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -20 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 57 tests pass.

- [ ] **Step 11: Confirm no remaining `/dashboard` references in frontend**

```bash
grep -r '"/dashboard"' /Users/rovshennurybayev/claude_agents/frontend/app/
```

Expected: no output (all references replaced). If any appear, fix them before committing.

- [ ] **Step 12: Commit**

```bash
cd /Users/rovshennurybayev/claude_agents && git add \
  "frontend/app/page.tsx" \
  "frontend/app/not-found.tsx" \
  "frontend/app/error.tsx" \
  "frontend/app/(auth)/login/page.tsx" \
  "frontend/app/(auth)/register/page.tsx" \
  "frontend/app/(app)/projects/[id]/page.tsx" \
  "frontend/app/(app)/projects/[id]/not-found.tsx" \
  "frontend/app/(app)/projects/new/page.tsx" \
  "frontend/app/actions/projects.ts" \
  && git commit -m "feat: update all /dashboard references to /projects (sub-plan 20)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Push

- [ ] **Step 1: Run full frontend checks**

```bash
cd /Users/rovshennurybayev/claude_agents/frontend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no TS errors; 57 tests pass.

- [ ] **Step 2: Push**

```bash
cd /Users/rovshennurybayev/claude_agents && git push origin main
```
