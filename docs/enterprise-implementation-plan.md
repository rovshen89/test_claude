# Furniture Configurator Enterprise Implementation Plan

**Version:** 2.0  
**Date:** May 2026  
**Target:** Enterprise-grade room-scale furniture configurator, manufacturing pipeline, GLB/USDZ export, AR preview, and operational platform  
**Planning horizon:** 6-9 months for production-grade rollout, depending on team size and quality bar

---

## 1. Executive Summary

This project is evolving from a single-object furniture configurator into an enterprise design, quoting, manufacturing, and AR visualization platform.

The current application already has a solid foundation: authentication, projects, furniture types, material catalog, configuration CRUD, BOM/pricing, orders, DXF/PDF export, MinIO storage, and a basic Babylon.js 3D viewer. The next stage is not only "more UI"; it changes the domain model from one configured product to a room-scale scene containing many configurable objects, each of which must remain manufacturable, priceable, exportable, auditable, and orderable.

The enterprise goal is:

```text
Project
  -> Room Scene
  -> Multiple Scene Objects
  -> Manufacturing Configurations
  -> Aggregated BOM / Pricing / Cut Plans
  -> GLB/USDZ / AR Preview
  -> Quote / Order / Production Workflow
  -> Audit / Versioning / Tenant Controls
```

The biggest risk is source-of-truth drift. The existing system is configuration-centric. The planned system is scene-centric. Before building the full editor, the application must define how `SceneObject`, `Configuration`, BOM, pricing, and orders relate.

The recommended strategy is to build a scene domain layer first, then layer the editor, rendering, AR, and cutting workflows on top.

---

## 2. Product Objectives

### Primary objectives

- Let users design an entire room with multiple furniture objects.
- Keep every placed object manufacturable, priceable, and orderable.
- Support object-level materials, dimensions, placement, visibility, lock state, and revisions.
- Produce aggregated BOM, pricing, cutting layout, DXF/PDF, and order data from the room scene.
- Provide high-quality 3D rendering and AR preview for customer-facing sales workflows.
- Support tenant isolation, role-based access, auditability, and operational reliability.

### Enterprise objectives

- Version every significant change to scene, configuration, pricing, material, and order data.
- Make rendering/export workflows reproducible and debuggable.
- Support large catalogs, large projects, multiple users, and long-lived projects.
- Avoid blocking user interaction on expensive server-side jobs.
- Make all background processing idempotent and resumable.
- Provide observability for backend, frontend, export jobs, storage, and third-party conversion dependencies.

### Non-goals for first enterprise release

- Real-time collaborative editing with CRDTs.
- AI room generation.
- Native mobile apps.
- Freeform architectural room scanning.
- Full CAD kernel-level modeling.
- Advanced collision detection or physics simulation.

These can be added later, but should not shape the first production architecture.

---

## 3. Current State Assessment

### Existing strengths

| Area | Status | Notes |
|---|---:|---|
| Auth and roles | Working | next-auth v5 and backend auth exist |
| Multi-tenant concepts | Working | Must be consistently enforced in new APIs |
| Project CRUD | Working | `Project.room_schema` already exists |
| Furniture types | Working | Schema-based dimensions and panels |
| Materials | Working | Includes texture upload foundation |
| Single-object configurator | Working | Babylon.js viewer is basic but usable |
| BOM | Working | Single `AppliedConfig` input |
| Pricing | Working | Single configuration flow |
| Orders | Working | Current flow tied to configurations |
| DXF/PDF export | Working | Needs scene aggregation later |
| MinIO storage | Working | Can support textures, GLB, USDZ, thumbnails |

### Existing gaps

| Area | Gap |
|---|---|
| Domain model | No first-class room scene or scene objects |
| Aggregation | BOM/pricing/order pipeline does not support multiple objects |
| 3D editor | Single object only, no scene graph |
| Persistence | No scene save/load, no versioning |
| Materials in 3D | No PBR texture mapping in viewer |
| Room rendering | No walls/floor/room context |
| 2D floor plan | Not implemented |
| AR | No GLB/USDZ pipeline |
| Undo/redo | Not implemented |
| Operational jobs | No export/conversion job system |
| Audit trail | Limited or absent for scene changes |
| Performance controls | No limits for object count, texture size, export size |

---

## 4. Core Architecture Decision

### Decision: make `ProjectScene` the design source of truth

The enterprise editor should be project-scene-first.

