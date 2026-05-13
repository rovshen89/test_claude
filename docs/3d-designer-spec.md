# 3D Designer Experience — Full Implementation Spec
## Based on Flatma reference (flatma.com/en/create/designer)

---

## Overview

The goal is to replace the current single-furniture configurator with a full room-level 3D design studio where users can:
- Set up a room with dimensions and surface materials
- Drag pre-built furniture from a categorised library into the scene
- Move, resize, copy, and rotate objects freely
- Assign materials per component type (Panel / Facade / Backboard)
- Switch between 3D perspective and 2D top-down floor plan views
- Generate a visual cutting layout per material sheet
- Download drawings

The existing backend (pricing, BOM, orders, DXF/PDF export) stays intact. The 3D designer becomes the new front-end that feeds data into that pipeline.

---

## Architecture Changes Required

### Current architecture
```
Project → Configuration (one furniture type, one config) → 3D viewer → BOM/Pricing → Order
```

### Target architecture
```
Project → Room Scene (multiple furniture objects) → BOM/Pricing aggregated → Order
```

Key model changes:
- A **scene** belongs to a project and holds N placed objects
- Each **placed object** references a furniture type, has a position (x, y, z), rotation, dimensions, and material assignments
- Materials split into three slots per object: `panel_material_id`, `facade_material_id`, `backboard_material_id`
- The existing `configurations` table can be extended or replaced with a `scene_objects` table

---

## Feature Areas

---

### 1. Room Setup

**What Flatma does:**
- Clicking the gear icon next to "Room" opens a modal
- Inputs: Length (W mm), Width (D mm), Height (H mm) — defaults 5000 × 3000 × 2700
- Walls: 5 preset colour swatches + custom eyedropper picker
- Floor: 5 preset texture/colour swatches + custom eyedropper picker
- "Create room" and "Delete" buttons
- Room is shown as a 3D box (floor + 3 visible walls) in the scene
- Toggle switch next to Room shows/hides the room shell

**What exists now:**
- Project has a `room_schema` JSON field (width, height, depth)
- No wall/floor colour support
- Room is not rendered in the 3D scene

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Room modal UI | `BabylonScene.tsx` (new `RoomSetupModal.tsx`) | W/D/H inputs, wall colour picker (5 swatches + hex input), floor texture picker (5 swatches + upload) |
| Room 3D mesh | `BabylonScene.tsx` | Render floor plane + back wall + left wall as thin boxes using Babylon.js; apply colour/texture as PBR albedo |
| Room toggle | `ConfigurationViewer.tsx` | Show/hide room meshes via visibility flag |
| Persist room settings | `backend/app/models/project.py` | Extend `room_schema` JSON to include `wall_color`, `floor_color` fields |
| Room API | `backend/app/api/projects.py` | Already exists (`PUT /projects/:id/room-schema`), just extend schema |

**Estimate:** 3 days

---

### 2. Furniture Library (Left Panel)

**What Flatma does:**
- Left panel has two tabs: **Library** and **Elements**
- Library top-level items: Room, Vertical, Horizontal, Freeform, then categories: Kitchens, Cabinets, Dressers & Stands, Tables, Wardrobes, Beds, Home Equipment, Details, Other, Community
- Clicking a category shows a 2×N thumbnail grid of pre-built models
- Each thumbnail shows a 3D rendered preview image
- Tooltip on hover: "Drag the element"
- Drag from library → drops into the 3D scene at the cursor position

**What exists now:**
- Furniture types are listed in a dropdown when creating a configuration
- No thumbnails, no drag-and-drop, no categories beyond what the admin created

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Library panel component | `_components/LibraryPanel.tsx` (new) | Left sidebar with collapsible category sections, 2-col thumbnail grid |
| Thumbnail generation | `backend/app/api/furniture_types.py` | Add a `/furniture-types/:id/thumbnail` endpoint that renders a server-side preview PNG (or store a manually uploaded thumbnail per furniture type) |
| Thumbnail upload | `frontend/app/(app)/furniture-types/` | Admin UI: upload a cover image when creating/editing a furniture type |
| Drag-and-drop | `BabylonScene.tsx` | On dragstart from library item, begin a "ghost" mesh following the cursor; on drop over the canvas, call `addObjectToScene()` at the computed 3D position |
| Scene state management | new `useSceneStore.ts` (Zustand or useReducer) | Central store for all placed objects: `{ id, furnitureTypeId, position, rotation, dimensions, materials }[]` |
| Primitive panels (Vertical/Horizontal) | `BabylonScene.tsx` | Vertical = a single upright rectangular panel; Horizontal = a single horizontal shelf panel — these are freeform building blocks |

