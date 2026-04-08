# Furniture Constructor Platform — Design Spec
**Date:** 2026-04-08
**Status:** Approved

---

## Overview

A web-based furniture construction marketplace that lets users draw a room, configure furniture in 3D with photorealistic PBR materials, and produce production-ready outputs (cut lists, DXF, pricing, ERP integration). Serves three user roles — manufacturer, designer/consumer, and admin — on a single multi-tenant platform.

Inspired by [b2b.pan-raspil.ru](https://b2b.pan-raspil.ru/) but significantly more capable: full room planner, multi-category parametric furniture, PBR rendering, and a complete production pipeline.

---

## Goals

- Replace static, widget-based configurators (e.g. wardrobe-only embeds) with a full parametric room + furniture system
- Support wardrobes, kitchens, shelving, TV units, bathroom vanities, and office furniture at launch
- Deliver production-ready output: cut lists, DXF/CNC files, pricing breakdowns, ERP/CRM payloads
- Support multi-tenant material catalogs with manufacturer-uploaded PBR texture sets
- Serve B2B manufacturers, B2C end consumers, and internal production workflows from one platform

---

## Non-Goals (V1)

- Mobile native apps (web-responsive only)
- AR/VR camera overlay (post-V1)
- Rust/WASM constraint engine (post-V1 performance optimization)
- Real-time collaborative editing (post-V1)
- Parametric solid wood joinery (dovetails, mortise-and-tenon) — panel furniture only

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 15 (App Router), TypeScript |
| 3D engine | Babylon.js (latest) |
| Physics | Havok Physics (via Babylon.js integration) |
| State management | Zustand |
| Backend | FastAPI (Python, async) |
| Auth | JWT + role-based (admin, manufacturer, designer, consumer) |
| Database | PostgreSQL (JSONB for parametric configs) |
| Cache / WebSocket | Redis |
| File storage | S3-compatible (textures, DXF, PDF, renders) |
| DXF export | `ezdxf` (Python) |
| PDF export | `WeasyPrint` (Python) |
| SVG / nesting | `svgwrite` + custom nesting algorithm |
| ERP/CRM bridge | Webhook dispatcher (Bitrix24, 1C, custom URL) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│  Next.js 15 (App Router) + TypeScript                   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Room Planner │  │  Furniture   │  │   Material   │  │
│  │  (2D → 3D)  │  │ Configurator │  │   Catalog    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └─────────────────┴─────────────────┘          │
│                     Babylon.js Scene                    │
│           Havok Physics · PBRMaterial · CSG             │
│                    Zustand (state)                      │
└────────────────────────┬────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────┐
│                     BACKEND                             │
│  FastAPI (Python) — async, multi-tenant, JWT auth       │
│                                                         │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ Auth / │ │Pricing │ │   BOM    │ │  Export Engine │ │
│  │ Tenant │ │Engine  │ │ Engine   │ │ DXF·PDF·SVG    │ │
│  └────────┘ └────────┘ └──────────┘ └────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ERP/CRM Webhook Bridge (Bitrix24, 1C, custom)    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────┬───────────────────┘
                  │                   │
         ┌────────▼──────┐   ┌────────▼──────┐
         │  PostgreSQL   │   │   S3 Storage  │
         │  + Redis      │   │ Textures/DXF/ │
         │  (cache/WS)   │   │ Renders/PDFs  │
         └───────────────┘   └───────────────┘
```

---

## User Roles

| Role | Capabilities |
|---|---|
| **Admin** | Manage tenants, global material library, system config |
| **Manufacturer** | Manage material catalog, pricing rules, custom module templates, receive production orders |
| **Designer / Consumer** | Draw room, configure furniture, get estimates, submit orders |

---

## Module 1 — Room Planner (2D → 3D)

### 2D Canvas
- HTML5 Canvas with SVG overlay for snap guides
- User clicks points to draw walls; walls snap to 5cm grid, 90°/45° angle constraints
- Place doors and windows as wall segment cutouts with type metadata
- Define room height (default 2600mm)
- Stored as `RoomSchema` JSON

```typescript
interface RoomSchema {
  walls: Array<{ start: Vector2, end: Vector2, height: number }>;
  openings: Array<{ wall_index: number, offset: number, width: number,
                    height: number, type: 'door' | 'window' }>;
  floor_material_id: string;
  ceiling_material_id: string;
}
```

### 3D Scene Builder
- One-click conversion: `RoomSchema` → Babylon.js 3D scene
- Walls: `ExtrudedPolygon` meshes
- Door/window cutouts: CSG subtraction from wall meshes
- Floor + ceiling: `PlaneBuilder` with PBR materials
- Ambient lighting: `HemisphericLight` + configurable `DirectionalLight` for shadows

---

## Module 2 — Furniture Configurator

### FurnitureSchema
Each furniture category is defined by a JSON schema stored in `furniture_types`:

```typescript
interface FurnitureSchema {
  category: 'wardrobe' | 'kitchen' | 'shelving' | 'tv_unit' | 'bathroom' | 'office';
  dimensions: {
    width:  { min: number, max: number, step: number, default: number };
    height: { min: number, max: number, step: number, default: number };
    depth:  { min: number, max: number, step: number, default: number };
  };
  columns: number;  // configurable column count
  rows: number;     // configurable row count
  slots: SlotDefinition[][];  // [column][row]
  hardware_rules: HardwareRule[];
  edge_banding_map: EdgeBandingMap;
}

type SlotType = 'open' | 'shelf' | 'door_single' | 'door_double' |
                'lift_up' | 'drawer' | 'pull_out' | 'glass_insert';
```

### ParametricBuilder
At runtime, `ParametricBuilder.ts` compiles `FurnitureSchema` + user config into Babylon.js geometry:

1. Each panel rendered as `BoxMesh` at precise computed dimensions
2. CSG operations: handle cutouts, hinge pockets, cable grommets subtracted from panels
3. Hardware instances: hinges, handles, drawer slides placed at rule-computed positions
4. `BoundingBox` → Havok collision body for room placement

### Room Placement
- Furniture dragged into room via pointer events
- Havok physics: collision detection prevents overlap
- Wall-snap: furniture auto-aligns to nearest wall within 50mm
- Gap warnings displayed in HUD when clearance < 100mm

---

## Module 3 — Material System (PBR)

### Material Catalog Structure
```
MaterialCatalog
├── Category: Laminate
│   ├── material_id, name, sku
│   ├── thickness_options: [16mm, 18mm, 22mm]
│   ├── price_per_m2 (with per-tenant override)
│   └── PBR maps: albedo, normal, roughness (G channel), AO
├── Category: Veneer
├── Category: MDF
├── Category: Glass
├── Category: Metal
└── Category: Custom (manufacturer-uploaded)
```

### Babylon.js PBRMaterial Setup
```typescript
const mat = new PBRMaterial("oak", scene);
mat.albedoTexture   = new Texture(s3.albedo);
mat.bumpTexture     = new Texture(s3.normal);
mat.metallicTexture = new Texture(s3.roughness); // G=roughness, B=metallic
mat.ambientTexture  = new Texture(s3.ao);
// Grain direction: per-panel UV rotation
mat.albedoTexture.uAng = panel.grainRotation; // 0 or Math.PI/2
```

**Material switching** is instant — only the `PBRMaterial` reference swaps, no mesh rebuild.

### Manufacturer Custom Upload Flow
1. Manufacturer uploads ZIP: `albedo.png` + `normal.png` + `roughness.png` + `ao.png`
2. FastAPI validates format and minimum resolution (1024×1024)
3. Files uploaded to S3 under `tenant/{id}/materials/{material_id}/`
4. Material record created in PostgreSQL
5. Available in configurator immediately

---

## Module 4 — Pricing Engine

```python
def calculate_pricing(config: FurnitureConfig, tenant: Tenant) -> PricingResponse:
    panel_cost = sum(
        (panel.width_mm * panel.height_mm / 1_000_000) * material.price_per_m2
        for panel in config.panels
    )
    edge_cost = sum(
        panel.banded_perimeter_mm * edgebanding.price_per_mm
        for panel in config.panels
    )
    hardware_cost = sum(
        item.unit_price * item.quantity
        for item in config.hardware_list
    )
    labor_cost = config.furniture_type.labor_rate * len(config.panels)
    subtotal = panel_cost + edge_cost + hardware_cost + labor_cost
    total = subtotal * (1 + tenant.margin_pct / 100)

    return PricingResponse(
        panel_cost=panel_cost,
        edge_cost=edge_cost,
        hardware_cost=hardware_cost,
        labor_cost=labor_cost,
        subtotal=subtotal,
        total=total,
        breakdown=config.panels  # per-panel detail
    )
```

---

## Module 5 — BOM Engine

Produces a structured cut list per furniture piece:

| Panel | Material | Thickness | W (mm) | H (mm) | Qty | Edge: L/R/T/B | Area m² |
|---|---|---|---|---|---|---|---|
| Left Side | Oak Laminate | 18mm | 580 | 2100 | 2 | T, B | 1.22 |
| Shelf | Oak Laminate | 18mm | 544 | 400 | 6 | L, R | 1.31 |
| Back Panel | HDF | 8mm | 544 | 2064 | 1 | — | 1.12 |

Hardware list produced separately: hinge type + count, handle type + count, drawer slide type + count, cam locks, shelf pins.

---

## Module 6 — Export Pipeline

| Format | Library | Recipient | Content |
|---|---|---|---|
| DXF | `ezdxf` | CNC operator | Per-panel drawing with dimensions, annotations, grain direction arrows |
| PDF | `WeasyPrint` | Client | 3D render screenshot + BOM table + pricing breakdown |
| SVG | `svgwrite` + nesting | Production | Panel cut optimization layout (minimizes sheet waste) |
| JSON | native | ERP/CRM | Full machine-readable config + presigned S3 URLs |

### ERP/CRM Webhook Bridge
```
Order confirmed
  → WebhookDispatcher
    → Bitrix24 REST API (deal + contact creation)
    → 1C XML export (optional, per-tenant toggle)
    → Custom webhook URL (per-tenant config)
    → Payload includes S3 presigned URLs for DXF + PDF (72h expiry)
```

---

## Data Model

```sql
tenants (
  id UUID PRIMARY KEY,
  name TEXT,
  margin_pct NUMERIC,
  webhook_url TEXT,
  crm_config JSONB          -- Bitrix24 tokens, 1C endpoint, custom headers
);

users (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants,  -- NULL for admin role (cross-tenant)
  email TEXT UNIQUE,
  role TEXT CHECK (role IN ('admin','manufacturer','designer','consumer')),
  password_hash TEXT
);

material_catalog (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants,  -- NULL = global library
  category TEXT,
  name TEXT,
  sku TEXT,
  thickness_options INTEGER[],
  price_per_m2 NUMERIC,
  edgebanding_price_per_mm NUMERIC,
  s3_albedo TEXT,
  s3_normal TEXT,
  s3_roughness TEXT,
  s3_ao TEXT,
  grain_direction TEXT CHECK (grain_direction IN ('horizontal','vertical','none'))
);

furniture_types (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants,  -- NULL = global template
  category TEXT,
  schema JSONB                         -- FurnitureSchema
);

projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  name TEXT,
  room_schema JSONB,                   -- RoomSchema
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

configurations (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects,
  furniture_type_id UUID REFERENCES furniture_types,
  applied_config JSONB,                -- user selections (dimensions, slots, materials)
  placement JSONB,                     -- position + rotation in room
  status TEXT CHECK (status IN ('draft','confirmed','in_production','completed'))
);

orders (
  id UUID PRIMARY KEY,
  configuration_id UUID REFERENCES configurations,
  pricing_snapshot JSONB,
  bom_snapshot JSONB,
  export_urls JSONB,                   -- { dxf, pdf, svg, json }
  crm_ref TEXT,                        -- Bitrix24 deal ID or 1C order ref
  created_at TIMESTAMPTZ
);
```

All parametric state (`applied_config`, `room_schema`) lives as JSONB in PostgreSQL — always reconstructible into a Babylon.js scene without any file system dependency.

---

## API Surface (key endpoints)

```
POST   /auth/login
POST   /auth/register

GET    /projects
POST   /projects
GET    /projects/{id}
PUT    /projects/{id}/room-schema

GET    /furniture-types?category=wardrobe
POST   /configurations
PUT    /configurations/{id}
POST   /configurations/{id}/confirm

POST   /pricing/calculate
POST   /bom/generate
POST   /export/dxf
POST   /export/pdf
POST   /export/svg

GET    /materials?tenant_id=...
POST   /materials/upload          -- multipart ZIP
PUT    /materials/{id}

GET    /orders
POST   /orders/{id}/dispatch-webhook
```

---

## Folder Structure

```
/
├── frontend/                    # Next.js 15
│   ├── app/
│   │   ├── (auth)/
│   │   ├── dashboard/
│   │   ├── projects/[id]/
│   │   │   ├── room-planner/
│   │   │   └── configurator/
│   │   └── admin/
│   ├── components/
│   │   ├── babylon/
│   │   │   ├── SceneProvider.tsx
│   │   │   ├── RoomBuilder.tsx
│   │   │   ├── ParametricBuilder.tsx
│   │   │   └── MaterialApplicator.tsx
│   │   ├── room-planner/
│   │   └── configurator/
│   └── store/                   # Zustand slices
│
├── backend/                     # FastAPI
│   ├── api/
│   │   ├── auth.py
│   │   ├── projects.py
│   │   ├── configurations.py
│   │   ├── materials.py
│   │   ├── pricing.py
│   │   ├── bom.py
│   │   ├── export.py
│   │   └── webhooks.py
│   ├── core/
│   │   ├── parametric/          # FurnitureSchema compiler
│   │   ├── pricing/
│   │   ├── bom/
│   │   └── export/              # ezdxf, WeasyPrint, svgwrite
│   ├── models/                  # SQLAlchemy models
│   └── schemas/                 # Pydantic schemas
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-08-furniture-constructor-design.md
```

---

## Open Questions (resolved)

| Question | Decision |
|---|---|
| 3D engine | Babylon.js (native CSG, Havok physics, PBR, enterprise-grade) |
| Backend language | Python / FastAPI (project baseline, ezdxf ecosystem) |
| Parametric state storage | JSONB in PostgreSQL |
| Material textures | S3-compatible storage, 4-map PBR sets |
| AR/VR | Post-V1 |
| Real-time collaboration | Post-V1 (Redis pub/sub groundwork laid) |
| WASM constraint engine | Post-V1 performance optimization |