```text
Project
  has one active ProjectScene
  has many ProjectSceneVersions
  has many SceneObjects

SceneObject
  references FurnitureType
  stores dimensions, material slots, placement, visibility, lock state
  can derive an AppliedConfig for manufacturing

Configuration
  remains as a manufacturing snapshot or legacy single-object entity
  may be generated from one SceneObject or from a full ProjectScene

Order
  references a frozen quote/manufacturing snapshot
  must not depend on mutable live scene data
```

### Why this matters

If scene state and configuration state both mutate independently, BOM/pricing/export/order results will become inconsistent. Enterprise systems need immutable snapshots at business boundaries:

- Design can keep changing.
- Quote must freeze prices and inputs.
- Order must freeze manufacturing data.
- Production must not change because a designer moved an object later.

### Recommended domain flow

```text
User edits ProjectScene
  -> Auto-save mutable draft
  -> User requests quote
  -> Server validates scene
  -> Server derives manufacturing configs
  -> Server calculates aggregated BOM/pricing
  -> Server creates QuoteSnapshot
  -> User confirms quote
  -> Server creates Order from QuoteSnapshot
```

---

## 5. Target Domain Model

### Project

Stores high-level ownership and room metadata.

```text
projects
  id
  tenant_id / user_id
  name
  room_schema
  active_scene_id
  created_at
  updated_at
```

`room_schema` should be validated JSON:

```json
{
  "width_mm": 5000,
  "depth_mm": 3000,
  "height_mm": 2700,
  "wall_color": "#f3f4f6",
  "floor_color": "#d6c7b0",
  "floor_texture_s3_key": null,
  "unit": "mm"
}
```

### ProjectScene

Represents the editable scene container.

```text
project_scenes
  id
  project_id
  status              draft | quoted | ordered | archived
  version_number
  schema_version
  created_by
  updated_by
  created_at
  updated_at
```

### SceneObject

Represents one placed product or primitive component.

```text
scene_objects
  id
  project_scene_id
  project_id
  furniture_type_id
  display_name
  object_type          furniture | primitive_panel | imported_model
  position_json        { x_m, y_m, z_m }
  rotation_json        { x_rad, y_rad, z_rad }
  dimensions_json      { width_mm, height_mm, depth_mm, ... }
  materials_json       { panel, facade, backboard, edge, hardware_profile }
  config_json          derived or object-specific overrides
  visible
  locked
  sort_order
  metadata_json
  created_at
  updated_at
```

### SceneVersion

Immutable revision record for audit, rollback, and quote traceability.

```text
project_scene_versions
  id
  project_scene_id
  version_number
  snapshot_json
  change_summary
  created_by
  created_at
```

### QuoteSnapshot

Frozen business snapshot.

```text
quote_snapshots
  id
  project_id
  project_scene_version_id
  currency
  subtotal
  taxes
  discounts
  total
  bom_snapshot_json
  pricing_snapshot_json
  material_snapshot_json
  created_by
  expires_at
  created_at
```

### Order

Orders should reference `quote_snapshot_id`, not mutable scene data.

```text
orders
  id
  quote_snapshot_id
  project_id
  status
  manufacturing_snapshot_json
  created_at
  updated_at
```

### ExportJob

All heavy export/conversion tasks should be background jobs.

```text
export_jobs
  id
  project_id
  scene_id
  scene_version_id
  object_id nullable
  job_type             glb | usdz | dxf | pdf | nesting | thumbnail
  status               queued | running | succeeded | failed | cancelled
  input_hash
  output_s3_key
  error_message
  attempts
  created_by
  created_at
  started_at
  completed_at
```

---

## 6. System Architecture

### High-level architecture

```text
Next.js Frontend
  - Scene editor
  - Babylon.js canvas
  - Material/catalog UI
  - Quote/order UI
  - AR viewer

FastAPI Backend
  - Authenticated APIs
  - Scene persistence
  - BOM/pricing derivation
  - Export job orchestration
  - Tenant authorization

PostgreSQL
  - Projects
  - Scenes
  - Scene objects
  - Versions
  - Quotes
  - Orders
  - Jobs

MinIO / S3-compatible storage
  - Textures
  - Thumbnails
  - GLB/USDZ
  - PDF/DXF
  - Export artifacts

Worker service
  - GLB validation
  - USDZ conversion
  - Nesting
  - PDF/DXF generation
  - Thumbnail/render snapshots
```

### Runtime services

| Service | Responsibility |
|---|---|
| `frontend` | Next.js app and client editor |
| `backend` | FastAPI API server |
| `worker` | Background export/conversion jobs |
| `postgres` | Primary relational database |
| `redis` | Queue, locks, cache, rate limiting |
| `minio` | Object storage |
| `createbuckets` | Storage bootstrap |

