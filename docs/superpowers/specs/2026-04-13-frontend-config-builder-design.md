# Frontend Configuration Builder — Design Spec (Plan 5, Sub-plan 2)
**Date:** 2026-04-13
**Status:** Approved

---

## Overview

Adds the configuration builder to the existing Next.js 15 App Router frontend. Sub-plan 2 covers the creation flow only: selecting a furniture type, filling in dimension fields rendered from the furniture type's JSON schema, saving as a draft, and confirming a draft from the project detail page. The 3D Babylon.js viewer is deferred to Sub-plan 3. Editing existing configurations is deferred to Sub-plan 3 (the 3D viewer will be the editing surface).

---

## Goals

- Users can create a new configuration for a project by selecting a furniture type and setting dimension values
- Dimension inputs are rendered dynamically from the selected furniture type's `schema.dimensions` (min/max/step/default)
- Users can confirm a draft configuration directly from the project detail page
- The JWT token never leaves the server — all backend calls go through Server Actions

---

## Non-Goals (Sub-plan 2)

- 3D Babylon.js viewer (Sub-plan 3)
- Editing existing configurations (Sub-plan 3)
- Configuration deletion
- E2E / Playwright tests (Sub-plan 3)
- `placement` field editing (Sub-plan 3 — tied to 3D positioning)
- OAuth providers

---

## Stack

Same as Sub-plan 1: Next.js 15 App Router, NextAuth v5, plain Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Architecture

```
frontend/
  app/
    actions/
      configurations.ts          ← Server Actions for mutations
    (app)/
      projects/
        [id]/
          page.tsx               ← MODIFY: activate New Config link, add ConfirmButton to draft cards
          _components/
            ConfirmButton.tsx    ← NEW: Client Component — calls confirmConfigurationAction
        [id]/configurations/
          new/
            page.tsx             ← NEW: Server Component — fetches furniture types, renders form
            _components/
              ConfigurationForm.tsx ← NEW: Client Component — type selector + dimension inputs
  lib/
    api.ts                       ← MODIFY: add getFurnitureTypes, createConfiguration, confirmConfiguration
  tests/
    lib/
      api.test.ts                ← MODIFY: add tests for the three new helpers
```

Route groups `_components` directories co-locate Client Components with their parent routes. The `app/actions/` directory holds all `"use server"` mutation files — Client Components cannot call inline Server Actions so a separate file is required.

---

## Data Flow

### Creating a configuration

1. User clicks "+ New Configuration" on `/projects/[id]` → navigates to `/projects/[id]/configurations/new`
2. Server Component calls `auth()` and `getFurnitureTypes(token)` in parallel
3. If no session → `redirect("/login")`; if no furniture types → renders empty-state message
4. Server Component passes `furnitureTypes: FurnitureType[]` and `projectId: string` as props to `<ConfigurationForm>`
5. User selects a furniture type → form resets dimension fields to `schema.dimensions[key].default` values
6. Dimension inputs rendered from `schema.dimensions` — each key becomes a labeled `<input type="number">` with `min`, `max`, `step` from the schema
7. Client-side validation before submit: each value must satisfy `min ≤ value ≤ max`
8. On submit: `ConfigurationForm` calls `createConfigurationAction(projectId, furnitureTypeId, appliedConfig)`
9. Server Action: `auth()` → `POST /configurations` with `{ project_id, furniture_type_id, applied_config }` → on success `redirect("/projects/{projectId}")`

### Confirming a configuration

1. `/projects/[id]` page renders `<ConfirmButton configId={id} projectId={projectId} />` on each draft card
2. User clicks "Confirm" → `ConfirmButton` calls `confirmConfigurationAction(configId, projectId)`
3. Server Action: `auth()` → `POST /configurations/{configId}/confirm` → `revalidatePath("/projects/{projectId}")` → page re-renders with updated status badge
4. On 409 (already confirmed): Server Action returns `{ error: "already_confirmed" }` → button shows "Already confirmed" state
5. On 401: Server Action redirects to `/login`

---

## Pages

### `/projects/[id]/configurations/new`

Server Component. Fetches `auth()`, `getProject(token, id)`, and `getFurnitureTypes(token)` — project + types in parallel after auth check. If project returns 404 → `notFound()` (uses the existing `projects/[id]/not-found.tsx`). If the type list is empty, renders "No furniture types available." instead of the form. Passes `furnitureTypes` and `projectId` to `<ConfigurationForm>`.