**Estimate:** 8 days

---

### 3. Multi-Object 3D Scene

**What Flatma does:**
- Multiple furniture pieces coexist in the same 3D canvas
- Each object sits on the floor (y = 0)
- Click an object to select it — blue bounding box with 8 corner handles + edge midpoint handles appears
- Selected object shows dimension annotations (dashed lines with mm labels)
- Drag selected object to reposition it on the floor plane
- Camera: ArcRotate orbit/pan/zoom (same as current)
- Objects cast and receive shadows

**What exists now:**
- Single object rendered, no selection, no multi-object support

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Multi-object scene graph | `BabylonScene.tsx` | Replace single-object render with a scene graph; each placed object gets its own mesh group with a unique ID |
| Click-to-select | `BabylonScene.tsx` | Add `scene.onPointerObservable` to detect mesh picks; highlight selected mesh group with blue outline (Babylon highlight layer) |
| Drag to move | `BabylonScene.tsx` | On pointerdown on selected object, cast a ray onto the floor plane and move the object's root position to the intersection point as pointer moves |
| Bounding box handles | `BabylonScene.tsx` | Render 8 corner spheres + edge midpoint spheres on selected object; dragging a corner handle resizes the object |
| Dimension annotations | `BabylonScene.tsx` | On select, create Babylon GUI labels at face midpoints showing W/H/D in mm |
| Floor snapping | `BabylonScene.tsx` | Snap object y-position to floor (y = 0) during drag |
| Scene serialisation | `useSceneStore.ts` | Persist scene JSON to backend via `PUT /projects/:id/scene` |

**Estimate:** 12 days

---

### 4. Object Parameters Panel (Right Panel)

**What Flatma does:**
- When an object is selected, right panel shows **Parameters** tab:
  - Delete button
  - Create a Copy button
  - Ungroup button (splits grouped models into individual panels)
  - W (mm), H (mm), D (mm) — editable inputs that resize the selected object live
  - Complex rotation (beta) toggle
- Unit selector: `mm` dropdown (top right of panel)

**What exists now:**
- Dimension sliders in a separate side panel (not inline with selection)
- No copy, no ungroup, no rotation

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Parameters panel | `_components/ParametersPanel.tsx` (new) | Shows when object selected; W/H/D number inputs that update scene mesh live |
| Live resize | `BabylonScene.tsx` | When W/H/D change, dispose and rebuild the object's meshes immediately |
| Delete selected | `ParametersPanel.tsx` + `useSceneStore.ts` | Remove object from store and dispose its meshes |
| Copy selected | `ParametersPanel.tsx` + `useSceneStore.ts` | Clone object data with a new ID and offset position by 100mm |
| Rotation input | `ParametersPanel.tsx` | Y-axis rotation input in degrees (0–360); map to Babylon mesh rotation.y |
| Unit selector | Layout header | Dropdown: mm / cm / inches; scale all displayed values |

**Estimate:** 5 days

---

### 5. Materials Panel (Right Panel)

**What Flatma does:**
- **Materials** tab on right panel (when object selected):
  - Three sections: **Panel**, **Facade**, **Backboard**
  - Each section shows: colour swatch thumbnail + full material name + board spec (e.g. `U780_9 — Laminated Particle Board (LDSB) 16x1830x2750`)
  - Clicking a swatch opens a material picker (not explored fully but likely a searchable grid)
- Materials have codes (U780_9, H1334_9, W1000_9) suggesting a catalogue system
- The 3D model applies the material texture visually — wood grain visible on panel surfaces