### Why a worker is required

Enterprise export tasks should not run inside request handlers. GLB validation, USDZ conversion, PDF/DXF generation, and nesting can be slow, memory-heavy, or failure-prone. They need retries, logs, progress, cancellation, and isolation from normal API latency.

---

## 7. API Architecture

### Scene APIs

```text
GET    /projects/{project_id}/scene
PUT    /projects/{project_id}/scene
POST   /projects/{project_id}/scene/objects
PATCH  /projects/{project_id}/scene/objects/{object_id}
DELETE /projects/{project_id}/scene/objects/{object_id}
POST   /projects/{project_id}/scene/versions
GET    /projects/{project_id}/scene/versions
POST   /projects/{project_id}/scene/versions/{version_id}/restore
```

### Manufacturing APIs

```text
POST /projects/{project_id}/scene/validate
POST /projects/{project_id}/scene/bom
POST /projects/{project_id}/scene/pricing
POST /projects/{project_id}/quotes
GET  /projects/{project_id}/quotes
POST /quotes/{quote_id}/confirm
```

### Export APIs

```text
POST /projects/{project_id}/exports/glb
POST /projects/{project_id}/exports/usdz
POST /projects/{project_id}/exports/pdf
POST /projects/{project_id}/exports/dxf
POST /projects/{project_id}/exports/nesting
GET  /export-jobs/{job_id}
GET  /export-jobs/{job_id}/download
POST /export-jobs/{job_id}/cancel
```

### Catalog APIs

```text
GET  /furniture-types?category=&search=&page=&limit=
POST /furniture-types/{id}/thumbnail
GET  /materials?category=&search=&page=&limit=
POST /materials/{id}/textures
```

### API bottlenecks

| Bottleneck | Risk | Mitigation |
|---|---|---|
| Full-scene PUT on every edit | Large payloads, race conditions | Debounced autosave, optimistic version numbers, patch endpoint |
| Object-level PATCH spam | Many requests during drag | Local live updates, commit only on pointer-up |
| Pre-signed URL expiry | AR/model-viewer fails later | Public proxy route or refresh endpoint |
| Large material catalog | Slow picker/search | Pagination, server search, thumbnails, CDN/cache headers |
| Long export requests | API timeouts | Queue jobs, return job ID |

---

## 8. Frontend Architecture

### New frontend modules

```text
frontend/
  lib/
    sceneStore.ts
    sceneApi.ts
    sceneSelectors.ts
    sceneHistory.ts
    sceneValidation.ts
    exportJobs.ts
  types/
    scene.ts
    model-viewer.d.ts
  app/(app)/projects/[id]/scene/
    page.tsx
    _components/
      SceneShell.tsx
      BabylonScene.tsx
      LibraryPanel.tsx
      ElementsPanel.tsx
      ParametersPanel.tsx
      MaterialsPanel.tsx
      MaterialPickerModal.tsx
      RoomSetupModal.tsx
      ViewportToolbar.tsx
      SceneKeyboardHandler.tsx
      CuttingModal.tsx
      NestingDiagram.tsx
      ExportJobStatus.tsx
      ARViewer.tsx
      QuotePanel.tsx
```

### State management

Use Zustand, but avoid making one giant unstructured store. Split responsibilities:

| Store slice | Responsibility |
|---|---|
| `objects` | Scene objects and selection |
| `room` | Room schema |
| `history` | Undo/redo stacks |
| `viewport` | Camera mode, wireframe, transparency, 2D/3D |
| `save` | Autosave status and version token |
| `catalog` | Furniture/material picker cache |
| `jobs` | Export job polling state |

### Scene mutation rules

- Live pointer movement updates Babylon transforms locally.
- Store mutation happens at controlled checkpoints.
- Network save happens after debounce or explicit save.
- Drag/resize should create one history entry, not hundreds.
- Deleting, cloning, material change, dimension change, and room change are undoable.

### Babylon.js rendering model

Use a stable scene graph:

```text
Scene
  roomRoot
  gridRoot
  objectRoot
    TransformNode obj-{id}
      panel meshes
      facade meshes
      backboard meshes
      handles
      annotations
  overlayRoot
```

Rules:

- One `TransformNode` per `SceneObject`.
- Meshes carry `metadata.objectId` for picking.
- Dispose only the affected object's child meshes when dimensions/materials change.
- Do not rebuild the entire scene on every store update.
- Keep Babylon object lifecycle separate from React render lifecycle.
- Use meters in Babylon: `1 mm = 0.001 Babylon units`.