### `<ConfigurationForm>` (Client Component)

Receives `furnitureTypes: FurnitureType[]` and `projectId: string`. Owns:
- `selectedTypeId: string | null` state — initialised to first type's id
- `dimensions: Record<string, number>` state — reset to schema defaults on type change

Renders:
- Furniture type selector: pill buttons, one per type, active pill is indigo-filled
- Divider
- Dimension fields grid: one `<input type="number">` per key in `schema.dimensions`, with constraint hint text below (`min – max, step N`)
- Inline validation errors per field (shown on blur or submit attempt)
- "Save as draft" submit button + "Cancel" link back to `/projects/[id]`

On submit calls `createConfigurationAction`. On error response shows a banner above the buttons.

### `/projects/[id]` (modified)

- "+ New Configuration" link becomes active: `<Link href={/projects/${id}/configurations/new}>`
- Each draft configuration card gains `<ConfirmButton configId={cfg.id} projectId={id} />`
- Confirmed/in_production/completed cards show no confirm button

### `<ConfirmButton>` (Client Component)

Renders a small "Confirm" button. On click: calls Server Action, enters loading state (button disabled + "Confirming…" text). On success: revalidation causes the parent Server Component to re-render with the updated status. On error: shows inline "Failed" text next to the button.

---

## `app/actions/configurations.ts`

```ts
"use server"

export async function createConfigurationAction(
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: Record<string, number>
): Promise<{ error: string } | null>

export async function confirmConfigurationAction(
  configId: string,
  projectId: string
): Promise<{ error: string } | null>
```

Both actions call `auth()` internally. On 401 they redirect to `/login`. On other `ApiError` they return `{ error: message }`. On success `createConfigurationAction` calls `redirect()` and `confirmConfigurationAction` calls `revalidatePath()`.

---

## `lib/api.ts` additions

```ts
export async function getFurnitureTypes(token: string): Promise<FurnitureType[]>
export async function createConfiguration(
  token: string,
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: Record<string, number>
): Promise<Configuration>
export async function confirmConfiguration(token: string, configId: string): Promise<Configuration>
```

`createConfiguration` sends `POST /configurations` with body `{ project_id: projectId, furniture_type_id: furnitureTypeId, applied_config: appliedConfig }`.

`confirmConfiguration` sends `POST /configurations/{configId}/confirm` with no body.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| No furniture types | "No furniture types available." in place of form |
| No type selected on submit | "Please select a furniture type." above type buttons |
| Dimension out of range | Inline error under the field (client-side, before submit) |
| `createConfiguration` 401 | Server Action redirects to `/login` |
| `createConfiguration` other error | Server Action returns `{ error }` → form shows error banner |
| `confirmConfiguration` 409 | Server Action returns `{ error: "already_confirmed" }` → button shows state |
| `confirmConfiguration` 401 | Server Action redirects to `/login` |
| Network / 5xx | Re-thrown → `error.tsx` boundary |

---

## Testing

Jest unit tests appended to `frontend/tests/lib/api.test.ts`:

- `getFurnitureTypes` — correct `GET /furniture-types` URL + `Authorization` header, returns typed array
- `createConfiguration` — correct `POST /configurations` URL + body (`project_id`, `furniture_type_id`, `applied_config`), returns `Configuration`
- `confirmConfiguration` — correct `POST /configurations/{id}/confirm` URL, returns `Configuration`
- `confirmConfiguration` — 409 response throws `ApiError(409)`

No E2E tests in Sub-plan 2. Playwright introduced in Sub-plan 3.

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/app/actions/configurations.ts` | Create | Server Actions: createConfigurationAction, confirmConfigurationAction |
| `frontend/app/(app)/projects/[id]/configurations/new/page.tsx` | Create | Server Component shell for creation flow |
| `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` | Create | Client Component: type selector + dimension form |
| `frontend/app/(app)/projects/[id]/_components/ConfirmButton.tsx` | Create | Client Component: confirm draft button |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify | Activate New Config link, add ConfirmButton to draft cards |
| `frontend/lib/api.ts` | Modify | Add getFurnitureTypes, createConfiguration, confirmConfiguration |
| `frontend/tests/lib/api.test.ts` | Modify | Add 4 tests for the three new helpers |