**What exists now:**
- Single material dropdown per panel (per furniture schema definition)
- No texture shown in 3D — flat albedo colour only
- No Panel/Facade/Backboard split

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Three-slot material model | `backend/app/models/` | Add `panel_material_id`, `facade_material_id`, `backboard_material_id` fields to placed objects |
| Material catalogue codes | `backend/app/models/material.py` | Add `code` field (e.g. `U780_9`) and `board_spec` field (e.g. `16x1830x2750`) to Material model + migration |
| Material picker modal | `_components/MaterialPickerModal.tsx` (new) | Grid of material swatches with search; grouped by type (Panel boards, Facade boards, DVP/backboards) |
| Texture upload + storage | `backend/app/api/materials.py` | Already has image upload to MinIO; ensure texture URL is returned in API response |
| Apply textures in 3D | `BabylonScene.tsx` | Load texture PNG from material's S3 URL into `PBRMaterial.albedoTexture`; set UV scale based on board dimensions |
| Panel vs Facade vs Backboard mapping | `BabylonScene.tsx` | Map material slots to mesh groups: carcass panels use `panel_material`, door meshes use `facade_material`, back panel uses `backboard_material` |
| Material swatch preview | `_components/MaterialsPanel.tsx` (new) | Show the three slots with thumbnail, name, code; click to open picker |

**Estimate:** 8 days

---

### 6. Elements Tab (Scene Hierarchy)

**What Flatma does:**
- **Elements** tab on left panel shows a flat list of all objects in the scene
- Each entry is a "Group" (one per placed furniture piece)
- Clicking an entry selects that object in the 3D view
- (Implied: lock, hide, highlight per element)

**What exists now:**
- No scene hierarchy panel

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Elements panel | `_components/ElementsPanel.tsx` (new) | List of placed objects; click to select; icon buttons for hide (eye), lock (padlock) |
| Sync selection | `useSceneStore.ts` | `selectedObjectId` state; selecting from list highlights in 3D and vice versa |
| Hide/show object | `BabylonScene.tsx` | Toggle `mesh.isVisible` for the object's mesh group |

**Estimate:** 3 days

---

### 7. Viewport Tools (Right Toolbar)

**What Flatma does (vertical icon strip, right of canvas):**

| Icon | Function |
|------|----------|
| Pen/arrow | Select tool (default) |
| Half-circle | Transparency mode — makes object semi-transparent to see inside |
| Wireframe | Wireframe rendering mode |
| Lighting/PBR | Toggle PBR lighting |
| 3D filled | 3D perspective view (default) |
| 3D flat | Orthographic 3D view |
| X button | Front/side elevation view |
| Y button | Top-down plan view |
| Z button | Side elevation view |

**What exists now:**
- Orbit-only camera, no view presets, no display mode toggles

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| View preset buttons | `_components/ViewportToolbar.tsx` (new) | Icon buttons for 3D / Top / Front / Side; switch `ArcRotateCamera` alpha/beta/radius presets on click |
| Orthographic mode | `BabylonScene.tsx` | Switch camera between perspective and orthographic projection |
| Transparency mode | `BabylonScene.tsx` | Set `material.alpha = 0.4` on all meshes; toggle back on deactivate |
| Wireframe mode | `BabylonScene.tsx` | Set `material.wireframe = true` on all meshes |
| PBR lighting toggle | `BabylonScene.tsx` | Toggle between `PBRMaterial` and `StandardMaterial` for all meshes |

**Estimate:** 4 days

---

### 8. 2D Floor Plan / Drawings Mode

**What Flatma does:**
- Top-right "Drawings" toggle switches the entire canvas to a 2D top-down grid view
- Objects appear as grey filled rectangles with blue selection outline
- Grid: light grey cells with mm dimension markers on left and top edges
- Selected object: blue corner + edge handles for resizing, rotation handle
- Dimension annotations shown as dashed lines with mm labels
- Camera is orthographic top-down (Y axis view)

