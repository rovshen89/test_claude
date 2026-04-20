# Frontend Material Catalog UI — Design Spec (Sub-plan 5)
**Date:** 2026-04-20
**Status:** Approved

---

## Overview

Closes the ordering gap introduced in Sub-plan 4: the `POST /orders` endpoint validates `applied_config` against `AppliedConfig` (requiring `dimensions`, `panels[]`, `hardware_list[]`), but the frontend currently stores only raw dimension numbers. Sub-plan 5 adds a panel-material assignment UI to the 3D viewer sidebar and updates the `applied_config` write path so it always stores the full `AppliedConfig` structure.

---

## Goals

- `applied_config` written by the frontend always conforms to `{ dimensions, panels, hardware_list }` (the backend's `AppliedConfig` Pydantic model)
- The 3D viewer sidebar gains a **Materials** section that lets users pick a material and thickness for each panel template defined in the furniture type's schema
- Computed panel dimensions (`width_mm`, `height_mm`) update live as dimension sliders move
- All panel assignments are included in the `applied_config` when saving as draft
- `listMaterials` API helper added; material list fetched server-side in the viewer page and passed as props (JWT never leaves the server)
- "Place Order" button gated on `allPanelsAssigned` in addition to existing conditions

---

## Non-Goals (Sub-plan 5)

- Material creation / upload UI (admin concern, backend already handles it)
- Category filtering on the material picker
- Hardware item entry (deferred — `hardware_list` is always `[]` for now)
- Edge banding toggle UI (edge banding is read from the panel template in the furniture type schema and stored as-is; not user-editable in Sub-plan 5)
- `ConfigurationForm` (new config page) material assignment — user creates with empty panels; assigns in viewer
- E2E / Playwright tests
- Editing confirmed or in_production/completed configurations (blocked by backend; existing behavior unchanged)

---

## Stack

Next.js 15 App Router, NextAuth v5, Tailwind CSS, Server Components + Server Actions, Jest unit tests.

---

## Furniture Type Schema Extension

The furniture type's `schema` JSON gains an optional `panels` array. Each entry is a **panel template**:

```json
{
  "dimensions": {
    "width":  { "min": 400, "max": 2400, "step": 50, "default": 900 },
    "height": { "min": 400, "max": 2400, "step": 50, "default": 1800 },
    "depth":  { "min": 200, "max":  800, "step": 25, "default": 400 }
  },
  "panels": [
    {
      "name": "Side",
      "width_key": "depth",
      "height_key": "height",
      "quantity": 2,
      "grain_direction": "vertical",
      "edge_banding": { "left": false, "right": false, "top": true, "bottom": true }
    },
    {
      "name": "Top",
      "width_key": "width",
      "height_key": "depth",
      "quantity": 1,
      "grain_direction": "horizontal",
      "edge_banding": { "left": true, "right": true, "top": true, "bottom": true }
    }
  ],
  "labor_rate": "5.0"
}
```

`width_key` and `height_key` reference keys in `dimensions`. Panel `width_mm` and `height_mm` are computed as `dimensions[width_key]` and `dimensions[height_key]` respectively. Fields `quantity`, `grain_direction`, and `edge_banding` default to `1`, `"none"`, and all-false if absent.

No backend schema changes are required — `FurnitureType.schema` is already `Dict[str, Any]`.

---

## `applied_config` Shape Change

| Before Sub-plan 5 | After Sub-plan 5 |
|---|---|
| `{ width: 900, height: 1800, depth: 400 }` | `{ dimensions: { width: 900, height: 1800, depth: 400 }, panels: [...], hardware_list: [] }` |

**New format** is the exact JSON that `AppliedConfig.model_validate()` expects on the backend.

**Backward compatibility in viewer**: The viewer detects old-format configs by checking `!('dimensions' in applied_config)`. Old-format configs are readable (dimension values extracted from the flat object); panel assignments are initialized as all-null.

---

## Architecture

```
frontend/
  lib/
    api.ts                     ← MODIFY: Material type; EdgeBanding/PanelSpec/HardwareItem/
                                           AppliedConfig types; listMaterials;
                                           update createConfiguration/updateConfiguration signatures
  tests/
    lib/
      api.test.ts              ← MODIFY: 2 new tests for listMaterials;
                                         update createConfiguration + updateConfiguration tests
  app/
    actions/
      configurations.ts        ← MODIFY: update createConfigurationAction +
                                          updateConfigurationAction parameter types
    (app)/
      projects/
        [id]/
          configurations/
            new/
              _components/
                ConfigurationForm.tsx   ← MODIFY: submit new applied_config format (empty panels)
            [cfgId]/
              page.tsx                  ← MODIFY: fetch listMaterials, pass to ConfigurationViewer
              _components/
                ConfigurationViewer.tsx ← MODIFY: Materials section + panel assignment state
```

---

## Data Flow

### Creating a configuration (new/page → ConfigurationForm)

1. User picks furniture type + sets dimensions → clicks "Save as draft"
2. `ConfigurationForm` submits `appliedConfig = { dimensions: { ...dimValues }, panels: [], hardware_list: [] }`
3. `createConfigurationAction(projectId, furnitureTypeId, appliedConfig)` → `POST /configurations`
4. Config stored with new-format `applied_config` (empty panels)

### Assigning materials (viewer)

1. `[cfgId]/page.tsx` Server Component fetches `listMaterials(token)` in parallel with project, configuration, furniture type
2. Passes `materials: Material[]` prop to `ConfigurationViewer`
3. Viewer reads `schema.panels` panel templates; shows Materials section in sidebar
4. Each panel template row: panel name, computed `width_mm × height_mm` (from current slider values), `<select>` for material, `<select>` for thickness (populated from `material.thickness_options`)
5. On "Save as draft": builds full `AppliedConfig` from current dimension values + panel assignments → `updateConfigurationAction`

### Placing an order (unchanged from Sub-plan 4)

After the full `AppliedConfig` is saved, `POST /orders` now passes `AppliedConfig.model_validate()` and the order flow proceeds.

---

## `lib/api.ts` Additions and Changes

### New types

```ts
export type Material = {
  id: string
  tenant_id: string | null
  category: string
  name: string
  sku: string
  thickness_options: number[]
  price_per_m2: number
  edgebanding_price_per_mm: number | null
  s3_albedo: string | null
  s3_normal: string | null
  s3_roughness: string | null
  s3_ao: string | null
  grain_direction: string
}

export type EdgeBanding = {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export type PanelSpec = {
  name: string
  material_id: string
  thickness_mm: number
  width_mm: number
  height_mm: number
  quantity: number
  grain_direction: string
  edge_banding: EdgeBanding
}

export type HardwareItem = {
  name: string
  unit_price: number
  quantity: number
}

export type AppliedConfig = {
  dimensions: Record<string, number>
  panels: PanelSpec[]
  hardware_list: HardwareItem[]
}
```

### New function

```ts
export async function listMaterials(token: string): Promise<Material[]>
// GET /materials
```

### Updated signatures

```ts
export async function createConfiguration(
  token: string,
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: AppliedConfig   // was: Record<string, number>
): Promise<Configuration>

export async function updateConfiguration(
  token: string,
  configId: string,
  appliedConfig: AppliedConfig   // was: Record<string, number>
): Promise<Configuration>
```

The HTTP request body stays identical (`{ applied_config: appliedConfig }`); only the TypeScript type of the argument changes.

---

## `app/actions/configurations.ts` Changes

Update signatures to match new `lib/api.ts`:

```ts
export async function createConfigurationAction(
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: AppliedConfig   // was: Record<string, number>
): Promise<{ error: string }>

export async function updateConfigurationAction(
  configId: string,
  projectId: string,
  appliedConfig: AppliedConfig   // was: Record<string, number>
): Promise<{ error: string }>
```

Both actions add `import type { AppliedConfig } from "@/lib/api"`. Implementation logic unchanged.

---

## `ConfigurationForm.tsx` Change

When submitting, wrap dimension values in the new format:

```ts
const appliedConfig: AppliedConfig = {
  dimensions: dimensions,
  panels: [],
  hardware_list: [],
}
const result = await createConfigurationAction(projectId, selectedTypeId, appliedConfig)
```

Import `type AppliedConfig` from `@/lib/api`.

---

## `[cfgId]/page.tsx` Change

Fetch materials in parallel with existing fetches:

```ts
let materials: Material[] = []
try {
  materials = await listMaterials(token)
} catch (e) {
  if (e instanceof ApiError && e.status === 401) redirect("/login")
  // Non-critical: viewer renders without material pickers if this fails
}
```

Pass as prop to `ConfigurationViewer`:
```tsx
<ConfigurationViewer
  configuration={configuration}
  furnitureType={furnitureType}
  projectId={id}
  isReadOnly={isReadOnly}
  materials={materials}
/>
```

Import `listMaterials, type Material` from `@/lib/api`.

---

## `ConfigurationViewer.tsx` Changes

### Schema type extension

```ts
type PanelTemplate = {
  name: string
  width_key: string
  height_key: string
  quantity?: number
  grain_direction?: string
  edge_banding?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }
}
type Schema = { dimensions?: Record<string, DimensionSpec>; panels?: PanelTemplate[] }
```

### Props

Add `materials: Material[]` to the `Props` type.

### State initialization

Detect old vs new `applied_config` format:

```ts
const rawConfig = configuration.applied_config as Record<string, unknown>
const isNewFormat = 'dimensions' in rawConfig
const savedDimensions: Record<string, number> = isNewFormat
  ? (rawConfig.dimensions as Record<string, number>)
  : (rawConfig as Record<string, number>)
const savedPanels = isNewFormat && Array.isArray(rawConfig.panels)
  ? (rawConfig.panels as Array<{ material_id: string; thickness_mm: number }>)
  : []
```

New state:

```ts
type PanelAssignment = { materialId: string | null; thickness_mm: number | null }

const [panelAssignments, setPanelAssignments] = useState<PanelAssignment[]>(() =>
  panelTemplates.map((_, i) => ({
    materialId: savedPanels[i]?.material_id ?? null,
    thickness_mm: savedPanels[i]?.thickness_mm ?? null,
  }))
)
```

Where `panelTemplates = (furnitureType.schema as Schema).panels ?? []`.

### `hasUnsavedChanges` extension

```ts
const hasDimChanges = Object.keys(dimSpecs).some(k => dimensions[k] !== savedDimensions[k])

const hasPanelChanges = panelTemplates.some((_, i) => {
  const cur = panelAssignments[i]
  const sav = savedPanels[i]
  return cur?.materialId !== (sav?.material_id ?? null)
      || cur?.thickness_mm !== (sav?.thickness_mm ?? null)
})

const hasUnsavedChanges = hasDimChanges || hasPanelChanges
```

### `allPanelsAssigned`

```ts
const allPanelsAssigned =
  panelTemplates.length === 0 ||
  panelTemplates.every((_, i) => !!panelAssignments[i]?.materialId && !!panelAssignments[i]?.thickness_mm)
```

### `handleSave` update

Build the full `AppliedConfig` before calling `updateConfigurationAction`:

```ts
async function handleSave() {
  if (hasInputErrors) return
  setIsSaving(true)
  setSaveError(null)
  const appliedConfig: AppliedConfig = {
    dimensions,
    panels: panelTemplates.map((tpl, i) => {
      const a = panelAssignments[i]
      return {
        name: tpl.name,
        material_id: a?.materialId ?? "",
        thickness_mm: a?.thickness_mm ?? 0,
        width_mm: dimensions[tpl.width_key] ?? 0,
        height_mm: dimensions[tpl.height_key] ?? 0,
        quantity: tpl.quantity ?? 1,
        grain_direction: tpl.grain_direction ?? "none",
        edge_banding: {
          left:   tpl.edge_banding?.left   ?? false,
          right:  tpl.edge_banding?.right  ?? false,
          top:    tpl.edge_banding?.top    ?? false,
          bottom: tpl.edge_banding?.bottom ?? false,
        },
      }
    }),
    hardware_list: [],
  }
  const result = await updateConfigurationAction(configuration.id, projectId, appliedConfig)
  if (result?.error) {
    setSaveError(result.error)
    setIsSaving(false)
  }
}
```

### Materials section JSX

Inserted in the sidebar between the Dimensions section and the first `<hr>`:

```tsx
{panelTemplates.length > 0 && (
  <>
    <hr className="border-slate-800" />
    <p className="text-xs uppercase tracking-widest text-slate-500">Materials</p>
    {panelTemplates.map((tpl, i) => {
      const widthMm = dimensions[tpl.width_key] ?? 0
      const heightMm = dimensions[tpl.height_key] ?? 0
      const assignment = panelAssignments[i]
      const selectedMaterial = materials.find(m => m.id === assignment?.materialId)

      return (
        <div key={tpl.name} className="mb-1">
          <span className="block text-xs text-slate-400 mb-1">
            {tpl.name}
            {tpl.quantity && tpl.quantity > 1 ? ` ×${tpl.quantity}` : ""}{" "}
            <span className="text-slate-600">{widthMm} × {heightMm} mm</span>
          </span>
          <select
            value={assignment?.materialId ?? ""}
            disabled={isReadOnly}
            onChange={e => {
              const matId = e.target.value || null
              setPanelAssignments(prev =>
                prev.map((a, idx) => idx === i ? { ...a, materialId: matId, thickness_mm: null } : a)
              )
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed mb-1"
          >
            <option value="">— select material —</option>
            {materials.map(mat => (
              <option key={mat.id} value={mat.id}>{mat.name} ({mat.sku})</option>
            ))}
          </select>
          {selectedMaterial && (
            <select
              value={assignment?.thickness_mm ?? ""}
              disabled={isReadOnly}
              onChange={e => {
                const t = e.target.value ? Number(e.target.value) : null
                setPanelAssignments(prev =>
                  prev.map((a, idx) => idx === i ? { ...a, thickness_mm: t } : a)
                )
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">— select thickness —</option>
              {selectedMaterial.thickness_options.map(t => (
                <option key={t} value={t}>{t} mm</option>
              ))}
            </select>
          )}
        </div>
      )
    })}
  </>
)}
```

### "Place Order" condition update

```tsx
{!isReadOnly && configuration.status === "confirmed" && !hasUnsavedChanges && allPanelsAssigned && (
  // ... Place Order button (unchanged)
)}
```

### Imports to add

```ts
import type { AppliedConfig, Material } from "@/lib/api"
```

---

## User Flow

| Step | Action |
|---|---|
| 1 | Create config from new page → `applied_config = { dimensions: {...}, panels: [], hardware_list: [] }` saved |
| 2 | Open in viewer → Materials section shows panel templates; assignments are empty |
| 3 | Assign material + thickness per panel |
| 4 | Click "Save as draft" → full `AppliedConfig` with panels saved |
| 5 | Confirm from project page |
| 6 | Open in viewer (confirmed) → "Place Order" visible (all panels assigned, no unsaved changes) |
| 7 | Click "Place Order" → order created successfully |

**Note**: Materials must be assigned before confirming. A confirmed config cannot be updated (backend returns 400). If a user confirms before assigning materials, they must: open the viewer, observe "Place Order" is hidden (materials unassigned), and re-confirm is unavailable without first setting the config back to draft. This limitation is pre-existing in Sub-plan 3/4 and is not addressed in Sub-plan 5.

---

## Error Handling

| Scenario | Handling |
|---|---|
| `listMaterials` fails on viewer page | Silently caught; `materials = []`; Materials section renders with empty dropdown |
| `listMaterials` 401 on viewer page | `redirect("/login")` |
| `updateConfigurationAction` with unassigned panel | `material_id: ""` sent → backend 422 if ordering, but saving a draft with empty material_id is accepted by backend (it's just JSON storage) |
| "Place Order" with unassigned panel | Button hidden — `allPanelsAssigned` is false |
| Existing old-format config in viewer | Panels section shows templates with unassigned dropdowns; dimension sliders work normally |

---

## Testing

Jest unit tests in `frontend/tests/lib/api.test.ts`:

**New tests (2):**
- `listMaterials` — correct `GET /materials` URL + Authorization header, returns `Material[]`
- `listMaterials` — non-ok response throws `ApiError`

**Updated tests (4):**
- `createConfiguration` success — `applied_config` body uses `AppliedConfig` shape `{ dimensions: {...}, panels: [], hardware_list: [] }`
- `createConfiguration` error — unchanged assertion
- `updateConfiguration` success — `applied_config` body uses `AppliedConfig` shape
- `updateConfiguration` error — unchanged assertion

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `Material`, `EdgeBanding`, `PanelSpec`, `HardwareItem`, `AppliedConfig` types; add `listMaterials`; update `createConfiguration`/`updateConfiguration` signatures |
| `frontend/tests/lib/api.test.ts` | Modify | 2 new tests for `listMaterials`; update `createConfiguration` + `updateConfiguration` tests |
| `frontend/app/actions/configurations.ts` | Modify | Update `createConfigurationAction` + `updateConfigurationAction` parameter types |
| `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` | Modify | Submit new `AppliedConfig` format (empty panels) on create |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx` | Modify | Fetch `listMaterials`, pass `materials` prop to `ConfigurationViewer` |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Modify | Materials section, `PanelAssignment` state, extended `hasUnsavedChanges`, updated `handleSave`, `allPanelsAssigned` gate |
