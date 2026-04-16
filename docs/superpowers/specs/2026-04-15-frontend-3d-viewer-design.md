# Frontend 3D Configuration Viewer — Design Spec (Sub-plan 3)
**Date:** 2026-04-15
**Status:** Approved

---

## Overview

Adds a per-configuration 3D viewer and dimension editor to the existing Next.js 15 App Router frontend. Users navigate to `/projects/[id]/configurations/[cfgId]` from non-draft configuration cards. The page renders a Babylon.js WebGL scene showing the furniture piece built from the configuration's `applied_config` dimensions. Confirmed configurations are editable — sliders and number inputs update the mesh in real time and save back as a draft via a Server Action. In-production and completed configurations are view-only (inputs disabled, orbit/zoom still active).

---

## Goals

- Render a live Babylon.js 3D mesh from `applied_config` dimensions
- Dimension controls (continuous slider + free-form number input per key) update the mesh in real time
- Saving edited dimensions calls `PUT /configurations/{id}`, resets status to draft
- `in_production` and `completed` configurations open as read-only viewers
- JWT token never reaches the browser — data fetching via Server Components, mutations via Server Actions

---

## Non-Goals (Sub-plan 3)

- PBR textures from material catalog (plain PBR colour only)
- Room placement / `placement` field editing
- Zustand state management (deferred to room planner sub-plan)
- E2E / Playwright tests
- Panel-by-panel BOM geometry (simple bounding-box cabinet mesh only)

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Babylon.js (CDN / npm), Server Components + Server Actions, Jest unit tests.

---

## Architecture

```
frontend/
  app/
    actions/
      configurations.ts          ← MODIFY: add updateConfigurationAction
    (app)/
      projects/
        [id]/
          page.tsx               ← MODIFY: add "View in 3D" link to confirmed/in_production/completed cards
          configurations/
            [cfgId]/
              page.tsx           ← NEW: Server Component — auth + parallel data fetch
              _components/
                ConfigurationViewer.tsx  ← NEW: Client Component — sidebar controls + dynamic scene import
                BabylonScene.tsx         ← NEW: Client Component (ssr:false dynamic import target)
  lib/
    api.ts                       ← MODIFY: add updateConfiguration, getConfiguration
  tests/
    lib/
      api.test.ts                ← MODIFY: add tests for updateConfiguration, getConfiguration
```

Also: `ConfigurationForm.tsx` (Sub-plan 2) — remove step validation, keep only min/max enforcement, consistent with the editor.

---

## Status Matrix

| Status | Project card | Viewer page | Editable |
|---|---|---|---|
| `draft` | Confirm button only | No link | — |
| `confirmed` | "View in 3D" link | ✅ | ✅ (save resets to draft) |
| `in_production` | "View in 3D" link | ✅ | read-only |
| `completed` | "View in 3D" link | ✅ | read-only |

---

## Data Flow

### Loading the viewer

1. User clicks "View in 3D" on a confirmed/in_production/completed card → navigates to `/projects/[id]/configurations/[cfgId]`
2. Server Component calls `auth()`, then fetches `getProject(token, id)` + `getConfiguration(token, cfgId)` + `getFurnitureType(token, furnitureTypeId)` in parallel
3. On 401 → `redirect("/login")`, on 404 → `notFound()`, on `status === "draft"` → `redirect("/projects/${id}")` (drafts have no viewer)
4. Passes `configuration`, `furnitureType`, `projectId`, and derived `isReadOnly` flag as props to `<ConfigurationViewer>`
5. `ConfigurationViewer` renders sidebar controls + dynamically imports `<BabylonScene ssr:false>` — canvas only mounts client-side

### Editing and saving

1. User adjusts slider or number input → `ConfigurationViewer` local state updates → passed as prop `dimensions` to `<BabylonScene>` → mesh rebuilds in real time
2. User clicks "Save as draft" → calls `updateConfigurationAction(cfgId, projectId, dimensions)`
3. Server Action: `auth()` → `PUT /configurations/{cfgId}` with body `{ applied_config: dimensions }` → on success `revalidatePath("/projects/${projectId}")` + `redirect("/projects/${projectId}")`
4. Backend resets status to `draft` on any PUT — user re-confirms from the project detail page

### Read-only

Same page and data flow. `ConfigurationViewer` receives `isReadOnly={true}` — all inputs disabled, Save/Reset buttons hidden. Orbit, pan, and zoom remain active.

---

## Pages

### `/projects/[id]/configurations/[cfgId]` (Server Component)

Awaits `params` for `id` and `cfgId`. Calls `auth()`, redirects if no token. Fetches project, configuration, and furniture type in parallel. Guards:
- 401 → redirect `/login`
- 404 on project or config → `notFound()`
- `configuration.status === "draft"` → redirect to `/projects/${id}`

Passes to `<ConfigurationViewer>`:
- `configuration: Configuration`
- `furnitureType: FurnitureType`
- `projectId: string`
- `isReadOnly: boolean` (`status === "in_production" || status === "completed"`)