**What exists now:**
- No 2D mode at all

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| 2D mode toggle | `_components/ViewportToolbar.tsx` | Button to enter/exit top-down orthographic view |
| Grid overlay | `BabylonScene.tsx` | Render a fine grid using Babylon `GridMaterial` or `MeshBuilder.CreateLines` when in 2D mode |
| Dimension ruler | `BabylonScene.tsx` | Babylon GUI text labels along top and left edges showing mm positions |
| 2D object footprints | `BabylonScene.tsx` | When in 2D mode, render objects as flat filled rectangles (hide vertical geometry) |
| Resize handles in 2D | `BabylonScene.tsx` | Corner and edge drag handles that resize the object footprint |

**Estimate:** 6 days

---

### 9. Cutting Layout / Drawings Modal

**What Flatma does:**
- "Drawings" button top-right opens `Cutting Settings` modal
- Shows per material sheet:
  - Fixtures count: Euro Screw Holes (26 pcs), Hinge Holes (10 pcs)
  - Material name + spec (e.g. `Laminated Particle Board (LDSB) 16x1830x2750 (U780_9)`)
  - Cutting length (25.29 m), Edge length (15.21 m)
  - Material utilisation: 74.98% (3.773 m²)
  - Visual 2D nesting diagram: numbered rectangles packed onto full-sheet outlines; waste areas cross-hatched
  - Click a panel in the diagram to rotate it (optimise nesting)
  - Option: "Panel dimensions without edge deduction" (beta checkbox)
- Footer: "Materials — 4 pcs" count + **Download Drawings** button

**What exists now:**
- BOM cut list exists as a table (panel name, dimensions, quantity, area)
- No visual nesting diagram
- No fixture counts
- No download

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Visual nesting engine | `backend/app/core/nesting.py` (new) | 2D bin-packing algorithm (guillotine cut or maxrects) that places panels onto standard sheet sizes; returns panel positions as JSON |
| Nesting API | `backend/app/api/configurations.py` | `GET /configurations/:id/nesting` — returns sheet assignments with panel x/y/w/h on each sheet |
| Cutting modal UI | `_components/CuttingModal.tsx` (new) | Per-sheet: fixture counts, cutting/edge lengths, utilisation %, SVG nesting diagram; rotate panel on click |
| SVG nesting diagram | `_components/NestingDiagram.tsx` (new) | Render sheet as SVG rect, panels as numbered SVG rects, waste as cross-hatch pattern |
| Download drawings | `backend/app/api/` | Extend DXF export to include nesting sheets; or generate a PDF with all sheets |
| Fixture counting | `backend/app/core/bom.py` | Count hinge holes and euro screw holes from hardware_rules in furniture schema |
| Material sheet config | `backend/app/models/material.py` | Add `sheet_width_mm`, `sheet_height_mm` to Material model (e.g. 1830×2750) — already partially present as `board_spec` |

**Estimate:** 10 days

---

### 10. Undo / Redo

**What Flatma does:**
- Standard undo/redo buttons in top bar (arrow icons)
- Undo reverses last action (move, resize, add, delete, material change)

**What exists now:**
- No undo/redo

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| History stack | `useSceneStore.ts` | Implement command pattern: each action pushes a snapshot of scene state; undo pops and restores |
| Keyboard shortcuts | Global keydown handler | `Cmd+Z` = undo, `Cmd+Shift+Z` = redo |
| Undo/Redo buttons | Top bar component | Two arrow icon buttons wired to store actions |

**Estimate:** 3 days

---

### 11. Door Rendering in 3D

**What Flatma does:**
- Wardrobes show rendered doors as distinct panels overlaid on the front face of the carcass
- Doors have their own material (Facade material slot) visually distinct from the carcass

**What exists now:**
- Door panels exist in the schema and BOM but are not rendered in the 3D view

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Door mesh generation | `BabylonScene.tsx` | Read `panels` from furniture schema; panels with `name` matching "door" or `facade: true` are rendered as thin boxes on the front face at z = depth/2 + panel_thickness/2, split evenly across the width |
| Door material slot | `BabylonScene.tsx` | Apply `facade_material` texture to door meshes |
| Door count from schema | `BabylonScene.tsx` | Use `quantity` field to split doors evenly: width per door = (total_width - carcass_panels) / quantity |