### Frontend bottlenecks

| Bottleneck | Risk | Mitigation |
|---|---|---|
| React re-rendering on every pointer move | Janky drag/resize | Use refs and commit at pointer-up |
| Rebuilding all meshes on every edit | Poor performance | Per-object diffing and mesh disposal |
| Too many textures | GPU memory pressure | Texture cache, resolution limits, lazy loading |
| Large catalog thumbnails | Slow sidebar | Paginated lazy grid |
| Undo stack memory growth | Browser memory leak | Cap history, compress snapshots, ignore transient changes |
| Mobile touch + Babylon controls conflict | Bad UX | Dedicated gesture mode and pointer capture |
| WebGL context loss | Blank canvas | Detect, show recovery, recreate engine |

---

## 9. Backend Architecture

### Backend modules

```text
backend/app/
  api/
    scene.py
    quotes.py
    export_jobs.py
    glb.py
  models/
    project_scene.py
    scene_object.py
    scene_version.py
    quote_snapshot.py
    export_job.py
  schemas/
    scene.py
    quote.py
    export_job.py
  services/
    scene_derivation.py
    scene_validation.py
    quote_service.py
    export_service.py
    usdz_converter.py
  core/
    nesting.py
    bom.py
    pricing.py
    export_dxf.py
    export_pdf.py
```

### Backend principles

- Validate tenant/project access in every new endpoint.
- Keep quote/order generation server-side only.
- Never trust client-calculated BOM or price.
- Freeze all business-critical snapshots.
- Keep scene draft mutable, but quote/order immutable.
- Use idempotency keys for export and quote requests.
- Store input hashes to deduplicate export jobs.

### Backend bottlenecks

| Bottleneck | Risk | Mitigation |
|---|---|---|
| JSON-heavy scene storage | Hard querying and migrations | Use typed columns for key fields, JSON for flexible dimensions/materials |
| Aggregated BOM from many objects | Slow quote generation | Derivation service, caching by scene version hash |
| Export jobs in API process | Request timeouts, memory spikes | Worker service |
| USDZ conversion | Large dependency, CPU/memory spikes | Dedicated worker queue, job timeout, retry/fallback |
| MinIO pre-signed URLs | Expiry and mobile AR issues | Proxy download endpoint or renewable links |
| Concurrent autosave | Lost edits | Optimistic locking with scene version token |

---

## 10. Data Consistency and Versioning

### Required version fields

Add versioning to mutable scene data:

```text
project_scenes.version_number
project_scenes.updated_at
project_scenes.updated_by
```

Every save request should send:

```json
{
  "base_version": 17,
  "objects": [],
  "room_schema": {}
}
```

If the server version has advanced, return:

```text
409 Conflict
```

Client options:

- Reload latest.
- Save as duplicate.
- Attempt merge for non-overlapping object changes.

### Snapshot triggers

Create immutable `ProjectSceneVersion` on:

- Explicit save milestone.
- Quote creation.
- Order creation.
- Export intended for customer sharing.
- Manual user action: "Create version".

### Bottleneck: merge complexity

Do not implement real-time merges in the first enterprise release. Use simple optimistic locking and clear conflict messaging. Multi-user collaboration can be a later phase.

---

## 11. Security and Tenant Isolation

### Required controls

- All scene APIs must check project ownership or tenant access.
- All export jobs must verify the requesting user can access the project.
- All object storage keys must be tenant/project scoped.
- Pre-signed URLs should be short-lived unless deliberately public.
- Public AR share links should use signed tokens with expiry and revocation.
- File upload endpoints must validate content type, size, extension, and dimensions.
- GLB/USDZ uploads should be validated before storage or before public serving.

### Storage key pattern

```text
tenants/{tenant_id}/projects/{project_id}/textures/{file_id}.png
tenants/{tenant_id}/projects/{project_id}/exports/glb/{job_id}.glb
tenants/{tenant_id}/projects/{project_id}/exports/usdz/{job_id}.usdz
tenants/{tenant_id}/projects/{project_id}/exports/pdf/{job_id}.pdf
```

### Security bottlenecks

| Bottleneck | Risk | Mitigation |
|---|---|---|
| Public model URLs | Data leakage | Signed share tokens, scoped proxy route |
| User-uploaded textures | Malicious files | MIME sniffing, image re-encoding, size limits |
| GLB uploads | Malformed binary assets | Validate with parser, limit size |
| Cross-tenant IDs | Data leak | Centralized access helpers and tests |
| AR links | Uncontrolled sharing | Expiry, revocation, audit logs |

