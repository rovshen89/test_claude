# Projects Route Rename — Design Spec (Sub-plan 20)
**Date:** 2026-04-30
**Status:** Approved

---

## Overview

The projects list lives at `/dashboard` but the nav has no "Projects" link — only the "Configurator" logo (top-left) links there. All other top-level resources (Materials, Configurations, Orders, Furniture Types) have explicit nav items. Move the projects list page to `/projects`, redirect `/dashboard` → `/projects`, update all 11 internal references, and add "Projects" as the first nav item.

---

## Non-Goals

- Changing the content or layout of the projects list page
- Adding filtering, sorting, or pagination to the projects list
- Removing the "Configurator" logo link (it will also point to `/projects`)

---

## Architecture

```
frontend/
  app/
    (app)/
      projects/
        page.tsx          ← CREATE: copy of dashboard/page.tsx content
        [id]/...          ← unchanged (already exists)
      dashboard/
        page.tsx          ← MODIFY: replace content with redirect("/projects")
      layout.tsx          ← MODIFY: add "Projects" nav link; Configurator logo → /projects
    actions/
      projects.ts         ← MODIFY: revalidatePath/redirect target → /projects
    not-found.tsx         ← MODIFY: Go to dashboard → /projects
    error.tsx             ← MODIFY: Go home → /projects
    page.tsx              ← MODIFY: initial redirect → /projects (was /dashboard)
    (auth)/
      login/page.tsx      ← MODIFY: redirectTo /projects
      register/page.tsx   ← MODIFY: redirectTo /projects
  app/(app)/projects/[id]/
    page.tsx              ← MODIFY: ← Projects breadcrumb href → /projects
    not-found.tsx         ← MODIFY: back link → /projects
  app/(app)/projects/new/
    page.tsx              ← MODIFY: ← Projects and Cancel → /projects
```

---

## Behavior

### New `app/(app)/projects/page.tsx`

Identical content to current `app/(app)/dashboard/page.tsx`:

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

### Updated `app/(app)/dashboard/page.tsx`

Replace the entire page with a redirect:

```tsx
import { redirect } from "next/navigation"

export default function DashboardPage() {
  redirect("/projects")
}
```

### Nav link added to `app/(app)/layout.tsx`

- "Configurator" logo link changes from `/dashboard` to `/projects`
- Add "Projects" as the first item in the nav links div (before "Materials")

```tsx
<Link href="/projects" className="text-xs text-slate-400 hover:text-slate-200">
  Projects
</Link>
```

### All `/dashboard` references updated to `/projects`

| File | Change |
|------|--------|
| `app/page.tsx` | `redirect("/dashboard")` → `redirect("/projects")` |
| `app/not-found.tsx` | `href="/dashboard"` → `href="/projects"`, text "Go to dashboard" → "← Projects" |
| `app/error.tsx` | `href="/dashboard"` → `href="/projects"` |
| `app/(auth)/login/page.tsx` | `redirectTo: "/dashboard"` → `redirectTo: "/projects"` |
| `app/(auth)/register/page.tsx` | `redirectTo: "/dashboard"` → `redirectTo: "/projects"` |
| `app/(app)/projects/[id]/page.tsx` | `href="/dashboard"` → `href="/projects"` |
| `app/(app)/projects/[id]/not-found.tsx` | `href="/dashboard"` → `href="/projects"` |
| `app/(app)/projects/new/page.tsx` | Two `href="/dashboard"` → `href="/projects"` |
| `app/actions/projects.ts` | `revalidatePath("/dashboard")` → `revalidatePath("/projects")`; `redirect("/dashboard")` → `redirect("/projects")` |

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
| `frontend/app/(app)/projects/page.tsx` | Create — projects list (moved from dashboard) |
| `frontend/app/(app)/dashboard/page.tsx` | Modify — redirect to /projects |
| `frontend/app/(app)/layout.tsx` | Modify — Configurator logo → /projects; add Projects nav link |
| `frontend/app/page.tsx` | Modify — initial redirect → /projects |
| `frontend/app/not-found.tsx` | Modify — link → /projects |
| `frontend/app/error.tsx` | Modify — link → /projects |
| `frontend/app/(auth)/login/page.tsx` | Modify — redirectTo /projects |
| `frontend/app/(auth)/register/page.tsx` | Modify — redirectTo /projects |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify — breadcrumb → /projects |
| `frontend/app/(app)/projects/[id]/not-found.tsx` | Modify — link → /projects |
| `frontend/app/(app)/projects/new/page.tsx` | Modify — two links → /projects |
| `frontend/app/actions/projects.ts` | Modify — revalidatePath + redirect → /projects |