### `<ConfigurationViewer>` (Client Component)

Owns dimension state: `Record<string, number>` initialised from `configuration.applied_config`. Renders:
- Header breadcrumb back to `/projects/${projectId}`
- Sidebar: one slider + one number input per key in `schema.dimensions`, each with min/max hint and inline error on invalid value
- If `isReadOnly`: all inputs disabled, Save/Reset hidden, locked status notice shown
- If `!isReadOnly` and has unsaved changes: "Unsaved changes" banner, "Editing confirmed config → saves as draft" notice
- `<BabylonSceneDynamic dimensions={dimensions} schema={furnitureType.schema} />` filling the remaining space

On Save: calls `updateConfigurationAction`. On error: banner above buttons. On success: Server Action redirects to project page.

### `<BabylonScene>` (Client Component, ssr:false)

Receives `dimensions: Record<string, number>` and `schema: Record<string, unknown>` as props.

**Mount (once):**
- Creates `Engine` + `Scene` on a `<canvas>` ref
- `ArcRotateCamera` with orbit/pan/zoom attached to canvas
- `HemisphericLight` + `DirectionalLight` + `ShadowGenerator` (blur exponential)
- Ground plane for shadow reception
- `engine.runRenderLoop(() => scene.render())`
- `window.addEventListener("resize", () => engine.resize())`
- Returns cleanup on unmount: `engine.dispose()`

**On dimension change (`useEffect` on dimensions):**
- Disposes all existing furniture meshes
- Reads `width`, `height`, `depth` (or whatever keys exist) from `dimensions`, falls back to `schema.dimensions[key].default`
- Builds panel mesh: left/right sides, top/bottom panels, back panel, one shelf if height allows
- `PBRMaterial` with warm oak albedo colour (no textures in this sub-plan)
- Re-centres `camera.target` to new bounding box midpoint

**WebGL fallback:** if `Engine` constructor throws, renders `<p>3D preview not supported in this browser.</p>` in place of the canvas.

---

## `lib/api.ts` Additions

```ts
export async function getConfiguration(token: string, configId: string): Promise<Configuration>
// GET /configurations/{configId}

export async function updateConfiguration(
  token: string,
  configId: string,
  appliedConfig: Record<string, number>
): Promise<Configuration>
// PUT /configurations/{configId} with body { applied_config: appliedConfig }
```

---

## `app/actions/configurations.ts` Addition

```ts
export async function updateConfigurationAction(
  configId: string,
  projectId: string,
  appliedConfig: Record<string, number>
): Promise<{ error: string }> {
  // auth() → PUT /configurations/{configId} → redirect("/projects/${projectId}")
  // 401 → redirect("/login")
  // other ApiError → return { error: message }
}
```

Return type is `Promise<{ error: string }>` (no `| null`) — success path always redirects.

---

## `projects/[id]/page.tsx` Changes

- `confirmed`, `in_production`, `completed` cards gain `<Link href={/projects/${id}/configurations/${cfg.id}}>View in 3D</Link>`
- `draft` cards unchanged (Confirm button only, no viewer link)

---

## `ConfigurationForm.tsx` Fix

Remove step validation from `validate()`. Only enforce `val < spec.min || val > spec.max`. Step field in `schema.dimensions` is retained in the data model but ignored by all UI controls.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Config status is `draft` | Server Component redirects to `/projects/[id]` |
| Config not found (404) | `notFound()` — existing `not-found.tsx` |
| 401 on any server fetch | Redirect to `/login` |
| `updateConfigurationAction` 401 | Redirect to `/login` |
| `updateConfigurationAction` other error | Returns `{ error }` → error banner above Save button |
| Dimension out of min/max | Client-side — input goes red, mesh not updated, Save blocked |
| Network / 5xx | Re-thrown → `error.tsx` boundary |
| WebGL not supported | Inline fallback text in place of canvas |

---

## Testing

Jest unit tests in `frontend/tests/lib/api.test.ts`:

- `getConfiguration` — correct `GET /configurations/{id}` URL + Authorization header, returns `Configuration`
- `getConfiguration` — non-ok response throws `ApiError`
- `updateConfiguration` — correct `PUT /configurations/{id}` URL + body `{ applied_config }` + Authorization header, returns `Configuration`
- `updateConfiguration` — non-ok response throws `ApiError`

No E2E tests in this sub-plan.

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `getConfiguration`, `updateConfiguration` |
| `frontend/tests/lib/api.test.ts` | Modify | Add 4 tests for the two new helpers |
| `frontend/app/actions/configurations.ts` | Modify | Add `updateConfigurationAction` |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify | Add "View in 3D" link to non-draft cards |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx` | Create | Server Component shell |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Create | Client Component — controls + dynamic scene |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/BabylonScene.tsx` | Create | Client Component — Babylon.js WebGL canvas |
| `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` | Modify | Remove step validation |