---

## 12. Performance Targets

### Frontend targets

| Metric | Target |
|---|---:|
| Initial scene load | < 2.5s for normal project |
| Drag latency | 60 FPS target, 30 FPS minimum |
| Object selection response | < 100ms |
| Autosave debounce | 1.5-3s |
| Texture max resolution | 1024-2048px default |
| Recommended scene object limit | 100 objects for v1 |
| Hard scene object limit | Configurable, default 300 |

### Backend targets

| Metric | Target |
|---|---:|
| Scene GET | < 300ms p95 for normal projects |
| Scene save | < 500ms p95 |
| BOM/pricing generation | < 2s for normal scenes |
| GLB export job | < 30s target |
| USDZ conversion | < 60s target |
| Nesting job | < 30s for normal BOM |

### Performance bottlenecks

- Large scenes with hundreds of meshes.
- High-resolution PBR textures.
- Shadow maps and SSAO on lower-end devices.
- Full-scene serialization.
- Expensive nesting algorithms for many panel groups.
- USDZ conversion memory usage.
- Mobile AR downloading large models.

### Mitigations

- Level-of-detail rendering.
- Texture downscaling and CDN/object cache.
- Render quality presets.
- Object instancing where possible.
- Mesh merging for export only, not editor interaction.
- Export size warnings.
- Async job queue with progress.

---

## 13. Feature Plan

### 13.1 Scene Foundation

Build first.

Tasks:

- Add scene domain models and migrations.
- Add scene schemas and validation.
- Add scene load/save APIs.
- Add optimistic locking.
- Add scene-to-applied-config derivation service.
- Add aggregated BOM/pricing from scene.
- Add backend tests proving one scene object matches existing single configuration output.

Deliverable:

```text
A project scene with one object can produce the same BOM/pricing as the current configuration flow.
```

### 13.2 Editor Foundation

Tasks:

- Create `sceneStore.ts`.
- Refactor Babylon viewer to scene graph.
- Add one `TransformNode` per object.
- Implement object selection.
- Implement drag-to-move.
- Implement dimension editing.
- Implement delete/clone.
- Implement undo/redo model early.
- Implement autosave.

Deliverable:

```text
Users can place, edit, move, select, clone, delete, undo, redo, and save scene objects.
```

### 13.3 Room Setup

Tasks:

- Room settings modal.
- Room schema validation.
- Floor/wall meshes.
- Wall/floor colors.
- Optional floor texture.
- Visibility toggle.

Bottlenecks:

- Texture upload security.
- Room dimensions affecting camera/framing.
- Unit conversion consistency.

### 13.4 Furniture Library

Tasks:

- Paginated furniture type catalog.
- Category filters and search.
- Thumbnail upload/generation.
- Drag-to-add.
- Ghost preview on floor.
- Primitive panel objects.

Bottlenecks:

- Large catalog search.
- Thumbnail storage and cache invalidation.
- Drag events crossing React/Babylon boundaries.

### 13.5 Materials and PBR

Tasks:

- Three-slot material assignment: panel, facade, backboard.
- Material picker with search.
- Texture loading and caching.
- UV scaling based on board dimensions.
- Texture fallback while loading.

Bottlenecks:

- Texture size and GPU memory.
- CORS/pre-signed texture URLs.
- Visual mismatch between editor, GLB, and AR viewer.

### 13.6 Door, Drawer, and Component Rendering

Tasks:

- Parse furniture schema components.
- Render carcass panels.
- Render facade panels.
- Render backboards.
- Render shelves/drawers where schema supports them.
- Map materials to component roles.

Bottlenecks:

- Schema inconsistency across furniture types.
- Overfitting renderer to current schemas.
- Door/drawer geometry becoming a hidden CAD engine.

Mitigation:

- Define a formal renderable component schema.
- Version furniture schemas.
- Add renderer tests/fixtures.

### 13.7 Scene Hierarchy

Tasks:

- Elements panel.
- Rename objects.
- Hide/show.
- Lock/unlock.
- Reorder.
- Select from list.

Bottlenecks:

- Syncing list selection with Babylon selection.
- Locked objects still participating in BOM/pricing.
- Hidden objects: decide whether hidden means visual-only or excluded from quote.

Decision:

Use separate flags:

```text
visible: affects editor rendering
included_in_quote: affects BOM/pricing/order
locked: affects editing
```

### 13.8 Viewport Tools

Tasks:

- Perspective/orthographic toggle.
- Top/front/side presets.
- Wireframe mode.
- Transparency mode.
- Render quality preset.
- Grid snapping.

Bottlenecks:

- Orthographic camera bounds for large rooms.
- Wireframe/transparency mutating shared materials.

Mitigation:

- Use cloned or mode-specific material overrides.
- Restore original material state cleanly.

### 13.9 2D Floor Plan Mode

Tasks:

- Top-down orthographic camera.
- Footprint rectangles.
- 2D handles.
- Rotation handle.
- Dimension rulers.
- Grid and snapping.

Bottlenecks:

- 2D object footprint may not match complex 3D geometry.
- Rotation and resize interactions can conflict with camera controls.
- Dimensions must remain manufacturable after resize.

Mitigation:

- Treat 2D mode as editing placement and width/depth only.
- Run validation after resize.

### 13.10 Cutting Layout and Nesting

Tasks:

- Add `rectpack`.
- Group panels by material/thickness/grain constraints.
- Generate per-sheet layouts.
- Show utilization, cutting length, edge banding.
- Export PDF/DXF.

Bottlenecks:

- Grain direction can restrict rotation.
- Panel grouping by material is mandatory.
- Infinite sheet count must be bounded.
- Nesting results are heuristic, not always optimal.
- Manual rotation in UI can invalidate server layout.

Mitigation:

- Server owns final nesting.
- Expose nesting settings explicitly.
- Store nesting result as export snapshot.

### 13.11 GLB Export

Tasks:

- Add `@babylonjs/serializers`.
- Export scene or selected object.
- Exclude room shell when AR export requires product-only.
- Embed textures.
- Upload GLB to backend.
- Validate and store artifact.
- Cache by scene version hash.

Bottlenecks:

- Browser memory during export.
- Texture CORS/pre-signed expiration.
- GLB file size.
- Exporting editor-only meshes like handles/grid/annotations.

Mitigation:

- Tag exportable nodes.
- Use `shouldExportNode`.
- Warn on oversized exports.
- Consider server-side export later if browser export becomes unreliable.

### 13.12 USDZ and AR

Tasks:

- Install and validate USDZ converter in worker.
- Convert GLB to USDZ on demand.
- Cache USDZ by GLB hash.
- Add `<model-viewer>`.
- Add AR share page.
- Support iOS QuickLook and Android Scene Viewer.

Bottlenecks:

- `usd-core` size and CLI availability.
- iOS QuickLook material limitations.
- Public HTTPS requirement.
- Large model download on mobile.
- Scale correctness.

Mitigation:

- Treat USDZ converter as a technical spike.
- Build a fallback: GLB-only 3D viewer when USDZ fails.
- Keep AR artifacts product-only and optimized.

### 13.13 Quotes and Orders

Tasks:

- Validate full scene.
- Generate quote snapshot.
- Freeze BOM/pricing/material data.
- Confirm quote into order.
- Attach export artifacts to order.
- Preserve current single-configuration flow during transition.

Bottlenecks:

- Users editing scene after quote.
- Material price changes after quote.
- Mixed status objects in one project.

Mitigation:

- Quote snapshots immutable.
- Order references quote snapshot.
- Scene can continue as draft after order, but order remains frozen.

---

## 14. Phased Delivery Plan

### Phase 0: Architecture Spike and Contracts

Duration: 1-2 weeks

Deliverables:

- Final decision on scene/configuration relationship.
- Scene JSON schema.
- Manufacturing derivation contract.
- Export job contract.
- USDZ converter proof of concept.
- Performance budget and object limits.

Exit criteria:

- Team can explain exactly how a scene becomes BOM, quote, order, GLB, and USDZ.

### Phase 1: Scene Domain Backend

Duration: 3-4 weeks

Deliverables:

- Migrations for scenes, scene objects, versions, jobs.
- Scene APIs.
- Optimistic locking.
- Scene validation.
- Scene-to-applied-config derivation.
- Aggregated BOM/pricing APIs.
- Tests for auth, tenant isolation, validation, aggregation.

Exit criteria:

- Backend can save/load scene and generate accurate aggregated BOM/pricing.

### Phase 2: Editor Core

Duration: 4-6 weeks

Deliverables:

- Zustand scene store.
- Babylon scene graph refactor.
- Selection, movement, dimension editing.
- Parameters panel.
- Room mesh.
- Autosave.
- Undo/redo.
- Basic hierarchy panel.