**Estimate:** 3 days

---

### 12. Save / Auto-save

**What Flatma does:**
- Cloud save icon in top bar
- Implied auto-save on change

**What exists now:**
- Manual "Save as draft" button

**What needs to be built:**

| Task | File(s) | Details |
|------|---------|---------|
| Scene persistence API | `backend/app/api/` | `PUT /projects/:id/scene` — stores full scene JSON (all placed objects with positions, materials, dimensions) |
| Auto-save debounce | `useSceneStore.ts` | After any state change, debounce 1s then POST to API |
| Save indicator | Top bar | "Saving…" / "Saved" / "Unsaved changes" status text |

**Estimate:** 2 days

---

## Summary Table

| Feature Area | Days |
|---|---|
| 1. Room Setup | 3 |
| 2. Furniture Library + Drag-and-drop | 8 |
| 3. Multi-Object Scene | 12 |
| 4. Object Parameters Panel | 5 |
| 5. Materials Panel + Textures in 3D | 8 |
| 6. Elements / Scene Hierarchy | 3 |
| 7. Viewport Tools | 4 |
| 8. 2D Floor Plan Mode | 6 |
| 9. Cutting Layout Modal | 10 |
| 10. Undo / Redo | 3 |
| 11. Door Rendering | 3 |
| 12. Save / Auto-save | 2 |
| **Total** | **67 days** |

---

## Recommended Build Order

Build in this sequence to unblock each phase:

```
Phase 1 — Foundation (weeks 1–3)
  → Scene state store (useSceneStore)
  → Multi-object scene graph + Babylon refactor
  → Click-to-select + bounding box
  → Object Parameters panel (W/H/D/delete/copy)
  → Save / Auto-save

Phase 2 — Library + Placement (weeks 4–5)
  → Library panel UI with categories
  → Drag-and-drop from library to scene
  → Thumbnail system for furniture types
  → Door rendering

Phase 3 — Materials + Visuals (weeks 6–7)
  → Texture loading in 3D
  → Three-slot materials (Panel/Facade/Backboard)
  → Material picker modal
  → Room mesh (walls + floor)
  → Viewport tools (transparency, wireframe, view presets)

Phase 4 — 2D + Drawings (weeks 8–10)
  → 2D floor plan mode
  → Elements / hierarchy panel
  → Nesting engine (backend)
  → Cutting layout modal with SVG diagram
  → Download drawings

Phase 5 — Polish (week 11–14)
  → Undo / redo
  → Unit selector (mm/cm/in)
  → Intersection checking
  → Performance optimisation (instanced meshes, LOD)
  → Mobile/touch controls
```

---

## Key Technical Decisions

**State management:** Use Zustand for the scene store. It avoids prop drilling across BabylonScene ↔ LibraryPanel ↔ ParametersPanel ↔ MaterialsPanel without the overhead of Redux.

**Babylon.js version:** Already on v9.x — use `HighlightLayer` for selection outlines, `PointerDragBehavior` for object dragging, `BoundingBoxGizmo` for resize handles (these are built-in and production-ready).

**Nesting algorithm:** Use the MaxRects bin packing algorithm (well-established, open-source JS implementations available). Run server-side in Python (`rectpack` library) to keep the client lightweight.

**Texture streaming:** Store material textures in MinIO (already in place). In BabylonScene, load textures lazily using `Texture` with a loading callback; show a flat colour until loaded.

**Backend scene model:** Add a `scene_objects` table (id, project_id, furniture_type_id, position_json, rotation_y, dimensions_json, materials_json) instead of modifying the existing `configurations` table, to avoid breaking the current production flow.

---

## Out of Scope (not in Flatma either)

- Freeform drawing tool (beta in Flatma, complex to implement)
- AI assistant (beta in Flatma)
- Community library
- Complex rotation (multi-axis, beta in Flatma)
- Real-time collaboration