Exit criteria:

- Users can create and edit a multi-object room scene reliably.

### Phase 3: Catalog, Materials, and Component Rendering

Duration: 4-6 weeks

Deliverables:

- Furniture library.
- Thumbnails.
- Drag-to-add.
- Material picker.
- PBR texture loading.
- Component role rendering.
- Door/drawer/backboard rendering.

Exit criteria:

- Scene objects visually match selected products/materials closely enough for sales use.

### Phase 4: Quote, Order, and Manufacturing Outputs

Duration: 4-6 weeks

Deliverables:

- Quote snapshots.
- Order creation from quote.
- Aggregated PDF/DXF.
- Nesting service.
- Cutting layout UI.
- Export snapshots attached to quote/order.

Exit criteria:

- A full room scene can become a production-ready order.

### Phase 5: GLB, USDZ, and AR

Duration: 3-5 weeks

Deliverables:

- GLB export.
- Export job service.
- USDZ conversion worker.
- `<model-viewer>` integration.
- AR share links.
- Mobile AR testing.

Exit criteria:

- Product/scene can be viewed reliably in browser and native AR on supported devices.

### Phase 6: Enterprise Hardening

Duration: 4-8 weeks

Deliverables:

- Audit logs.
- Observability.
- Rate limits.
- Admin controls.
- Error dashboards.
- Load tests.
- Security tests.
- Backup/restore checks.
- Documentation and runbooks.

Exit criteria:

- Application is production-operable, supportable, and measurable.

---

## 15. Database Migration Plan

### Migration order

1. Add scene tables without changing existing configuration flow.
2. Add scene APIs behind feature flag.
3. Add derivation service that can produce existing `AppliedConfig`.
4. Add quote snapshot tables.
5. Add export job tables.
6. Gradually route new editor to scene APIs.
7. Keep legacy configuration pages until parity is proven.

### Backward compatibility

- Existing configurations remain valid.
- Existing orders remain valid.
- Existing BOM/pricing tests must continue passing.
- New scene flow should add tests, not rewrite old assumptions immediately.

### Migration bottlenecks

- Existing project/configuration relationships may not map cleanly to scenes.
- Legacy applied configs may lack material slot structure.
- Old material data may lack sheet dimensions.

Mitigation:

- Provide default material sheet sizes.
- Generate one-object scenes from legacy configurations only when needed.
- Keep data migration lazy unless a full migration is required.

---

## 16. Infrastructure Plan

### Docker services

Add:

```yaml
worker:
  build: ./backend
  command: celery -A app.worker worker
  depends_on:
    - postgres
    - redis
    - minio

redis:
  image: redis:7
```

Celery/RQ/Arq are acceptable. Pick one and standardize.

### Storage buckets

```text
textures
thumbnails
glb-exports
usdz-exports
pdf-exports
dxf-exports
nesting-exports
```

### Environment variables

```env
SCENE_MAX_OBJECTS=300
TEXTURE_MAX_BYTES=10485760
GLB_MAX_BYTES=52428800
EXPORT_JOB_TIMEOUT_SECONDS=120
USDZ_CONVERSION_TIMEOUT_SECONDS=90
PUBLIC_SHARE_TOKEN_TTL_DAYS=30
```

### Infrastructure bottlenecks

- `usd-core` may increase image size dramatically.
- Worker memory needs may exceed API memory.
- Object storage lifecycle policies are needed.
- Export artifacts can accumulate quickly.

Mitigation:

- Separate API and worker images if needed.
- Add lifecycle cleanup for temporary artifacts.
- Add per-tenant storage quotas.

---

## 17. Observability and Operations

### Required logs

- Scene save conflicts.
- Export job lifecycle.
- USDZ conversion errors.
- Storage upload/download failures.
- Quote/order creation.
- Auth/authorization failures.
- Client-side WebGL failures.

### Required metrics

- Scene save latency.
- Scene payload size.
- Object count per scene.
- Export job duration and failure rate.
- GLB/USDZ file size.
- BOM/pricing generation time.
- Texture upload size.
- WebGL context loss count.

### Required dashboards

- API health.
- Worker queue depth.
- Export failures.
- Storage usage by tenant.
- Slow endpoints.
- Frontend error rate.

### Operational bottlenecks

- Hard-to-debug browser export failures.
- Device-specific AR failures.
- Users reporting "price changed" without audit context.
- Large export artifacts filling storage.

Mitigation:

- Attach scene version, export job ID, and input hash to every artifact.
- Add support-facing debug panel for project/scene/job status.
- Preserve quote/order snapshots.

---

## 18. Testing Strategy

### Backend tests

- Scene CRUD and authorization.
- Optimistic locking.
- Scene validation.
- Scene-to-applied-config derivation.
- Aggregated BOM/pricing.
- Quote snapshot immutability.
- Export job creation and retry.
- Storage access controls.
- Nesting by material/grain constraints.

### Frontend tests

- Store reducers/actions.
- Undo/redo behavior.
- Autosave debounce.
- Conflict state.
- Material picker.
- Parameters panel validation.
- AR viewer states.

### Visual and integration tests

- Babylon scene smoke test.
- GLB export smoke test.
- Model-viewer load test.
- Screenshot tests for core editor layouts.
- Mobile viewport tests.

### Manual device tests

- iPhone Safari QuickLook.
- Android Chrome Scene Viewer.
- Low-end laptop WebGL.
- Large scene performance.
- Slow network texture/model loading.

### Testing bottlenecks

- Headless WebGL can be flaky.
- AR cannot be fully automated.
- Export binary comparison is brittle.

Mitigation:

- Validate metadata, node counts, file size, and parser load rather than exact binary equality.
- Keep a manual AR acceptance checklist.

---

## 19. Feature Flags and Rollout

### Flags

```text
scene_editor_enabled
scene_quote_enabled
glb_export_enabled
usdz_export_enabled
ar_share_enabled
nesting_enabled
legacy_configuration_enabled
```

### Rollout sequence

1. Internal admin users.
2. One pilot tenant.
3. Read-only scene preview.
4. Scene editing without ordering.
5. Quote generation.
6. Order creation.
7. AR sharing.
8. Broad rollout.

### Rollback strategy

- Keep legacy configuration flow available.
- Do not delete old config/order paths.
- Make scene editor opt-in until quote/order parity is confirmed.

---

## 20. Key Risks and Bottlenecks

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| Scene/configuration source-of-truth confusion | High | High | Finalize domain model before UI build |
| Aggregated BOM/pricing mismatch | High | Medium | Backend derivation tests and snapshots |
| USDZ conversion unreliable | High | Medium | Spike early, worker isolation, fallback viewer |
| Browser GLB export memory issues | Medium | Medium | Export limits, optimization, possible server export |
| Large scenes become slow | High | Medium | Object limits, per-object diffing, quality presets |
| Texture storage and GPU pressure | Medium | High | Texture limits, thumbnails, lazy loading |
| Autosave conflicts | Medium | Medium | Optimistic locking and clear conflict UX |
| Material price changes after quote | High | Medium | Immutable quote snapshots |
| Public AR links leak data | High | Medium | Signed share tokens and revocation |
| Cutting layout expectations exceed heuristic nesting | Medium | Medium | Communicate utilization and allow settings |
| Scope creep into CAD/room scanning/collaboration | High | High | Feature flags and phase gates |

---

## 21. Enterprise Acceptance Criteria

The application is enterprise-ready when:

- A full room scene can be saved, restored, versioned, quoted, ordered, exported, and audited.
- Existing single-configuration flows still work or have a proven migration path.
- Scene-derived BOM/pricing is reproducible from an immutable scene version.
- Orders never depend on mutable draft data.
- Export jobs are asynchronous, observable, retryable, and tied to input hashes.
- Tenant isolation is tested for every new API.
- Large files and uploads have limits.
- AR has a documented fallback path.
- Operators can inspect failed jobs and user-facing artifacts.
- Support can answer: "Which scene version created this quote/order/export?"

---

## 22. Recommended Immediate Next Steps

1. Finalize the scene/configuration/order source-of-truth decision.
2. Write the `SceneObject` and `ProjectScene` schemas.
3. Add backend derivation tests for one-object scene parity.
4. Spike USDZ conversion in Docker before promising iOS AR.
5. Implement scene backend behind a feature flag.
6. Refactor Babylon scale to `0.001`.
7. Build the editor core only after backend scene contracts are stable.

---

## 23. Final Recommendation

Do not treat this as a visual-editor-only project. The editor is only one layer. The enterprise product is a pipeline:

```text
Design -> Validate -> Price -> Quote -> Order -> Manufacture -> Export -> Share
```

The most important implementation principle is to make every downstream artifact traceable to an immutable scene version. That one decision prevents most enterprise-grade failures: pricing disputes, manufacturing mismatches, broken AR exports, order drift, and support ambiguity.

